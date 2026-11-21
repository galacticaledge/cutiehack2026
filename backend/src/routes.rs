//! HTTP API (SPEC §13). JSON everywhere. No response ever includes the answer.
use crate::answers::{is_correct, is_locked, parse_answer};
use crate::anticheat::{SKETCH_FAILED, TelemetryEvent, compute_flags};
use crate::auth::{AuthUser, COOKIE, session_cookie};
use crate::claims::verify_message;
use crate::concepts::{CONCEPTS, bank_template_for, missing_prereqs, reward_key};
use crate::context::CustomRef;
use crate::context::problem_context;
use crate::custom::{CUSTOM_MAX, classify_topic, generate_quest, intake_problem};
use crate::error::{ApiResult, AppError};
use crate::llm::{Kind, complete_json};
use crate::models::{Event, Message, ProblemSession, Reward, User, new_id};
use crate::problems::{TEMPLATES, get_template};
use crate::prompts::{self, opening_message};
use crate::resources::learn_more_links;
use crate::rewards::{QUEST_BASE, RewardInput, RewardStatus, bank_base, compute_reward};
use crate::rng::random_seed;
use crate::sessions::*;
use crate::solana::{explorer_address_url, explorer_tx_url, generate_user_wallet};
use crate::state::AppState;
use crate::tts::synthesize;
use crate::tutor::tutor_reply;
use crate::verify::{sketch_line, stated_final, verdict_chips, verdict_lines};
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/problems", get(problems))
        .route("/api/concepts", get(concepts))
        .route("/api/journal", get(journal))
        .route("/api/features", get(features))
        .route("/api/tts", post(tts))
        .route("/api/sessions", post(create_session))
        .route("/api/sessions/{id}", get(get_session))
        .route("/api/sessions/{id}/similar", post(similar))
        .route("/api/sessions/{id}/chat", post(chat))
        .route("/api/sessions/{id}/hint", post(hint))
        .route("/api/sessions/{id}/answer", post(answer))
        .route("/api/sessions/{id}/explain", post(explain))
        .route("/api/sessions/{id}/events", post(events))
        .route("/api/sessions/{id}/resources", get(resources))
}

type J = Json<Value>;

// ---------- auth ----------

#[derive(Deserialize)]
struct LoginBody {
    username: Option<String>,
}

async fn login(
    State(st): State<AppState>,
    jar: CookieJar,
    Json(b): Json<LoginBody>,
) -> ApiResult<(CookieJar, J)> {
    let username = b.username.unwrap_or_default().trim().to_lowercase();
    let valid = (2..=24).contains(&username.len())
        && username
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_');
    if !valid {
        return Err(AppError::bad(
            "Usernames are 2–24 characters: letters, numbers, - and _.",
        ));
    }
    let user = match sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&st.pool)
        .await?
    {
        Some(u) => u,
        None => {
            let (pubkey, secret) = generate_user_wallet();
            sqlx::query("INSERT INTO users (id, username, wallet_pubkey, wallet_secret) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING")
                .bind(new_id())
                .bind(&username)
                .bind(&pubkey)
                .bind(&secret)
                .execute(&st.pool)
                .await?;
            sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
                .bind(&username)
                .fetch_one(&st.pool)
                .await?
        }
    };
    let jar = jar.add(session_cookie(&st, &user.id));
    Ok((
        jar,
        Json(json!({ "username": user.username, "walletPubkey": user.wallet_pubkey })),
    ))
}

async fn logout(jar: CookieJar) -> (CookieJar, J) {
    (
        jar.remove(Cookie::build(COOKIE).path("/")),
        Json(json!({ "ok": true })),
    )
}

async fn me(State(st): State<AppState>, AuthUser(user): AuthUser) -> ApiResult<J> {
    let on_chain = match &st.solana {
        Some(s) => s.token_balance(&user.wallet_pubkey).await,
        None => None,
    };
    let (balance, source) = match on_chain {
        Some(b) => (b, "chain"),
        None => {
            let sum: Option<i64> = sqlx::query_scalar(
                "SELECT SUM(amount)::BIGINT FROM rewards WHERE user_id = $1 AND status = 'paid'",
            )
            .bind(&user.id)
            .fetch_one(&st.pool)
            .await?;
            (st.cfg.from_base_units(sum.unwrap_or(0)), "db")
        }
    };
    Ok(Json(json!({
        "username": user.username,
        "walletPubkey": user.wallet_pubkey,
        "walletUrl": explorer_address_url(&user.wallet_pubkey),
        "balance": balance,
        "balanceSource": source,
        "earnedToday": earned_today(&st, &user.id).await?,
        "dailyCap": st.cfg.daily_cap,
    })))
}

