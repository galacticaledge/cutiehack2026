//! Session services and the client-safe session view.
use crate::answers::{attempts_allowed, is_locked};
use crate::anticheat::{SKETCH_FAILED, TelemetryEvent, compute_flags};
use crate::concepts::{Concept, public_concepts, reward_key, visible_concept};
use crate::config::Config;
use crate::context::{ProblemContext, problem_context};
use crate::error::{ApiResult, AppError};
use crate::models::{Event, Message, ProblemSession, Reward, User, new_id};
use crate::personalized::PRIVATE_PRACTICE_REASON;
use crate::problems::get_template;
use crate::proficiency::utc_day;
use crate::prompts::opening_message;
use crate::rewards::{CHAT_BASE, QUEST_BASE, bank_base, potential_reward};
use crate::rng::{hash_seed, random_seed};
use crate::solana::explorer_tx_url;
use crate::state::AppState;
use crate::verify::{Verdict, verdict_chips};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use sqlx::{Executor, PgPool, Postgres};
use std::collections::HashSet;
use std::ops::Range;

pub const DEMO_ACCOUNTS: [&str; 4] = ["demo", "copycat", "demo-b", "copycat-b"];

pub fn seed_for(cfg: &Config, username: &str, template_id: &str) -> i64 {
    if cfg.demo_fixed_seeds && DEMO_ACCOUNTS.contains(&username) {
        hash_seed(template_id)
    } else {
        random_seed()
    }
}

/// Whole tokens paid today.
pub async fn earned_today(state: &AppState, user_id: &str) -> anyhow::Result<f64> {
    let sum: Option<i64> = sqlx::query_scalar(
        "SELECT SUM(amount)::BIGINT FROM rewards WHERE user_id = $1 AND status = 'paid' AND created_at >= date_trunc('day', now())",
    )
    .bind(user_id)
    .fetch_one(&state.pool)
    .await?;
    Ok(state.cfg.from_base_units(sum.unwrap_or(0)))
}

/// A payout record for (user, template) from another session → Practice mode.
pub async fn reward_elsewhere(
    pool: &PgPool,
    user_id: &str,
    template_id: &str,
    session_id: &str,
) -> anyhow::Result<bool> {
    let found: Option<String> = sqlx::query_scalar("SELECT id FROM rewards WHERE user_id = $1 AND template_id = $2 AND session_id <> $3 LIMIT 1")
        .bind(user_id)
        .bind(template_id)
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    Ok(found.is_some())
}

/// Concepts the student has demonstrated: solved AND passed explain-back (paid or practice).
pub async fn mastered_concepts<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: &str,
) -> sqlx::Result<HashSet<String>> {
    let ids = sqlx::query_scalar(
        "SELECT DISTINCT s.concept_id FROM problem_sessions s JOIN concepts c ON c.id = s.concept_id
         WHERE s.user_id = $1 AND (c.owner_id IS NULL OR c.owner_id = s.user_id)
           AND s.source IN ('bank','quest') AND s.status = 'done' AND s.explain_passed",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    Ok(ids.into_iter().collect())
}

/// Concepts with any reward record (paid, minting, failed or forfeited).
pub async fn rewarded_concepts(pool: &PgPool, user_id: &str) -> anyhow::Result<HashSet<String>> {
    let ids = sqlx::query_scalar(
        "SELECT c.id FROM rewards r JOIN concepts c
           ON (r.template_id = c.bank_template_id OR r.template_id = 'concept:' || c.id)
         WHERE r.user_id = $1 AND c.owner_id IS NULL",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(ids.into_iter().collect())
}

/// A stored public concept and matching bank/quest key are required for any payout, even on retry.
pub(crate) async fn has_public_reward_key(pool: &PgPool, s: &ProblemSession) -> sqlx::Result<bool> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT FROM concepts c WHERE c.id = $1 AND c.owner_id IS NULL AND
           (($2 = 'bank' AND c.bank_template_id = $3) OR
            ($2 = 'quest' AND c.bank_template_id IS NULL AND 'concept:' || c.id = $3)))",
    )
    .bind(&s.concept_id)
    .bind(&s.source)
    .bind(&s.template_id)
    .fetch_one(pool)
    .await
}

/// New-topic rewards recorded today.
pub async fn topic_rewards_today(pool: &PgPool, user_id: &str) -> anyhow::Result<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM rewards WHERE user_id = $1 AND template_id LIKE 'concept:%' AND created_at >= date_trunc('day', now())",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?)
}

