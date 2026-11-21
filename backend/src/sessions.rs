//! Session services and the client-safe session view.
use crate::answers::{attempts_allowed, is_locked};
use crate::concepts::{Concept, concept_of_key, missing_prereqs, reward_key};
use crate::config::Config;
use crate::context::problem_context;
use crate::error::{ApiResult, AppError};
use crate::models::{Message, ProblemSession, Reward, User, new_id};
use crate::problems::get_template;
use crate::prompts::opening_message;
use crate::rewards::{QUEST_BASE, bank_base, potential_reward};
use crate::rng::{hash_seed, random_seed};
use crate::solana::explorer_tx_url;
use crate::state::AppState;
use crate::verify::{Verdict, verdict_chips};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::collections::HashSet;

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
pub async fn mastered_concepts(pool: &PgPool, user_id: &str) -> anyhow::Result<HashSet<String>> {
    let keys: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT template_id FROM problem_sessions
         WHERE user_id = $1 AND source IN ('bank','quest') AND status = 'done' AND explain_passed AND template_id IS NOT NULL",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(keys
        .iter()
        .filter_map(|k| concept_of_key(k))
        .map(String::from)
        .collect())
}

/// Concepts with any reward record (paid, minting, failed or forfeited).
pub async fn rewarded_concepts(pool: &PgPool, user_id: &str) -> anyhow::Result<HashSet<String>> {
    let keys: Vec<String> =
        sqlx::query_scalar("SELECT template_id FROM rewards WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(pool)
            .await?;
    Ok(keys
        .iter()
        .filter_map(|k| concept_of_key(k))
        .map(String::from)
        .collect())
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
    if reward_elsewhere(&state.pool, user_id, &reward_key(c.id), "").await? {
        return Ok(Some(format!(
            "You've already earned on {}. This one is practice.",
            c.title
        )));
    }
    let missing = missing_prereqs(c.id, &mastered_concepts(&state.pool, user_id).await?);
    if !missing.is_empty() {
        let names = missing
            .iter()
            .map(|m| m.title)
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

/// An unfinished generated problem on this concept. Reused instead of generating a new one,
/// so a student can't reroll until they get an easy problem.
pub async fn active_quest(
    pool: &PgPool,
    user_id: &str,
    concept_id: &str,
) -> anyhow::Result<Option<ProblemSession>> {
    Ok(sqlx::query_as::<_, ProblemSession>(
        "SELECT * FROM problem_sessions WHERE user_id = $1 AND source = 'quest' AND template_id = $2 AND status IN ('active','solved')
         ORDER BY started_at DESC LIMIT 1",
    )
    .bind(user_id)
    .bind(reward_key(concept_id))
    .fetch_optional(pool)
    .await?)
}

pub async fn insert_message(
    pool: &PgPool,
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
        .fetch_one(pool)
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

pub async fn load_session(pool: &PgPool, id: &str, user_id: &str) -> ApiResult<ProblemSession> {
    let s = sqlx::query_as::<_, ProblemSession>("SELECT * FROM problem_sessions WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    match s {
        Some(s) if s.user_id == user_id => Ok(s),
        _ => Err(AppError::not_found("Session not found.")),
    }
}

pub async fn create_bank_session(
    state: &AppState,
    user: &User,
    template_id: &str,
    from_session_id: Option<&str>,
) -> ApiResult<ProblemSession> {
    if get_template(template_id).is_none() {
        return Err(AppError::bad("Unknown problem."));
    }
    let s = sqlx::query_as::<_, ProblemSession>(
        "INSERT INTO problem_sessions (id, user_id, source, template_id, seed, from_session_id) VALUES ($1, $2, 'bank', $3, $4, $5) RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(template_id)
    .bind(seed_for(&state.cfg, &user.username, template_id))
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

/// Client-safe state. NEVER includes the answer, checkpoints or customRef.
pub async fn session_view(state: &AppState, s: &ProblemSession) -> ApiResult<Value> {
    let ctx = problem_context(s)?;
    let messages = history(&state.pool, &s.id).await?;
    let reward = sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE session_id = $1")
        .bind(&s.id)
        .fetch_optional(&state.pool)
        .await?;
    let is_bank = ctx.is_bank();
    let earns = ctx.earns();
    let practice_reason = ctx.custom_ref.practice_reason.clone();
    let practice = if earns {
        practice_reason.is_some()
            || reward_elsewhere(
                &state.pool,
                &s.user_id,
                s.template_id.as_deref().unwrap_or_default(),
                &s.id,
            )
            .await?
    } else {
        true
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
        "conceptId": ctx.custom_ref.concept_id,
        "checkedBy": ctx.custom_ref.quest.as_ref().map(|q| if q.ran_in_sandbox { "sandbox" } else { "engine" }),
        "title": ctx.title,
        "prompt": ctx.display_prompt,
        "difficulty": ctx.difficulty,
        // Number of machine-checkable steps (never their values): drives the Cheshire grin's progress.
        "checkpointCount": ctx.checkpoints.iter().filter(|c| c.id != "final").count(),
        "startedAt": s.started_at,
        "solvedAt": s.solved_at,
        "hintsUsed": s.hints_used,
        "revealedHints": ctx.hints.iter().take(s.hints_used.max(0) as usize).collect::<Vec<_>>(),
        "wrongAttempts": s.wrong_attempts,
        "attemptsLeft": if earns { Some((attempts_allowed(s.hints_used) - s.wrong_attempts).max(0)) } else { None },
        "locked": earns && is_locked(s.wrong_attempts, s.hints_used),
        "status": s.status,
        "practice": practice,
        "practiceReason": practice_reason,
        "potentialReward": if earns && !practice { potential_reward(base, s.hints_used, s.wrong_attempts) } else { 0 },
        "hasAnswerCheck": earns || ctx.answer.is_some(),
        "explainPassed": s.explain_passed,
        "explainFeedback": s.explain_feedback,
        "explanation": s.explanation, // the student's own testimony (for the share card)
        "reward": reward.as_ref().map(|r| reward_json(&state.cfg, r)),
        "matchedTemplate": if !is_bank { matched.map(|t| json!({ "id": t.id, "title": t.title })) } else { None },
        "messages": msgs,
    }))
}