async fn problems(State(st): State<AppState>, AuthUser(user): AuthUser) -> ApiResult<J> {
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT template_id, status FROM rewards WHERE user_id = $1")
            .bind(&user.id)
            .fetch_all(&st.pool)
            .await?;
    let list: Vec<Value> = TEMPLATES
        .iter()
        .map(|t| {
            let status = rows
                .iter()
                .find(|(id, _)| id == t.id)
                .map(|(_, s)| s.clone());
            json!({
                "id": t.id,
                "title": t.title,
                "concept": t.concept,
                "difficulty": t.difficulty,
                "earned": status.as_deref() == Some("paid"),
                "rewardStatus": status,
                "maxReward": 100 * t.difficulty,
            })
        })
        .collect();
    Ok(Json(Value::Array(list)))
}

/// Dream journal: the user's finished verified problems, newest first. Never includes answers.
async fn journal(State(st): State<AppState>, AuthUser(user): AuthUser) -> ApiResult<J> {
    let sessions = sqlx::query_as::<_, ProblemSession>(
        "SELECT * FROM problem_sessions WHERE user_id = $1 AND source = 'bank' AND status = 'done' ORDER BY solved_at DESC NULLS LAST LIMIT 100",
    )
    .bind(&user.id)
    .fetch_all(&st.pool)
    .await?;
    let rewards = sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE user_id = $1")
        .bind(&user.id)
        .fetch_all(&st.pool)
        .await?;
    let entries: Vec<Value> = sessions
        .iter()
        .filter_map(|s| {
            let t = get_template(s.template_id.as_deref()?)?;
            let reward = rewards.iter().find(|r| r.session_id == s.id);
            Some(json!({
                "sessionId": s.id,
                "templateId": t.id,
                "title": t.title,
                "difficulty": t.difficulty,
                "startedAt": s.started_at,
                "solvedAt": s.solved_at,
                "hintsUsed": s.hints_used,
                "wrongAttempts": s.wrong_attempts,
                "explanation": s.explanation,
                "explainPassed": s.explain_passed,
                "explainFeedback": s.explain_feedback,
                "reward": reward.map(|r| reward_json(&st.cfg, r)),
            }))
        })
        .collect();
    Ok(Json(Value::Array(entries)))
}

async fn features(State(st): State<AppState>) -> J {
    Json(json!({
        "tts": st.cfg.tts_enabled(),
        "learnMore": st.cfg.resources_enabled(),
        "llmProvider": st.cfg.active_llm_provider(),
        "solana": st.solana.is_some(),
        "codeRunner": st.cfg.code_runner_enabled(),
    }))
}

// ---------- sessions ----------

#[derive(Deserialize)]
struct CustomBody {
    kind: Option<String>,
    text: Option<String>,
}

#[derive(Deserialize)]
struct CreateBody {
    #[serde(rename = "templateId")]
    template_id: Option<String>,
    custom: Option<CustomBody>,
}