/// Why a generated problem on `c` can't earn right now, or None if it can.
pub async fn topic_block_reason(
    state: &AppState,
    user_id: &str,
    c: &Concept,
) -> anyhow::Result<Option<String>> {
    if c.is_private() {
        return Ok(Some(PRIVATE_PRACTICE_REASON.into()));
    }
    if reward_elsewhere(&state.pool, user_id, &reward_key(&c.id), "").await? {
        return Ok(Some(format!(
            "You've already earned on {}. This one is practice.",
            c.title
        )));
    }
    let mastered = mastered_concepts(&state.pool, user_id).await?;
    if !c.ready(&mastered) {
        let graph = public_concepts(&state.pool).await?;
        let names = c
            .prereqs
            .iter()
            .filter(|id| !mastered.contains(*id))
            .map(|id| {
                graph
                    .iter()
                    .find(|c| &c.id == id)
                    .map_or(id.as_str(), |prereq| prereq.title.as_str())
            })
            .collect::<Vec<_>>()
            .join(" and ");
        return Ok(Some(format!(
            "Master {names} first to unlock TARTS for {}. This one is practice.",
            c.title
        )));
    }
    if topic_rewards_today(&state.pool, user_id).await? >= state.cfg.daily_topic_cap {
        return Ok(Some(format!(
            "You've reached today's limit of {} new-topic rewards. This one is practice.",
            state.cfg.daily_topic_cap
        )));
    }
    Ok(None)
}

/// A quest built while its node couldn't pay (prerequisites, daily cap, already earned...).
pub fn is_practice_quest(s: &ProblemSession) -> bool {
    s.custom_ref
        .as_ref()
        .and_then(|r| r.get("practiceReason"))
        .is_some_and(|v| !v.is_null())
}

/// The quest to reopen for `c`. A practice quest isn't reopened once the node can pay:
/// the student gets a fresh problem that earns (earning quests still never reroll).
pub async fn reusable_quest(
    state: &AppState,
    user_id: &str,
    c: &Concept,
) -> anyhow::Result<Option<ProblemSession>> {
    let q = active_quest(&state.pool, user_id, c).await?;
    if let Some(s) = &q
        && is_practice_quest(s)
        && topic_block_reason(state, user_id, c).await?.is_none()
    {
        return Ok(None);
    }
    Ok(q)
}

/// Public quests never reroll. A private quest can be replaced once it has no attempts left;
/// the exhausted row, its attempts, and its messages remain available as history.
pub async fn active_quest<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: &str,
    concept: &Concept,
) -> anyhow::Result<Option<ProblemSession>> {
    let latest = sqlx::query_as::<_, ProblemSession>(
        "SELECT * FROM problem_sessions WHERE user_id = $1 AND source = 'quest' AND concept_id = $2 AND status IN ('active','solved')
         ORDER BY started_at DESC, id DESC LIMIT 1",
    )
    .bind(user_id)
    .bind(&concept.id)
    .fetch_optional(db)
    .await?;
    Ok(latest.filter(|s| {
        !concept.is_private() || s.status != "active" || !is_locked(s.wrong_attempts, s.hints_used)
    }))
}

pub async fn insert_message<'e>(
    db: impl Executor<'e, Database = Postgres>,
    session_id: &str,
    role: &str,
    content: &str,
    verdicts: Option<Value>,
) -> anyhow::Result<Message> {
    Ok(sqlx::query_as::<_, Message>("INSERT INTO messages (id, session_id, role, content, verdicts) VALUES ($1, $2, $3, $4, $5) RETURNING *")
        .bind(new_id())
        .bind(session_id)
        .bind(role)
        .bind(content)
        .bind(verdicts)
        .fetch_one(db)
        .await?)
}

pub async fn history(pool: &PgPool, session_id: &str) -> anyhow::Result<Vec<Message>> {
    Ok(sqlx::query_as::<_, Message>(
        "SELECT * FROM (SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 500) m ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await?)
}

pub async fn load_session(state: &AppState, id: &str, user_id: &str) -> ApiResult<ProblemSession> {
    sqlx::query_as(
        "SELECT s.* FROM problem_sessions s LEFT JOIN concepts c ON c.id = s.concept_id
         WHERE s.id = $1 AND s.user_id = $2 AND (c.owner_id IS NULL OR ($3 AND c.owner_id = s.user_id))",
    )
    .bind(id)
    .bind(user_id)
    .bind(state.cfg.personalized_concepts_enabled)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::not_found("Session not found."))
}

pub(crate) fn ensure_answer_unlocked(s: &ProblemSession) -> ApiResult<()> {
    if is_locked(s.wrong_attempts, s.hints_used) {
        let msg = if s.hints_used < 3 && s.source == "bank" {
            "The little door is locked. Drink the next bottle to find the key (2 more attempts)."
        } else {
            "You're out of attempts for this problem. Keep chatting with the tutor to understand it."
        };
        return Err(AppError::new(StatusCode::LOCKED, msg));
    }
    Ok(())
}

pub(crate) struct CheckedAnswer {
    pub wrong_attempts: i32,
    pub hints_used: i32,
    pub flagged: bool,
}

pub(crate) async fn record_checked_answer(
    pool: &PgPool,
    s: &ProblemSession,
    ctx: &ProblemContext,
    correct: bool,
) -> ApiResult<CheckedAnswer> {
    let mut tx = pool.begin().await?;
    // Serialize accepted answers and hints for this session, never tutor or grader calls.
    let current = sqlx::query_as::<_, ProblemSession>(
        "SELECT s.* FROM problem_sessions s JOIN concepts c ON c.id = s.concept_id
         WHERE s.id = $1 AND s.user_id = $2 AND (c.owner_id IS NULL OR c.owner_id = s.user_id)
         FOR NO KEY UPDATE OF s",
    )
    .bind(&s.id)
    .bind(&s.user_id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| AppError::not_found("Session not found."))?;
    if current.status != "active" {
        return Err(AppError::new(StatusCode::CONFLICT, "Already submitted."));
    }
    ensure_answer_unlocked(&current)?;

    let attempted_at: DateTime<Utc> = sqlx::query_scalar(
        "INSERT INTO answer_attempts (id, user_id, concept_id, session_id, correct, hints_used)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING attempted_at",
    )
    .bind(new_id())
    .bind(&current.user_id)
    .bind(&current.concept_id)
    .bind(&current.id)
    .bind(correct)
    .bind(current.hints_used)
    .fetch_one(&mut *tx)
    .await?;

    let mut wrong_attempts = current.wrong_attempts;
    let mut flagged = false;
    if correct {
        let evs = sqlx::query_as::<_, Event>(
            "SELECT * FROM events WHERE session_id = $1 AND type IN ('hidden','visible','paste')",
        )
        .bind(&current.id)
        .fetch_all(&mut *tx)
        .await?;
        let telemetry: Vec<TelemetryEvent> = evs
            .into_iter()
            .map(|e| TelemetryEvent {
                kind: e.kind,
                target: e.data["target"].as_str().map(String::from),
                at: e.created_at,
            })
            .collect();
        let mut flags = compute_flags(
            current.started_at,
            attempted_at,
            ctx.min_solve_seconds,
            &telemetry,
        );
        let last_sketch: Option<Value> = sqlx::query_scalar("SELECT data FROM events WHERE session_id = $1 AND type = 'sketch' ORDER BY created_at DESC LIMIT 1")
            .bind(&current.id)
            .fetch_optional(&mut *tx)
            .await?;
        if last_sketch.is_some_and(|d| d["sound"] == false) {
            flags.push(SKETCH_FAILED);
        }
        flagged = !flags.is_empty();
        // A solved session must already have its flags available when explain-back reads it.
        sqlx::query("INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, 'solve', $3)")
            .bind(new_id())
            .bind(&current.id)
            .bind(json!({ "flags": flags }))
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE problem_sessions SET status = 'solved', solved_at = $2 WHERE id = $1")
            .bind(&current.id)
            .bind(attempted_at)
            .execute(&mut *tx)
            .await?;
    } else {
        wrong_attempts = sqlx::query_scalar(
            "UPDATE problem_sessions SET wrong_attempts = wrong_attempts + 1 WHERE id = $1 RETURNING wrong_attempts",
        )
        .bind(&current.id)
        .fetch_one(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(CheckedAnswer {
        wrong_attempts,
        hints_used: current.hints_used,
        flagged,
    })
}

pub async fn create_bank_session(
    state: &AppState,
    user: &User,
    template_id: &str,
    from_session_id: Option<&str>,
) -> ApiResult<ProblemSession> {
    let t = get_template(template_id).ok_or_else(|| AppError::bad("Unknown problem."))?;
    let s = sqlx::query_as::<_, ProblemSession>(
        "INSERT INTO problem_sessions (id, user_id, source, template_id, seed, from_session_id, concept_id)
         VALUES ($1, $2, 'bank', $3, $4, $5, (SELECT id FROM concepts WHERE bank_template_id = $3)) RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(t.id)
    .bind(seed_for(&state.cfg, &user.username, t.id))
    .bind(from_session_id)
    .fetch_one(&state.pool)
    .await?;
    let ctx = problem_context(&s)?;
    insert_message(&state.pool, &s.id, "tutor", opening_message(&ctx), None).await?;
    Ok(s)
}

pub fn reward_json(cfg: &Config, r: &Reward) -> Value {
    json!({
        "amount": cfg.from_base_units(r.amount),
        "status": r.status,
        "breakdown": r.breakdown.get("summary").and_then(|s| s.as_str()).unwrap_or_default(),
        "flags": r.flags,
        "explorerUrl": r.tx_sig.as_deref().map(explorer_tx_url),
    })
}

#[derive(sqlx::FromRow)]
struct SessionWithAttempts {
    #[sqlx(flatten)]
    session: ProblemSession,
    attempts_today: i64,
}

// Read the counter and session status from the same snapshot.
async fn load_session_with_attempts(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    today: &Range<DateTime<Utc>>,
    allow_private: bool,
) -> ApiResult<SessionWithAttempts> {
    sqlx::query_as(
        "SELECT s.*, (SELECT COUNT(*) FROM answer_attempts a
                      WHERE a.session_id = s.id AND a.attempted_at >= $3 AND a.attempted_at < $4)
                      AS attempts_today
         FROM problem_sessions s LEFT JOIN concepts c ON c.id = s.concept_id
         WHERE s.id = $1 AND s.user_id = $2 AND (c.owner_id IS NULL OR ($5 AND c.owner_id = s.user_id))",
    )
    .bind(id)
    .bind(user_id)
    .bind(today.start)
    .bind(today.end)
    .bind(allow_private)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Session not found."))
}

/// Client-safe state. NEVER includes the answer, checkpoints or customRef.
pub async fn session_view(state: &AppState, id: &str, user_id: &str) -> ApiResult<Value> {
    let today = utc_day(Utc::now());
    let SessionWithAttempts {
        session: s,
        attempts_today,
    } = load_session_with_attempts(
        &state.pool,
        id,
        user_id,
        &today,
        state.cfg.personalized_concepts_enabled,
    )
    .await?;
    let ctx = problem_context(&s)?;
    let concept = if let Some(concept_id) = &s.concept_id {
        visible_concept(&state.pool, user_id, concept_id).await?
    } else {
        None
    };
    let messages = history(&state.pool, &s.id).await?;
    let is_bank = ctx.is_bank();
    let earns = ctx.earns();
    let public_reward = earns && has_public_reward_key(&state.pool, &s).await?;
    let reward = if public_reward {
        sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE session_id = $1")
            .bind(&s.id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        None
    };
    let practice_reason = if concept.as_ref().is_some_and(Concept::is_private) {
        Some(PRIVATE_PRACTICE_REASON.to_owned())
    } else {
        ctx.custom_ref.practice_reason.clone()
    };
    let practice = !public_reward
        || practice_reason.is_some()
        || reward_elsewhere(
            &state.pool,
            user_id,
            s.template_id.as_deref().unwrap_or_default(),
            &s.id,
        )
        .await?;
    let title = if let Some(c) = concept.as_ref().filter(|_| ctx.is_quest()) {
        format!("New topic: {}", c.title)
    } else {
        ctx.title.clone()
    };
    let base = if ctx.is_quest() {
        QUEST_BASE
    } else {
        bank_base(ctx.difficulty)
    };
    let matched = ctx
        .custom_ref
        .matched_template_id
        .as_deref()
        .and_then(get_template);

    // Open chat on a public node without a bank problem: offer the node's checked problem.
    let claim = match concept.as_ref() {
        Some(c)
            if s.source.starts_with("custom_")
                && !c.is_private()
                && c.bank_template_id.is_none() =>
        {
            let reason = topic_block_reason(state, user_id, c).await?;
            Some(json!({
                "conceptId": c.id,
                "title": c.title,
                "reason": reason,
                // What a clean claim pays (the quest base); 0 while the node can't pay.
                "reward": if reason.is_none() { QUEST_BASE as i64 } else { 0 },
                // Earn right here: explain it in your own words (see routes::testify).
                "chatReward": if reason.is_none() { CHAT_BASE as i64 } else { 0 },
                "testimonyTriesLeft": crate::routes::CHAT_TESTIMONY_TRIES
                    - crate::routes::chat_testimony_tries(&state.pool, &s.id).await?,
                "earnedHere": sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE session_id = $1")
                    .bind(&s.id)
                    .fetch_optional(&state.pool)
                    .await?
                    .map(|r| reward_json(&state.cfg, &r)),
                "existingSessionId": active_quest(&state.pool, user_id, c)
                    .await?
                    .filter(|q| !(reason.is_none() && is_practice_quest(q)))
                    .map(|q| q.id),
            }))
        }
        _ => None,
    };

    let msgs: Vec<Value> = messages
        .iter()
        .map(|m| {
            let verdicts: Vec<Verdict> = m.verdicts.clone().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
            json!({
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "createdAt": m.created_at,
                "verdicts": if m.role == "user" { serde_json::to_value(verdict_chips(&verdicts)).unwrap_or(json!([])) } else { json!([]) },
            })
        })
        .collect();

    Ok(json!({
        "id": s.id,
        "source": s.source,
        "templateId": if is_bank { s.template_id.clone() } else { None },
        "conceptId": concept.as_ref().map(|c| &c.id),
        "checkedBy": ctx.custom_ref.quest.as_ref().map(|q| if q.ran_in_sandbox { "sandbox" } else { "engine" }),
        "title": title,
        "prompt": ctx.display_prompt,
        "difficulty": ctx.difficulty,
        // Number of machine-checkable steps (never their values): drives the Cheshire grin's progress.
        "checkpointCount": ctx.checkpoints.iter().filter(|c| c.id != "final").count(),
        "startedAt": s.started_at,
        "solvedAt": s.solved_at,
        "hintsUsed": s.hints_used,
        "revealedHints": ctx.hints.iter().take(s.hints_used.max(0) as usize).collect::<Vec<_>>(),
        "wrongAttempts": s.wrong_attempts,
        "attemptsToday": attempts_today,
        "attemptsDateUtc": today.start.date_naive().to_string(),
        "attemptsLeft": if earns { Some((attempts_allowed(s.hints_used) - s.wrong_attempts).max(0)) } else { None },
        "locked": earns && is_locked(s.wrong_attempts, s.hints_used),
        "status": s.status,
        "practice": practice,
        "practiceReason": practice_reason,
        "potentialReward": if earns && !practice { potential_reward(base, s.hints_used, s.wrong_attempts) } else { 0 },
        "hasAnswerCheck": earns || ctx.answer.is_some(),
        "explainPassed": s.explain_passed,
        "explainFeedback": s.explain_feedback,
        // Tries left at the trial (only meaningful once solved and before the final testimony).
        "testimonyTriesLeft": if s.status == "solved" {
            crate::routes::TESTIMONY_TRIES - crate::routes::testimony_tries(&state.pool, &s.id).await?
        } else {
            crate::routes::TESTIMONY_TRIES
        },
        "explanation": s.explanation, // the student's own testimony (for the share card)
        "reward": reward.as_ref().map(|r| reward_json(&state.cfg, r)),
        "claim": claim,
        "matchedTemplate": if !is_bank { matched.map(|t| json!({ "id": t.id, "title": t.title })) } else { None },
        "messages": msgs,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proficiency::concept_progress;

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn attempt_counts_use_utc_boundaries_and_the_right_scope(pool: PgPool) {
        sqlx::query("INSERT INTO users (id, username, wallet_pubkey, wallet_secret) VALUES ('u', 'u', 'pub', 'test'), ('v', 'v', 'pub-v', 'test')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO problem_sessions (id, user_id, template_id) VALUES
            ('s', 'u', 'alg-linear-1'), ('s2', 'u', 'alg-linear-1'), ('other', 'v', 'alg-linear-1')")
            .execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO answer_attempts (id, user_id, session_id, concept_id, attempted_at, correct, hints_used)
             VALUES ('before', 'u', 's', 'linear-equations', '2026-03-08 23:59:59.999999+00', false, 0),
                    ('start', 'u', 's', 'linear-equations', '2026-03-09 00:00:00+00', false, 0),
                    ('last', 'u', 's2', 'linear-equations', '2026-03-09 23:59:59.999999+00', true, 0),
                    ('next', 'u', 's', 'linear-equations', '2026-03-10 00:00:00+00', true, 0),
                    ('other', 'v', 'other', 'linear-equations', '2026-03-09 00:00:00+00', true, 0)",
        ).execute(&pool).await.unwrap();
        let today = utc_day("2026-03-09T09:00:00Z".parse().unwrap());
        let view = load_session_with_attempts(&pool, "s", "u", &today, false)
            .await
            .unwrap();
        assert_eq!(view.attempts_today, 1);
        let progress = concept_progress(&pool, "u", &today).await.unwrap();
        assert_eq!(progress["linear-equations"].attempts_today, 2);
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn checked_answer_counts_are_atomic_under_concurrency(pool: PgPool) {
        sqlx::query("INSERT INTO users (id, username, wallet_pubkey, wallet_secret) VALUES ('u', 'u', 'pub', 'test')")
            .execute(&pool).await.unwrap();
        let s = sqlx::query_as::<_, ProblemSession>(
            "INSERT INTO problem_sessions (id, user_id, template_id, concept_id, wrong_attempts)
             VALUES ('s', 'u', 'alg-linear-1', 'linear-equations', 4) RETURNING *",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let ctx = problem_context(&s).unwrap();
        // Keep a fixed counting window even if the test straddles UTC midnight.
        let window =
            Utc::now() - chrono::Duration::minutes(1)..Utc::now() + chrono::Duration::minutes(1);
        let view = || load_session_with_attempts(&pool, &s.id, &s.user_id, &window, false);
        assert_eq!(view().await.unwrap().attempts_today, 0);
        let (a, b) = tokio::join!(
            record_checked_answer(&pool, &s, &ctx, false),
            record_checked_answer(&pool, &s, &ctx, false),
        );
        let (accepted, rejected) = match (a, b) {
            (Ok(a), Err(b)) | (Err(b), Ok(a)) => (a, b),
            _ => panic!("expected exactly one accepted wrong answer"),
        };
        assert_eq!(accepted.wrong_attempts, 5);
        assert_eq!(rejected.status, StatusCode::LOCKED);
        assert_eq!(view().await.unwrap().attempts_today, 1);

        sqlx::query("UPDATE problem_sessions SET hints_used = 1 WHERE id = 's'")
            .execute(&pool)
            .await
            .unwrap();
        // A failed solve event insert rolls back the correct attempt too.
        sqlx::query("ALTER TABLE events ADD CONSTRAINT test_reject_solve CHECK (type <> 'solve')")
            .execute(&pool)
            .await
            .unwrap();
        let err = record_checked_answer(&pool, &s, &ctx, true)
            .await
            .err()
            .unwrap();
        assert_eq!(err.status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(view().await.unwrap().session.status, "active");
        assert_eq!(view().await.unwrap().attempts_today, 1);
        sqlx::query("ALTER TABLE events DROP CONSTRAINT test_reject_solve")
            .execute(&pool)
            .await
            .unwrap();

        let (a, b) = tokio::join!(
            record_checked_answer(&pool, &s, &ctx, true),
            record_checked_answer(&pool, &s, &ctx, true),
        );
        let (accepted, rejected) = match (a, b) {
            (Ok(a), Err(b)) | (Err(b), Ok(a)) => (a, b),
            _ => panic!("expected exactly one accepted correct answer"),
        };
        assert_eq!(accepted.hints_used, 1);
        assert_eq!(rejected.status, StatusCode::CONFLICT);
        let attempts: Vec<(bool, i32, DateTime<Utc>)> = sqlx::query_as(
            "SELECT correct, hints_used, attempted_at FROM answer_attempts WHERE session_id = 's' ORDER BY correct",
        ).fetch_all(&pool).await.unwrap();
        let view = view().await.unwrap();
        let solved = view.session;
        assert_eq!(solved.status, "solved");
        assert_eq!(solved.wrong_attempts, 5);
        assert_eq!(attempts.len(), 2);
        assert_eq!((attempts[0].0, attempts[0].1), (false, 0));
        assert_eq!((attempts[1].0, attempts[1].1), (true, 1));
        assert_eq!(solved.solved_at, Some(attempts[1].2));
        assert_eq!(view.attempts_today, 2);
        let progress = concept_progress(&pool, &s.user_id, &window).await.unwrap();
        assert_eq!(progress["linear-equations"].attempts_today, 2);
    }
}