async fn create_session(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Json(b): Json<CreateBody>,
) -> ApiResult<J> {
    if let Some(c) = b.custom {
        let kind = match c.kind.as_deref() {
            Some("problem") => "problem",
            Some("topic") => "topic",
            _ => return Err(AppError::bad("Choose Problem or Topic.")),
        };
        let text = c.text.unwrap_or_default().trim().to_string();
        if text.is_empty() {
            return Err(AppError::bad("Paste a problem or name a topic first."));
        }
        if text.chars().count() > CUSTOM_MAX {
            return Err(AppError::bad(format!(
                "Please keep it under {CUSTOM_MAX} characters."
            )));
        }
        let custom_ref = if kind == "problem" {
            TopicOutcome::Practice(intake_problem(&st, &text).await)
        } else {
            topic_session(&st, &user, &text).await?
        };
        let custom_ref = match custom_ref {
            TopicOutcome::Session(id) => return Ok(Json(json!({ "sessionId": id }))),
            TopicOutcome::Practice(r) => r,
        };
        let s = sqlx::query_as::<_, ProblemSession>(
            "INSERT INTO problem_sessions (id, user_id, source, custom_text, custom_ref, template_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        )
        .bind(new_id())
        .bind(&user.id)
        .bind(if kind == "problem" { "custom_problem" } else { "custom_topic" })
        .bind(&text)
        .bind(serde_json::to_value(&custom_ref)?)
        .bind(custom_ref.matched_template_id.clone())
        .fetch_one(&st.pool)
        .await?;
        let ctx = problem_context(&s)?;
        insert_message(&st.pool, &s.id, "tutor", opening_message(&ctx), None).await?;
        return Ok(Json(json!({ "sessionId": s.id })));
    }
    let s = create_bank_session(
        &st,
        &user,
        b.template_id.as_deref().unwrap_or_default(),
        None,
    )
    .await?;
    Ok(Json(json!({ "sessionId": s.id })))
}

enum TopicOutcome {
    /// A generated problem on a knowledge-graph node (new or reused).
    Session(String),
    /// Practice-only custom session with this reference.
    Practice(CustomRef),
}

/// Topic → knowledge-graph node → generated, engine-checked problem when possible.
async fn topic_session(st: &AppState, user: &User, text: &str) -> ApiResult<TopicOutcome> {
    let class = classify_topic(st, text).await;
    let practice = |reason: Option<String>| CustomRef {
        academic: Some(class.academic),
        concept_id: class.concept.map(|c| c.id.to_string()),
        matched_template_id: class
            .concept
            .and_then(|c| bank_template_for(c.id))
            .map(String::from),
        practice_reason: reason,
        ..Default::default()
    };
    if !class.academic {
        return Ok(TopicOutcome::Practice(practice(None)));
    }
    let Some(c) = class.concept else {
        return Ok(TopicOutcome::Practice(practice(Some(
            "This topic isn't on the knowledge map yet, so it's practice only.".into(),
        ))));
    };
    if bank_template_for(c.id).is_some() {
        return Ok(TopicOutcome::Practice(practice(Some(format!(
            "{} has a verified problem in the bank. Use the button below to earn TARTS on it.",
            c.title
        )))));
    }
    if let Some(existing) = active_quest(&st.pool, &user.id, c.id).await? {
        return Ok(TopicOutcome::Session(existing.id));
    }
    let reason = topic_block_reason(st, &user.id, c).await?;
    let seed = random_seed();
    let Some(quest) = generate_quest(st, c, seed).await else {
        return Ok(TopicOutcome::Practice(practice(Some(
            "Couldn't build a checked problem for this topic right now, so it's practice only."
                .into(),
        ))));
    };
    let r = CustomRef {
        quest: Some(quest),
        ..practice(reason)
    };
    let s = sqlx::query_as::<_, ProblemSession>(
        "INSERT INTO problem_sessions (id, user_id, source, template_id, seed, custom_text, custom_ref) VALUES ($1, $2, 'quest', $3, $4, $5, $6) RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(reward_key(c.id))
    .bind(seed)
    .bind(text)
    .bind(serde_json::to_value(&r)?)
    .fetch_one(&st.pool)
    .await?;
    let ctx = problem_context(&s)?;
    insert_message(&st.pool, &s.id, "tutor", opening_message(&ctx), None).await?;
    Ok(TopicOutcome::Session(s.id))
}

/// The knowledge map: every node with the student's status on it.
async fn concepts(State(st): State<AppState>, AuthUser(user): AuthUser) -> ApiResult<J> {
    let mastered = mastered_concepts(&st.pool, &user.id).await?;
    let rewarded = rewarded_concepts(&st.pool, &user.id).await?;
    let list: Vec<Value> = CONCEPTS
        .iter()
        .map(|c| {
            let status = if mastered.contains(c.id) {
                "mastered"
            } else if missing_prereqs(c.id, &mastered).is_empty() {
                "available"
            } else {
                "locked"
            };
            json!({
                "id": c.id,
                "title": c.title,
                "subject": c.subject,
                "prereqs": c.prereqs,
                "status": status,
                "rewarded": rewarded.contains(c.id),
                "bankTemplateId": bank_template_for(c.id),
            })
        })
        .collect();
    Ok(Json(json!({
        "concepts": list,
        "topicRewardsToday": topic_rewards_today(&st.pool, &user.id).await?,
        "dailyTopicCap": st.cfg.daily_topic_cap,
        "questBase": QUEST_BASE,
    })))
}

async fn get_session(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    Ok(Json(session_view(&st, &s).await?))
}

async fn similar(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    if s.source == "bank" {
        return Err(AppError::bad("This is already a verified problem."));
    }
    let ctx = problem_context(&s)?;
    let Some(matched) = ctx.custom_ref.matched_template_id else {
        return Err(AppError::not_found(
            "No verified problem matches this concept yet.",
        ));
    };
    let bank = create_bank_session(&st, &user, &matched, Some(&s.id)).await?;
    Ok(Json(json!({ "sessionId": bank.id })))
}

/// Used when a student proposes a final answer in chat and the guard blocks the drafts.
const FINAL_IN_CHAT: &str = "Sounds like you have a final answer in mind! I can't tell you whether it's right here. In a sentence, how did you get it? Just the general idea, not every step.";

#[derive(Deserialize)]
struct ChatBody {
    message: Option<String>,
}

async fn chat(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(b): Json<ChatBody>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    let message = b.message.unwrap_or_default().trim().to_string();
    if message.is_empty() {
        return Err(AppError::bad("Type a message first."));
    }
    if message.chars().count() > 2000 {
        return Err(AppError::bad("Please keep messages under 2000 characters."));
    }
    {
        let mut rate = st.chat_rate.lock().unwrap();
        let now = Instant::now();
        if rate
            .get(&user.id)
            .is_some_and(|t| now.duration_since(*t) < Duration::from_secs(2))
        {
            return Err(AppError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "No need to hurry like the White Rabbit. One message every 2 seconds.",
            ));
        }
        rate.insert(user.id.clone(), now);
    }
    let ctx = problem_context(&s)?;
    // Neuro-symbolic verification (bank: every checkpoint; generated topic problems: final-answer
    // detection only; custom sessions have no ground truth).
    let mut sketch_fact = None;
    let verdicts = if ctx.earns() {
        let prior = history(&st.pool, &s.id).await?;
        let tutor_question = prior
            .iter()
            .rev()
            .find(|m| m.role == "tutor")
            .map(|m| m.content.as_str());
        // Previous message stated the answer outright → this one is the "how did you get it?" sketch.
        let last_user = prior.iter().rev().find(|m| m.role == "user");
        if s.status == "active" && last_user.is_some_and(|m| stated_final(m.verdicts.as_ref())) {
            sketch_fact = grade_sketch(&st, &ctx, &s.id, &message).await?;
        }
        verify_message(&st, &message, tutor_question, &ctx.checkpoints).await
    } else {
        vec![]
    };
    let verdict_json =
        (!verdicts.is_empty()).then(|| serde_json::to_value(&verdicts).unwrap_or(Value::Null));
    // Generate the reply before saving anything, so a failed LLM call doesn't leave an
    // orphaned student message that the tutor would then see twice on retry.
    let mut hist = history(&st.pool, &s.id).await?;
    hist.push(Message {
        id: String::new(),
        session_id: s.id.clone(),
        role: "user".into(),
        content: message.clone(),
        verdicts: None,
        created_at: Utc::now(),
    });
    let mut facts = verdict_lines(&verdicts);
    facts.extend(sketch_fact);
    let mut r = tutor_reply(&st, &ctx, s.hints_used, &hist, &facts, None).await?;
    if r.blocked
        && verdicts
            .iter()
            .any(|v| v.status == crate::verify::Status::Final)
    {
        r.reply = FINAL_IN_CHAT.into();
    }
    let user_msg = insert_message(&st.pool, &s.id, "user", &message, verdict_json).await?;
    let tutor_msg = insert_message(&st.pool, &s.id, "tutor", &r.reply, None).await?;
    Ok(Json(json!({
        "reply": r.reply,
        "messageId": tutor_msg.id,
        "userMessageId": user_msg.id,
        "provider": r.provider,
        "verdicts": verdict_chips(&verdicts),
    })))
}

/// Grades the sketch and records it (the latest sketch counts at solve time). Returns the tutor fact.
/// On grader failure: no record, no fact; the tutor falls back to its own rule 12.
async fn grade_sketch(
    st: &AppState,
    ctx: &crate::context::ProblemContext,
    session_id: &str,
    sketch: &str,
) -> ApiResult<Option<String>> {
    let sound =
        match complete_json(st, Kind::Check, &prompts::sketch_grader(ctx, sketch), None).await {
            Ok(Some(v)) => v["sound"].as_bool(),
            Ok(None) => None,
            Err(e) => {
                tracing::warn!("[sketch] grader failed: {e}");
                None
            }
        };
    let Some(sound) = sound else { return Ok(None) };
    sqlx::query("INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, 'sketch', $3)")
        .bind(new_id())
        .bind(session_id)
        .bind(json!({ "sound": sound }))
        .execute(&st.pool)
        .await?;
    Ok(Some(sketch_line(sound)))
}

async fn hint(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    if s.source != "bank" {
        return Err(AppError::bad(
            "Hints are only available on problems from the bank.",
        ));
    }
    if s.status != "active" {
        return Err(AppError::bad("You've already solved this one."));
    }
    if s.hints_used >= 3 {
        return Err(AppError::bad("All 3 hints are already revealed."));
    }
    let n = sqlx::query(
        "UPDATE problem_sessions SET hints_used = hints_used + 1 WHERE id = $1 AND hints_used = $2",
    )
    .bind(&s.id)
    .bind(s.hints_used)
    .execute(&st.pool)
    .await?
    .rows_affected();
    if n != 1 {
        return Err(AppError::new(StatusCode::CONFLICT, "Please try again."));
    }
    let ctx = problem_context(&s)?;
    let used = s.hints_used + 1;
    Ok(Json(
        json!({ "hint": ctx.hints[(used - 1) as usize], "hintsUsed": used }),
    ))
}

#[derive(Deserialize)]
struct AnswerBody {
    answer: Option<String>,
}

const DIAGNOSIS_FALLBACK: &str = "Not quite, but every adventure in Wonderland takes a wrong turn or two. Go back through your work one step at a time. Which step are you least sure about?";

async fn answer(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(b): Json<AnswerBody>,
) -> ApiResult<Response> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    let ctx = problem_context(&s)?;
    let raw = b.answer.unwrap_or_default();
    let Some(correct_answer) = ctx.answer else {
        return Err(AppError::bad("There's no answer check for this one."));
    };
    let is_bank = ctx.earns(); // bank or generated topic problem: verified answer, tracked attempts
    if is_bank && s.status != "active" {
        return Err(AppError::bad("You've already solved this one."));
    }
    if is_bank && is_locked(s.wrong_attempts, s.hints_used) {
        let msg = if s.hints_used < 3 && ctx.is_bank() {
            "The little door is locked. Drink the next bottle to find the key (2 more attempts)."
        } else {
            "You're out of attempts for this problem. Keep chatting with the tutor to understand it."
        };
        return Err(AppError::new(StatusCode::LOCKED, msg));
    }
    let value = match parse_answer(&raw) {
        Ok(v) => v,
        Err(e) => {
            return Ok((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e, "counted": false })),
            )
                .into_response());
        }
    };

    if is_correct(value, correct_answer, ctx.tolerance) {
        if !is_bank {
            return Ok(Json(json!({ "correct": true, "wrongAttempts": s.wrong_attempts, "locked": false, "practice": true })).into_response());
        }
        let now = Utc::now();
        let n = sqlx::query("UPDATE problem_sessions SET status = 'solved', solved_at = $2 WHERE id = $1 AND status = 'active'")
            .bind(&s.id)
            .bind(now)
            .execute(&st.pool)
            .await?
            .rows_affected();
        if n != 1 {
            return Err(AppError::new(StatusCode::CONFLICT, "Already submitted."));
        }
        let evs = sqlx::query_as::<_, Event>(
            "SELECT * FROM events WHERE session_id = $1 AND type IN ('hidden','visible','paste')",
        )
        .bind(&s.id)
        .fetch_all(&st.pool)
        .await?;
        let telemetry: Vec<TelemetryEvent> = evs
            .iter()
            .map(|e| TelemetryEvent {
                kind: e.kind.clone(),
                target: e.data["target"].as_str().map(String::from),
                at: e.created_at,
            })
            .collect();
        let mut flags = compute_flags(s.started_at, now, ctx.min_solve_seconds, &telemetry);
        let last_sketch: Option<Value> = sqlx::query_scalar("SELECT data FROM events WHERE session_id = $1 AND type = 'sketch' ORDER BY created_at DESC LIMIT 1")
            .bind(&s.id)
            .fetch_optional(&st.pool)
            .await?;
        if last_sketch.is_some_and(|d| d["sound"] == false) {
            flags.push(SKETCH_FAILED);
        }
        sqlx::query("INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, 'solve', $3)")
            .bind(new_id())
            .bind(&s.id)
            .bind(json!({ "flags": flags }))
            .execute(&st.pool)
            .await?;
        let practice = ctx.custom_ref.practice_reason.is_some()
            || reward_elsewhere(
                &st.pool,
                &user.id,
                s.template_id.as_deref().unwrap_or_default(),
                &s.id,
            )
            .await?;
        return Ok(Json(json!({ "correct": true, "wrongAttempts": s.wrong_attempts, "locked": false, "flagged": !flags.is_empty(), "practice": practice })).into_response());
    }

    // Wrong answer
    let mut wrong = s.wrong_attempts;
    if is_bank {
        wrong = sqlx::query_scalar("UPDATE problem_sessions SET wrong_attempts = wrong_attempts + 1 WHERE id = $1 RETURNING wrong_attempts")
            .bind(&s.id)
            .fetch_one(&st.pool)
            .await?;
    }
    let hist = history(&st.pool, &s.id).await?;
    let tutor_text = match tutor_reply(
        &st,
        &ctx,
        s.hints_used,
        &hist,
        &[],
        Some(prompts::wrong_answer_line(&raw)),
    )
    .await
    {
        Ok(r) => r.reply,
        Err(e) => {
            tracing::warn!("[answer] diagnosis failed: {e}");
            DIAGNOSIS_FALLBACK.into()
        }
    };
    let msg = insert_message(&st.pool, &s.id, "tutor", &tutor_text, None).await?;
    Ok(Json(json!({
        "correct": false,
        "wrongAttempts": wrong,
        "locked": is_bank && is_locked(wrong, s.hints_used),
        "tutorReply": tutor_text,
        "messageId": msg.id,
    }))
    .into_response())
}

#[derive(Deserialize)]
struct ExplainBody {
    text: Option<String>,
}

/// Mint a reward row that is in status "minting"; returns the updated row.
async fn settle(st: &AppState, reward: &Reward, wallet: &str) -> anyhow::Result<Reward> {
    let (status, sig) = match &st.solana {
        None => {
            tracing::warn!("[mint] Solana not configured (MINT_ADDRESS / MINT_AUTHORITY_SECRET)");
            ("failed", None)
        }
        Some(sol) => match sol
            .mint_with_retry(wallet, reward.amount.max(0) as u64)
            .await
        {
            Ok(sig) => {
                tracing::info!(
                    "[mint] {} TARTS → {wallet}: {}",
                    st.cfg.from_base_units(reward.amount),
                    explorer_tx_url(&sig)
                );
                ("paid", Some(sig))
            }
            Err(e) => {
                tracing::error!("[mint] failed: {e}");
                ("failed", None)
            }
        },
    };
    Ok(sqlx::query_as::<_, Reward>(
        "UPDATE rewards SET status = $2, tx_sig = $3 WHERE id = $1 RETURNING *",
    )
    .bind(&reward.id)
    .bind(status)
    .bind(sig)
    .fetch_one(&st.pool)
    .await?)
}

fn practice_reward(msg: &str) -> Value {
    json!({ "amount": 0, "status": "practice", "breakdown": msg })
}

async fn explain(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(b): Json<ExplainBody>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    if s.source != "bank" && s.source != "quest" {
        return Err(AppError::bad(
            "Practice sessions don't pay out. Try a verified problem on this concept to earn TARTS.",
        ));
    }
    if s.status == "active" {
        return Err(AppError::bad("Solve the problem first."));
    }
    let prev_pass = s.explain_passed.unwrap_or(true);
    let prev_feedback = s.explain_feedback.clone().unwrap_or_default();

    // Retry path: a previous mint failed.
    if let Some(existing) =
        sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE session_id = $1")
            .bind(&s.id)
            .fetch_optional(&st.pool)
            .await?
    {
        if existing.status == "failed" {
            let claimed = sqlx::query_as::<_, Reward>("UPDATE rewards SET status = 'minting' WHERE id = $1 AND status = 'failed' RETURNING *")
                .bind(&existing.id)
                .fetch_optional(&st.pool)
                .await?;
            if let Some(r) = claimed {
                let settled = settle(&st, &r, &user.wallet_pubkey).await?;
                return Ok(Json(
                    json!({ "pass": prev_pass, "feedback": prev_feedback, "reward": reward_json(&st.cfg, &settled) }),
                ));
            }
        }
        return Ok(Json(
            json!({ "pass": prev_pass, "feedback": prev_feedback, "reward": reward_json(&st.cfg, &existing) }),
        ));
    }
    if s.explanation.is_some() {
        return Ok(Json(
            json!({ "pass": prev_pass, "feedback": prev_feedback, "reward": practice_reward("Practice mode: no reward") }),
        ));
    }

    let text = b.text.unwrap_or_default().trim().to_string();
    if text.chars().count() < 10 {
        return Err(AppError::bad(
            "Write a sentence or two explaining why your method works.",
        ));
    }
    if text.chars().count() > 1500 {
        return Err(AppError::bad("Please keep it under 1500 characters."));
    }
    let ctx = problem_context(&s)?;
    let solve: Option<Value> = sqlx::query_scalar("SELECT data FROM events WHERE session_id = $1 AND type = 'solve' ORDER BY created_at DESC LIMIT 1")
        .bind(&s.id)
        .fetch_optional(&st.pool)
        .await?;
    let flags: Vec<String> = solve
        .and_then(|d| d.get("flags").cloned())
        .and_then(|f| serde_json::from_value(f).ok())
        .unwrap_or_default();
    let mut pass = true;
    let mut feedback = "Nice work explaining your reasoning!".to_string();
    match complete_json(&st, Kind::Check, &prompts::grader(&ctx, &text), None).await {
        Ok(Some(v)) => {
            if let Some(p) = v["pass"].as_bool() {
                pass = p;
                if let Some(f) = v["feedback"].as_str().filter(|f| !f.trim().is_empty()) {
                    feedback = f.trim().chars().take(400).collect();
                }
            }
        }
        Ok(None) => {}
        // A flagged solve must really be graded; otherwise an LLM outage would wave it through.
        Err(e) if !flags.is_empty() => return Err(e.into()),
        Err(e) => tracing::warn!("[grader] unavailable, accepting unflagged explanation: {e}"),
    }

    let marked = sqlx::query(
        "UPDATE problem_sessions SET explanation = $2, explain_passed = $3, explain_feedback = $4, status = 'done' WHERE id = $1 AND explanation IS NULL",
    )
    .bind(&s.id)
    .bind(&text)
    .bind(pass)
    .bind(&feedback)
    .execute(&st.pool)
    .await?
    .rows_affected();
    if marked != 1 {
        return Err(AppError::new(StatusCode::CONFLICT, "Already submitted."));
    }

    let template_id = s.template_id.clone().unwrap_or_default();
    if reward_elsewhere(&st.pool, &user.id, &template_id, &s.id).await? {
        return Ok(Json(
            json!({ "pass": pass, "feedback": feedback, "reward": practice_reward("Practice mode: no reward (you've already earned on this problem)") }),
        ));
    }
    if ctx.is_quest() {
        // Re-check at payout time: the daily topic cap may have filled since the problem was created.
        let reason = match &ctx.custom_ref.practice_reason {
            Some(r) => Some(r.clone()),
            None if topic_rewards_today(&st.pool, &user.id).await? >= st.cfg.daily_topic_cap => {
                Some(format!(
                    "You've reached today's limit of {} new-topic rewards.",
                    st.cfg.daily_topic_cap
                ))
            }
            None => None,
        };
        if let Some(r) = reason {
            return Ok(Json(
                json!({ "pass": pass, "feedback": feedback, "reward": practice_reward(&format!("Practice mode: {r}")) }),
            ));
        }
        // New topics only pay for demonstrated understanding. No reward row, so they can try another problem.
        if !pass {
            return Ok(Json(
                json!({ "pass": pass, "feedback": feedback, "reward": practice_reward("New topics pay only when your explanation passes. Ask for this topic again to try a fresh problem.") }),
            ));
        }
    }

    let r = compute_reward(&RewardInput {
        base: if ctx.is_quest() {
            QUEST_BASE
        } else {
            bank_base(ctx.difficulty)
        },
        hints_used: s.hints_used,
        wrong_attempts: s.wrong_attempts,
        explain_passed: pass,
        flagged: !flags.is_empty(),
        earned_today: earned_today(&st, &user.id).await?,
        daily_cap: st.cfg.daily_cap,
    });
    // Daily cap reached: don't record a 0-amount payout, or this problem's one-time reward would be gone for good.
    if r.status == RewardStatus::Pay && r.amount == 0 {
        return Ok(Json(
            json!({ "pass": pass, "feedback": feedback, "reward": practice_reward("The Queen's treasury is closed for today (daily cap reached). Solve this one again tomorrow to earn your tarts.") }),
        ));
    }
    let status = if r.status == RewardStatus::Forfeited {
        "forfeited"
    } else {
        "minting"
    };
    let inserted = sqlx::query_as::<_, Reward>(
        "INSERT INTO rewards (id, user_id, session_id, template_id, amount, breakdown, status, flags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(&s.id)
    .bind(&template_id)
    .bind(st.cfg.to_base_units(r.amount as f64))
    .bind(json!({ "items": r.breakdown, "summary": r.summary }))
    .bind(status)
    .bind((!flags.is_empty()).then(|| json!(flags)))
    .fetch_optional(&st.pool)
    .await?;
    let Some(mut reward) = inserted else {
        return Ok(Json(
            json!({ "pass": pass, "feedback": feedback, "reward": practice_reward("Practice mode: no reward") }),
        ));
    };
    if status == "minting" {
        reward = settle(&st, &reward, &user.wallet_pubkey).await?;
    }
    if status == "forfeited" {
        tracing::info!(
            "[reward] forfeited for {} on {template_id} (flags: {})",
            user.username,
            flags.join(", ")
        );
    }
    Ok(Json(
        json!({ "pass": pass, "feedback": feedback, "reward": reward_json(&st.cfg, &reward) }),
    ))
}

#[derive(Deserialize)]
struct EventBody {
    #[serde(rename = "type")]
    kind: Option<String>,
    data: Option<Value>,
}

async fn events(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    body: axum::body::Bytes,
) -> ApiResult<J> {
    // sendBeacon may post without a JSON content-type, so parse the raw body.
    let b: EventBody =
        serde_json::from_slice(&body).map_err(|_| AppError::bad("Unknown event."))?;
    let s = load_session(&st.pool, &id, &user.id).await?;
    let kind = b.kind.unwrap_or_default();
    if !["hidden", "visible", "paste"].contains(&kind.as_str()) {
        return Err(AppError::bad("Unknown event."));
    }
    if (s.source != "bank" && s.source != "quest") || s.status != "active" {
        return Ok(Json(json!({ "ok": true })));
    }
    let d = b.data.unwrap_or(Value::Null);
    let mut data = serde_json::Map::new();
    if let Some(len) = d["length"].as_f64() {
        data.insert(
            "length".into(),
            json!(len.clamp(0.0, 100_000.0).round() as i64),
        );
    }
    if let Some(t) = d["target"].as_str() {
        data.insert(
            "target".into(),
            json!(t.chars().take(20).collect::<String>()),
        );
    }
    sqlx::query("INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, $3, $4)")
        .bind(new_id())
        .bind(&s.id)
        .bind(&kind)
        .bind(Value::Object(data))
        .execute(&st.pool)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

async fn resources(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st.pool, &id, &user.id).await?;
    if s.source != "bank" || s.status == "active" {
        return Err(AppError::new(
            StatusCode::FORBIDDEN,
            "Solve the problem first.",
        ));
    }
    let Some(t) = get_template(s.template_id.as_deref().unwrap_or_default()) else {
        return Ok(Json(json!({ "links": [] })));
    };
    Ok(Json(
        json!({ "links": learn_more_links(&st, t.id, t.learn_more_query).await }),
    ))
}

// ---------- P2: text-to-speech ----------

#[derive(Deserialize)]
struct TtsBody {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "messageId")]
    message_id: Option<String>,
    #[serde(rename = "hintIndex")]
    hint_index: Option<i64>,
    text: Option<Value>,
}

/// Speaks a stored tutor message or a revealed hint, by reference only. Never raw text.
async fn tts(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Json(b): Json<TtsBody>,
) -> ApiResult<Response> {
    if !st.cfg.tts_enabled() {
        return Err(AppError::not_found("Read-aloud is not enabled."));
    }
    if b.text.is_some() {
        return Err(AppError::bad("Raw text is not accepted."));
    }
    let s = load_session(
        &st.pool,
        b.session_id.as_deref().unwrap_or_default(),
        &user.id,
    )
    .await?;
    let text = if let Some(mid) = b.message_id {
        let row: Option<(String, String, String)> =
            sqlx::query_as("SELECT session_id, role, content FROM messages WHERE id = $1")
                .bind(&mid)
                .fetch_optional(&st.pool)
                .await?;
        match row {
            Some((sid, role, content)) if sid == s.id && role == "tutor" => content,
            _ => return Err(AppError::not_found("Message not found.")),
        }
    } else if let Some(i) = b.hint_index {
        if s.source != "bank" || i < 0 || i >= s.hints_used as i64 {
            return Err(AppError::not_found("Hint not revealed."));
        }
        problem_context(&s)?.hints[i as usize].clone()
    } else {
        return Err(AppError::bad("Nothing to read."));
    };
    match synthesize(&st, &text).await {
        Ok(audio) => Ok((
            [
                (header::CONTENT_TYPE, "audio/mpeg"),
                (header::CACHE_CONTROL, "private, max-age=3600"),
            ],
            Body::from(audio.as_ref().clone()),
        )
            .into_response()),
        Err(e) => {
            tracing::warn!("[tts] failed: {e}");
            Err(AppError::new(
                StatusCode::BAD_GATEWAY,
                "Read-aloud is unavailable right now.",
            ))
        }
    }
}
