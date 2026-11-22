use crate::answers::{is_correct, is_locked, parse_answer};
use crate::auth::{
    AuthUser, COOKIE, hash_password, session_cookie, valid_password, valid_username,
    verify_password,
};
use crate::claims::verify_message;
use crate::concepts::{Concept, public_concepts, reward_key, visible_concept, visible_concepts};
use crate::context::CustomRef;
use crate::context::problem_context;
use crate::custom::{CUSTOM_MAX, classify_topic, generate_quest, intake_problem};
use crate::error::{ApiResult, AppError};
use crate::llm::{Kind, complete_json};
use crate::models::{Message, ProblemSession, Reward, User, new_id};
use crate::personalized::{
    self, Generation, GenerationClaim, PRIVATE_PRACTICE_REASON, concept_summary,
};
use crate::problems::{TEMPLATES, get_template};
use crate::proficiency::{Proficiency, concept_progress, utc_day};
use crate::prompts::{self, opening_message};
use crate::quest::Quest;
use crate::resources::learn_more_links;
use crate::rewards::{CHAT_BASE, QUEST_BASE, RewardInput, RewardStatus, bank_base, compute_reward};
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
        .route("/api/auth/signup", post(signup))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/problems", get(problems))
        .route("/api/concepts", get(concepts))
        .route(
            "/api/concepts/{id}/next-step",
            post(personalized::next_step),
        )
        .route(
            "/api/concept-proposals/{id}/accept",
            post(personalized::accept),
        )
        .route("/api/journal", get(journal))
        .route("/api/tarts", get(crate::treasury::treasury))
        .route("/api/tarts/estimate", get(crate::treasury::estimate_route))
        .route("/api/features", get(features))
        .route("/api/stats", get(stats))
        .route("/api/tts", post(tts))
        .route("/api/sessions", post(create_session))
        .route("/api/sessions/{id}", get(get_session))
        .route("/api/sessions/{id}/similar", post(similar))
        .route("/api/sessions/{id}/claim", post(claim))
        .route("/api/sessions/{id}/testify", post(testify))
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
struct AuthBody {
    username: Option<String>,
    password: Option<String>,
}

/// Easy combined error checking and message generation helper.
fn auth_input_error(username: &str, password: &str) -> Option<AppError> {
    if !valid_username(username) {
        return Some(AppError::bad(
            "Usernames are 2–24 characters: lowercase letters, numbers, - and _.",
        ));
    }
    if !valid_password(password) {
        return Some(AppError::bad("Passwords are 8–72 characters."));
    }
    None
}

async fn signup(
    State(st): State<AppState>,
    jar: CookieJar,
    Json(b): Json<AuthBody>,
) -> ApiResult<(CookieJar, J)> {
    let username = b.username.unwrap_or_default().trim().to_lowercase();
    let password = b.password.unwrap_or_default();
    if let Some(e) = auth_input_error(&username, &password) {
        return Err(e);
    }
    let (pubkey, secret) = generate_user_wallet();
    let inserted = sqlx::query(
        "INSERT INTO users (id, username, wallet_pubkey, wallet_secret, password_hash) \
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING",
    )
    .bind(new_id())
    .bind(&username)
    .bind(&pubkey)
    .bind(&secret)
    .bind(hash_password(&password))
    .execute(&st.pool)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(AppError::conflict("That username is already taken."));
    }
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&username)
        .fetch_one(&st.pool)
        .await?;
    let jar = jar.add(session_cookie(&st, &user.id));
    Ok((
        jar,
        Json(json!({ "username": user.username, "walletPubkey": user.wallet_pubkey })),
    ))
}

async fn login(
    State(st): State<AppState>,
    jar: CookieJar,
    Json(b): Json<AuthBody>,
) -> ApiResult<(CookieJar, J)> {
    let username = b.username.unwrap_or_default().trim().to_lowercase();
    let password = b.password.unwrap_or_default();
    if let Some(e) = auth_input_error(&username, &password) {
        return Err(e);
    }

    let user = match sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&st.pool)
        .await?
    {
        Some(u) => u,
        None => return Err(AppError::unauthorized("Unknown username or password.")),
    };

    if !verify_password(&password, &user.password_hash) {
        return Err(AppError::unauthorized("Unknown username or password."));
    }

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
        "SELECT s.* FROM problem_sessions s LEFT JOIN concepts c ON c.id = s.concept_id
         WHERE s.user_id = $1 AND s.source = 'bank' AND s.status = 'done' AND c.owner_id IS NULL
         ORDER BY s.solved_at DESC NULLS LAST LIMIT 100",
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
        "personalizedConcepts": st.cfg.personalized_concepts_enabled,
    }))
}

async fn stats(State(st): State<AppState>) -> ApiResult<Json<Value>> {
    let (solves, testimonies): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE status IN ('solved', 'done')),
                COUNT(*) FILTER (WHERE explain_passed)
         FROM problem_sessions",
    )
    .fetch_one(&st.pool)
    .await?;
    let pastes_caught: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT session_id) FROM events WHERE type = 'paste'")
            .fetch_one(&st.pool)
            .await?;
    let paid: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount), 0)::BIGINT FROM rewards WHERE status = 'paid'",
    )
    .fetch_one(&st.pool)
    .await?;
    Ok(Json(json!({
        "verifiedSolves": solves,
        "convincingTestimonies": testimonies,
        "pastesCaught": pastes_caught,
        "tartsPaid": st.cfg.from_base_units(paid),
        "onChain": st.solana.is_some(),
    })))
}

// ---------- sessions ----------

#[derive(Deserialize)]
struct CustomBody {
    kind: Option<String>,
    text: Option<String>,
    /// From the map or a suggestion: go straight to the node's checked problem.
    /// Typed topics and pasted problems always open the chat (a claim banner leads to the checked problem).
    #[serde(default)]
    quest: bool,
}

#[derive(Deserialize)]
struct CreateBody {
    #[serde(rename = "templateId")]
    template_id: Option<String>,
    #[serde(rename = "conceptId")]
    concept_id: Option<String>,
    custom: Option<CustomBody>,
}

async fn create_session(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Json(b): Json<CreateBody>,
) -> ApiResult<J> {
    if let Some(id) = b.concept_id {
        if b.template_id.is_some() || b.custom.is_some() {
            return Err(AppError::bad("Choose only one way to start a session."));
        }
        let c = visible_concept(&st.pool, &user.id, &id)
            .await?
            .filter(|c| st.cfg.personalized_concepts_enabled || !c.is_private())
            .ok_or_else(|| AppError::not_found("Concept not found."))?;
        let id = if let Some(bank) = &c.bank_template_id {
            create_bank_session(&st, &user, bank, None).await?.id
        } else {
            start_checked_quest(&st, &user, &c, None)
                .await?
                .ok_or_else(|| {
                    AppError::new(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "Couldn't build a checked problem for this topic right now.",
                    )
                })?
        };
        return Ok(Json(json!({ "sessionId": id })));
    }
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
        let custom_ref = if kind == "topic" && c.quest {
            topic_session(&st, &user, &text).await?
        } else {
            TopicOutcome::Practice(open_chat_ref(&st, &user.id, kind, &text).await?)
        };
        let custom_ref = match custom_ref {
            TopicOutcome::Session(id) => return Ok(Json(json!({ "sessionId": id }))),
            TopicOutcome::Practice(r) => r,
        };
        let s = sqlx::query_as::<_, ProblemSession>(
            "INSERT INTO problem_sessions (id, user_id, source, custom_text, custom_ref, template_id, concept_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        )
        .bind(new_id())
        .bind(&user.id)
        .bind(if kind == "problem" { "custom_problem" } else { "custom_topic" })
        .bind(&text)
        .bind(serde_json::to_value(&custom_ref)?)
        .bind(&custom_ref.matched_template_id)
        .bind(&custom_ref.concept_id)
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

/// An open chat, tagged with its skill-tree node so the chat can offer a claim on that node.
async fn open_chat_ref(
    st: &AppState,
    user_id: &str,
    kind: &str,
    text: &str,
) -> ApiResult<CustomRef> {
    let public = public_concepts(&st.pool).await?;
    let (mut r, class) = if kind == "problem" {
        tokio::join!(intake_problem(st, text), classify_topic(st, text, &public))
    } else {
        (
            CustomRef::default(),
            classify_topic(st, text, &public).await,
        )
    };
    if kind == "topic" {
        r.academic = Some(class.academic);
    }
    if r.academic != Some(false) && class.academic {
        if let Some(c) = class.concept {
            r.concept_id = Some(c.id.clone());
            r.matched_template_id = c.bank_template_id.clone();
        } else {
            // Not on the map yet: grow it (a new public node), or say why not.
            match crate::grow::grow(st, user_id, text, &public).await? {
                crate::grow::Grown::Node(c) => {
                    r.concept_id = Some(c.id.clone());
                    r.matched_template_id = c.bank_template_id.clone();
                }
                crate::grow::Grown::Limit => {
                    r.practice_reason = Some(format!(
                        "You've added {} new topics to the map today, so this one is practice. Ask again tomorrow to add it.",
                        st.cfg.daily_new_node_cap
                    ));
                }
                crate::grow::Grown::None => {}
            }
        }
    }
    Ok(r)
}

/// "Claim TARTS" from an open chat: the node's checked problem (new or reused), under the usual graph rules.
async fn claim(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st, &id, &user.id).await?;
    if !s.source.starts_with("custom_") {
        return Err(AppError::bad("Only open chats can claim a topic."));
    }
    let c = match s.concept_id.as_deref() {
        Some(cid) => visible_concept(&st.pool, &user.id, cid).await?,
        None => None,
    }
    .filter(|c| !c.is_private())
    .ok_or_else(|| AppError::not_found("This chat isn't on the knowledge map yet."))?;
    let session_id = if let Some(bank) = &c.bank_template_id {
        create_bank_session(&st, &user, bank, Some(&s.id)).await?.id
    } else {
        start_checked_quest(&st, &user, &c, Some(c.title.as_str()))
            .await?
            .ok_or_else(|| {
                AppError::new(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Couldn't build a checked problem for this topic right now. Try again in a moment.",
                )
            })?
    };
    Ok(Json(json!({ "sessionId": session_id })))
}

/// Open-chat testimony: before it, the student must have talked it through.
pub const CHAT_MIN_MESSAGES: i64 = 3;
pub const CHAT_MIN_SECONDS: i64 = 60;
pub const CHAT_TESTIMONY_TRIES: i64 = 3;

pub async fn chat_testimony_tries(pool: &sqlx::PgPool, session_id: &str) -> anyhow::Result<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM events WHERE session_id = $1 AND type = 'chat_testimony'",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?)
}

/// Earn on a skill-tree node from the open chat: explain the concept in your own words.
/// Same graph rules as every topic reward (one payout per node per student, prerequisites,
/// daily topic cap), plus engagement minimums and a few tries per chat.
async fn testify(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(b): Json<ExplainBody>,
) -> ApiResult<J> {
    let s = load_session(&st, &id, &user.id).await?;
    if !s.source.starts_with("custom_") {
        return Err(AppError::bad("Testimony here is for open chats."));
    }
    let c = match s.concept_id.as_deref() {
        Some(cid) => visible_concept(&st.pool, &user.id, cid).await?,
        None => None,
    }
    .filter(|c| !c.is_private())
    .ok_or_else(|| AppError::not_found("This chat isn't on the knowledge map yet."))?;
    if let Some(existing) =
        sqlx::query_as::<_, Reward>("SELECT * FROM rewards WHERE session_id = $1")
            .bind(&s.id)
            .fetch_optional(&st.pool)
            .await?
    {
        return Ok(Json(
            json!({ "pass": true, "feedback": "You already earned here.", "reward": reward_json(&st.cfg, &existing) }),
        ));
    }
    if let Some(reason) = topic_block_reason(&st, &user.id, &c).await? {
        return Err(AppError::bad(reason));
    }
    let history = history(&st.pool, &s.id).await?;
    let said = history.iter().filter(|m| m.role == "user").count() as i64;
    let seconds = (Utc::now() - s.started_at).num_seconds();
    if said < CHAT_MIN_MESSAGES || seconds < CHAT_MIN_SECONDS {
        return Err(AppError::bad(format!(
            "Talk it through with the Cat a little more first (at least {CHAT_MIN_MESSAGES} messages and a minute), then explain it in your own words."
        )));
    }
    let tries = chat_testimony_tries(&st.pool, &s.id).await?;
    if tries >= CHAT_TESTIMONY_TRIES {
        return Err(AppError::bad(
            "No testimony tries left in this chat. Try the checked problem instead.",
        ));
    }
    let text = b.text.unwrap_or_default().trim().to_string();
    if text.chars().count() < 40 {
        return Err(AppError::bad(
            "Explain it in a few sentences: how or why does it work?",
        ));
    }
    if text.chars().count() > 1500 {
        return Err(AppError::bad("Please keep it under 1500 characters."));
    }
    let chat = history
        .iter()
        .rev()
        .take(16)
        .rev()
        .map(|m| {
            format!(
                "{}: {}",
                if m.role == "user" { "Student" } else { "Tutor" },
                m.content
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let verdict = complete_json(
        &st,
        Kind::Check,
        &prompts::chat_testimony_grader(&c.title, &chat, &text),
        None,
    )
    .await?;
    // No fallback pass here: without a checked answer, the grade is the only evidence.
    let Some(pass) = verdict.as_ref().and_then(|v| v["pass"].as_bool()) else {
        return Err(AppError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "The court couldn't hear your testimony just now. Try again in a moment.",
        ));
    };
    let feedback = verdict
        .as_ref()
        .and_then(|v| v["feedback"].as_str())
        .map(|f| f.trim().chars().take(400).collect::<String>())
        .unwrap_or_default();
    sqlx::query(
        "INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, 'chat_testimony', $3)",
    )
    .bind(new_id())
    .bind(&s.id)
    .bind(json!({ "text": text, "pass": pass, "feedback": feedback }))
    .execute(&st.pool)
    .await?;
    if !pass {
        return Ok(Json(json!({
            "pass": false,
            "feedback": feedback,
            "triesLeft": CHAT_TESTIMONY_TRIES - (tries + 1),
        })));
    }
    let r = compute_reward(&RewardInput {
        base: CHAT_BASE,
        hints_used: 0,
        wrong_attempts: 0,
        explain_passed: true,
        flagged: false,
        earned_today: earned_today(&st, &user.id).await?,
        daily_cap: st.cfg.daily_cap,
    });
    if r.amount == 0 {
        return Ok(Json(
            json!({ "pass": true, "feedback": feedback, "reward": practice_reward("The Queen's treasury is closed for today (daily cap reached). Explain it again tomorrow to earn your tarts.") }),
        ));
    }
    let inserted = sqlx::query_as::<_, Reward>(
        "INSERT INTO rewards (id, user_id, session_id, template_id, amount, breakdown, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'minting') ON CONFLICT DO NOTHING RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(&s.id)
    .bind(reward_key(&c.id))
    .bind(st.cfg.to_base_units(r.amount as f64))
    .bind(json!({ "items": r.breakdown, "summary": format!("Chat testimony on {} = {} TARTS", c.title, r.amount) }))
    .fetch_optional(&st.pool)
    .await?;
    let Some(reward) = inserted else {
        return Ok(Json(
            json!({ "pass": true, "feedback": feedback, "reward": practice_reward(&format!("You've already earned on {}.", c.title)) }),
        ));
    };
    let settled = settle(&st, &reward, &user.wallet_pubkey).await?;
    Ok(Json(
        json!({ "pass": true, "feedback": feedback, "reward": reward_json(&st.cfg, &settled) }),
    ))
}

enum TopicOutcome {
    /// A generated problem on a knowledge-graph node (new or reused).
    Session(String),
    /// Practice-only custom session with this reference.
    Practice(CustomRef),
}

/// Topic → knowledge-graph node → generated, engine-checked problem when possible.
async fn topic_session(st: &AppState, user: &User, text: &str) -> ApiResult<TopicOutcome> {
    let public = public_concepts(&st.pool).await?;
    let class = classify_topic(st, text, &public).await;
    let practice = |reason: Option<String>| CustomRef {
        academic: Some(class.academic),
        concept_id: class.concept.map(|c| c.id.clone()),
        matched_template_id: class.concept.and_then(|c| c.bank_template_id.clone()),
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
    if c.bank_template_id.is_some() {
        return Ok(TopicOutcome::Practice(practice(Some(format!(
            "{} has a verified problem in the bank. Use the button below to earn TARTS on it.",
            c.title
        )))));
    }
    match start_checked_quest(st, user, c, Some(text)).await? {
        Some(id) => Ok(TopicOutcome::Session(id)),
        None => Ok(TopicOutcome::Practice(practice(Some(
            "Couldn't build a checked problem for this topic right now, so it's practice only."
                .into(),
        )))),
    }
}

async fn start_checked_quest(
    st: &AppState,
    user: &User,
    c: &Concept,
    text: Option<&str>,
) -> ApiResult<Option<String>> {
    if c.is_private() {
        if !st.cfg.personalized_concepts_enabled {
            return Err(AppError::not_found("Concept not found."));
        }
        if !c.ready(&mastered_concepts(&st.pool, &user.id).await?) {
            return Err(AppError::new(
                StatusCode::CONFLICT,
                "Demonstrate this concept's prerequisites first.",
            ));
        }
    }
    if let Some(existing) = reusable_quest(st, &user.id, c).await? {
        return Ok(Some(existing.id));
    }
    // Both entry points share the generation claim, but only ID starts consume quota.
    let claim = GenerationClaim::acquire(&st.pool, &user.id, &c.id, Generation::Quest).await?;
    let result = build_checked_quest(st, user, c, text, &claim).await;
    claim.release().await;
    result
}

async fn build_checked_quest(
    st: &AppState,
    user: &User,
    c: &Concept,
    text: Option<&str>,
    claim: &GenerationClaim,
) -> ApiResult<Option<String>> {
    if let Some(existing) = reusable_quest(st, &user.id, c).await? {
        return Ok(Some(existing.id));
    }
    let reason = topic_block_reason(st, &user.id, c).await?;
    if text.is_none() {
        claim.reserve(st).await?;
    }
    let seed = random_seed();
    // Bound provider work to less than the four-minute claim lease on both entry points.
    let quest = tokio::time::timeout(Duration::from_secs(180), generate_quest(st, c, seed))
        .await
        .map_err(|_| {
            AppError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Building a quest timed out. Please retry.",
            )
        })?;
    let Some(quest) = quest else {
        return Ok(None);
    };
    Ok(Some(
        save_checked_quest(st, user, c, text, seed, quest, reason, Some(claim)).await?,
    ))
}

async fn save_checked_quest(
    st: &AppState,
    user: &User,
    c: &Concept,
    text: Option<&str>,
    seed: i64,
    quest: Quest,
    practice_reason: Option<String>,
    claim: Option<&GenerationClaim>,
) -> ApiResult<String> {
    if quest.concept_id != c.id || (c.is_private() && quest.ran_in_sandbox) {
        return Err(anyhow::anyhow!("inconsistent checked quest generation").into());
    }
    let payable = practice_reason.is_none();
    let r = CustomRef {
        quest: Some(quest),
        practice_reason,
        ..Default::default()
    };
    let mut tx = st.pool.begin().await?;
    // Serialize the final recheck and insert (not provider work). Concurrent starts reuse one quest.
    sqlx::query("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE")
        .bind(&user.id)
        .execute(&mut *tx)
        .await?;
    if let Some(claim) = claim {
        claim.lock(&mut tx).await?;
    }
    // A practice quest doesn't block a new earning one once the node can pay.
    if let Some(existing) = active_quest(&mut *tx, &user.id, c)
        .await?
        .filter(|e| !(payable && is_practice_quest(e)))
    {
        tx.commit().await?;
        return Ok(existing.id);
    }
    let s = sqlx::query_as::<_, ProblemSession>(
        "INSERT INTO problem_sessions (id, user_id, source, concept_id, template_id, seed, custom_text, custom_ref)
         VALUES ($1, $2, 'quest', $3, $4, $5, $6, $7) RETURNING *",
    )
    .bind(new_id())
    .bind(&user.id)
    .bind(&c.id)
    .bind((!c.is_private()).then(|| reward_key(&c.id)))
    .bind(seed)
    .bind(text)
    .bind(serde_json::to_value(&r)?)
    .fetch_one(&mut *tx)
    .await?;
    let ctx = problem_context(&s)?;
    insert_message(&mut *tx, &s.id, "tutor", opening_message(&ctx), None).await?;
    tx.commit().await?;
    Ok(s.id)
}

/// The knowledge map: every node with the student's status on it.
async fn concepts(State(st): State<AppState>, AuthUser(user): AuthUser) -> ApiResult<J> {
    let today = utc_day(Utc::now());
    let rewarded = rewarded_concepts(&st.pool, &user.id).await?;
    let progress = concept_progress(&st.pool, &user.id, &today).await?;
    let mastered = |id: &str| {
        matches!(
            progress.get(id).map(|p| &p.proficiency),
            Some(Proficiency::Demonstrated | Proficiency::Proficient)
        )
    };
    let graph = if st.cfg.personalized_concepts_enabled {
        visible_concepts(&st.pool, &user.id).await?
    } else {
        public_concepts(&st.pool).await?
    };
    // Nodes students grew by asking about a new topic (shown with a sprout on the map).
    let grown: std::collections::HashSet<String> =
        sqlx::query_scalar("SELECT id FROM concepts WHERE created_by IS NOT NULL")
            .fetch_all(&st.pool)
            .await?
            .into_iter()
            .collect();
    let list: Vec<Value> = graph
        .iter()
        .map(|c| {
            let status = if mastered(&c.id) {
                "mastered"
            } else if c.prereqs.iter().all(|p| mastered(p)) {
                "available"
            } else {
                "locked"
            };
            let evidence = progress.get(&c.id);
            let mut summary = concept_summary(c);
            summary["proficiency"] = json!(
                evidence
                    .map(|p| &p.proficiency)
                    .unwrap_or(&Proficiency::New)
            );
            summary["attemptsToday"] = json!(evidence.map_or(0, |p| p.attempts_today));
            summary["status"] = json!(status);
            summary["rewarded"] = json!(rewarded.contains(&c.id));
            summary["grown"] = json!(grown.contains(&c.id));
            summary
        })
        .collect();
    Ok(Json(json!({
        "concepts": list,
        "attemptsDateUtc": today.start.date_naive().to_string(),
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
    Ok(Json(session_view(&st, &id, &user.id).await?))
}

async fn similar(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> ApiResult<J> {
    let s = load_session(&st, &id, &user.id).await?;
    if s.source == "bank" {
        return Err(AppError::bad("This is already a verified problem."));
    }
    let matched = if s.source == "quest" {
        None
    } else {
        problem_context(&s)?.custom_ref.matched_template_id
    };
    let Some(matched) = matched else {
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
    let s = load_session(&st, &id, &user.id).await?;
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
    let s = load_session(&st, &id, &user.id).await?;
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
        "UPDATE problem_sessions SET hints_used = hints_used + 1 WHERE id = $1 AND hints_used = $2 AND status = 'active'",
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
    let s = load_session(&st, &id, &user.id).await?;
    let ctx = problem_context(&s)?;
    let raw = b.answer.unwrap_or_default();
    let Some(correct_answer) = ctx.answer else {
        return Err(AppError::bad("There's no answer check for this one."));
    };
    let checked = ctx.earns(); // Bank and quest checks count, including practice.
    if checked {
        if s.status != "active" {
            return Err(AppError::bad("You've already solved this one."));
        }
        ensure_answer_unlocked(&s)?;
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

    let correct = is_correct(value, correct_answer, ctx.tolerance);
    let result = if checked {
        Some(record_checked_answer(&st.pool, &s, &ctx, correct).await?)
    } else {
        None
    };
    let wrong = result
        .as_ref()
        .map_or(s.wrong_attempts, |r| r.wrong_attempts);
    if correct {
        let Some(result) = result else {
            return Ok(Json(json!({ "correct": true, "wrongAttempts": wrong, "locked": false, "practice": true })).into_response());
        };
        let practice = !has_public_reward_key(&st.pool, &s).await?
            || ctx.custom_ref.practice_reason.is_some()
            || reward_elsewhere(
                &st.pool,
                &user.id,
                s.template_id.as_deref().unwrap_or_default(),
                &s.id,
            )
            .await?;
        return Ok(Json(json!({ "correct": true, "wrongAttempts": wrong, "locked": false, "flagged": result.flagged, "practice": practice })).into_response());
    }

    let hints_used = result.map_or(s.hints_used, |r| r.hints_used);
    let hist = history(&st.pool, &s.id).await?;
    let tutor_text = match tutor_reply(
        &st,
        &ctx,
        hints_used,
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
        "locked": checked && is_locked(wrong, hints_used),
        "tutorReply": tutor_text,
        "messageId": msg.id,
    }))
    .into_response())
}

/// How many testimonies a student gets before a weak one becomes final.
pub const TESTIMONY_TRIES: i64 = 3;

/// Weak testimonies already given for this session.
pub async fn testimony_tries(pool: &sqlx::PgPool, session_id: &str) -> anyhow::Result<i64> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM events WHERE session_id = $1 AND type = 'testimony_try'",
    )
    .bind(session_id)
    .fetch_one(pool)
    .await?)
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

fn explain_grade(verdict: Option<Value>) -> (bool, String, &'static str) {
    let default_feedback = || "Nice work explaining your reasoning!".to_string();
    if let Some(v) = verdict
        && let Some(pass) = v["pass"].as_bool()
    {
        let feedback = v["feedback"]
            .as_str()
            .filter(|f| !f.trim().is_empty())
            .map_or_else(default_feedback, |f| f.trim().chars().take(400).collect());
        (pass, feedback, "grader")
    } else {
        (true, default_feedback(), "fallback")
    }
}

async fn explain(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(b): Json<ExplainBody>,
) -> ApiResult<J> {
    let s = load_session(&st, &id, &user.id).await?;
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

    let public_reward = has_public_reward_key(&st.pool, &s).await?;
    // Retry a failed mint only for an authoritative public reward key.
    if public_reward
        && let Some(existing) =
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
            json!({ "pass": prev_pass, "feedback": prev_feedback, "reward": practice_reward(if public_reward { "Practice mode: no reward" } else { PRIVATE_PRACTICE_REASON }) }),
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
    let verdict = match complete_json(&st, Kind::Check, &prompts::grader(&ctx, &text), None).await {
        Ok(v) => v,
        // Preserve the rejection of grader errors on flagged solves.
        Err(e) if !flags.is_empty() => return Err(e.into()),
        Err(e) => {
            tracing::warn!("[grader] unavailable, accepting unflagged explanation: {e}");
            None
        }
    };
    let (pass, feedback, grade_source) = explain_grade(verdict);

    // A weak testimony isn't final: the student gets up to TESTIMONY_TRIES tries. Earlier
    // tries are kept as events (research data); only the last one settles the reward.
    if !pass {
        let tries = testimony_tries(&st.pool, &s.id).await?;
        if tries + 1 < TESTIMONY_TRIES {
            sqlx::query(
                "INSERT INTO events (id, session_id, type, data) VALUES ($1, $2, 'testimony_try', $3)",
            )
            .bind(new_id())
            .bind(&s.id)
            .bind(json!({ "text": text, "feedback": feedback }))
            .execute(&st.pool)
            .await?;
            return Ok(Json(json!({
                "pass": false,
                "feedback": feedback,
                "retry": true,
                "triesLeft": TESTIMONY_TRIES - (tries + 1),
            })));
        }
    }

    let marked = sqlx::query(
        "UPDATE problem_sessions SET explanation = $2, explain_passed = $3, explain_feedback = $4,
         explain_grade_source = $5, explain_graded_at = clock_timestamp(), status = 'done'
         WHERE id = $1 AND explanation IS NULL",
    )
    .bind(&s.id)
    .bind(&text)
    .bind(pass)
    .bind(&feedback)
    .bind(grade_source)
    .execute(&st.pool)
    .await?
    .rows_affected();
    if marked != 1 {
        return Err(AppError::new(StatusCode::CONFLICT, "Already submitted."));
    }

    if !public_reward {
        return Ok(Json(
            json!({ "pass": pass, "feedback": feedback, "reward": practice_reward(PRIVATE_PRACTICE_REASON) }),
        ));
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
    let s = load_session(&st, &id, &user.id).await?;
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
    let s = load_session(&st, &id, &user.id).await?;
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
    let s = load_session(&st, b.session_id.as_deref().unwrap_or_default(), &user.id).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state(pool: sqlx::PgPool) -> AppState {
        let cfg = crate::config::Config {
            openai_api_key: None,
            openai_base_url: String::new(),
            openai_model: String::new(),
            tutor_effort: String::new(),
            check_effort: String::new(),
            database_url: String::new(),
            session_secret: String::new(),
            daily_cap: 1000.0,
            daily_topic_cap: 3,
            daily_new_node_cap: 3,
            personalized_concepts_enabled: false,
            demo_fixed_seeds: false,
            solana_rpc_url: String::new(),
            mint_authority_secret: None,
            mint_address: None,
            token_decimals: 2,
            elevenlabs_api_key: None,
            elevenlabs_voice_id: None,
            elevenlabs_model_id: String::new(),
            keenable_api_key: None,
            solari_api_key: None,
            solari_base_url: String::new(),
            solari_template: String::new(),
            keenable_base_url: String::new(),
            static_dir: String::new(),
            port: 0,
            secure_cookies: false,
        };
        AppState {
            pool,
            cfg: cfg.into(),
            http: reqwest::Client::new(),
            solana: None,
            chat_rate: Default::default(),
            tts_cache: Default::default(),
            resource_cache: Default::default(),
            solari_lock: Default::default(),
        }
    }

    async fn serve_test_api(st: AppState) -> (String, tokio::task::JoinHandle<()>) {
        let router = api_router().with_state(st);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        (base, server)
    }

    async fn login_cookie(st: &AppState, base: &str, username: &str, password: &str) -> String {
        st.http
            .post(format!("{base}/api/auth/login"))
            .json(&json!({"username": username, "password": password}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_owned()
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn answer_handler_counts_checked_practice_but_not_custom_or_rejected_answers(
        pool: sqlx::PgPool,
    ) {
        let st = test_state(pool.clone());
        let user = sqlx::query_as::<_, User>(
            "INSERT INTO users (id, username, wallet_pubkey, wallet_secret)
             VALUES ('u', 'u', 'pub', 'test') RETURNING *",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO problem_sessions (id, user_id, source, template_id, concept_id, custom_ref) VALUES
             ('quest', 'u', 'quest', 'concept:fractions', 'fractions', $1),
             ('custom', 'u', 'custom_problem', NULL, NULL, $2)",
        )
        .bind(json!({
            "conceptId": "fractions",
            "practiceReason": "Practice fixture",
            "quest": { "conceptId": "fractions", "prompt": "Fixture", "answer": 2.0,
                       "tolerance": 0.01, "steps": [] }
        }))
        .bind(json!({ "numericAnswer": 2.0 }))
        .execute(&pool)
        .await
        .unwrap();

        let submit = |id: &str, text: &str| {
            answer(
                State(st.clone()),
                AuthUser(user.clone()),
                Path(id.to_owned()),
                Json(AnswerBody {
                    answer: Some(text.to_owned()),
                }),
            )
        };
        assert_eq!(
            submit("quest", "invalid").await.unwrap().status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(submit("quest", "2").await.unwrap().status(), StatusCode::OK);
        assert_eq!(
            submit("quest", "2").await.err().unwrap().status,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            submit("custom", "2").await.unwrap().status(),
            StatusCode::OK
        );
        let attempts: Vec<(String, String, bool)> = sqlx::query_as(
            "SELECT session_id, concept_id, correct FROM answer_attempts WHERE user_id = 'u'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(
            attempts,
            vec![("quest".to_owned(), "fractions".to_owned(), true)]
        );
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn signed_in_user_cannot_reach_private_data_when_personalization_is_off(
        pool: sqlx::PgPool,
    ) {
        sqlx::raw_sql(
            "INSERT INTO users (id,username,wallet_pubkey,wallet_secret) VALUES ('u','alice','fixture','fixture');
             INSERT INTO concepts (id,owner_id,title,title_key,subject,objective)
               VALUES ('private-u','u','Private fixture','private fixture','Algebra','Private objective');
             INSERT INTO concept_proposals (id,user_id,anchor_id,title,objective,reason,prereq_ids)
               VALUES ('pending','u','fractions','Pending fixture','Calculate.','Reason.',ARRAY['fractions']);
             INSERT INTO problem_sessions (id,user_id,source,concept_id,custom_ref)
               VALUES ('private-session','u','quest','private-u','{\"quest\":{\"conceptId\":\"private-u\",\"prompt\":\"Private prompt\",\"answer\":2,\"tolerance\":0.1,\"steps\":[]}}');
             INSERT INTO problem_sessions (id,user_id,template_id) VALUES ('public-session','u','alg-linear-1');",
        ).execute(&pool).await.unwrap();
        let mut st = test_state(pool.clone());
        let config = std::sync::Arc::make_mut(&mut st.cfg);
        config.elevenlabs_api_key = Some("fixture".into());
        config.elevenlabs_voice_id = Some("fixture".into());
        let password = "alice-test-password";
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = 'u'")
            .bind(hash_password(password))
            .execute(&pool)
            .await
            .unwrap();
        let (base, server) = serve_test_api(st.clone()).await;
        let cookie = login_cookie(&st, &base, "alice", password).await;
        assert!(cookie.starts_with(COOKIE));
        let get = |path: &str| {
            st.http
                .get(format!("{base}{path}"))
                .header(header::COOKIE, cookie.as_str())
        };
        let post = |path: &str| {
            st.http
                .post(format!("{base}{path}"))
                .header(header::COOKIE, cookie.as_str())
        };
        let map = get("/api/concepts")
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        assert_eq!(map["concepts"].as_array().unwrap().len(), 42);
        assert_eq!(
            get("/api/sessions/public-session")
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        assert_eq!(
            post("/api/sessions")
                .json(&json!({"conceptId":"linear-equations"}))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::OK
        );
        for response in [
            post("/api/concepts/fractions/next-step")
                .send()
                .await
                .unwrap(),
            post("/api/concepts/private-u/next-step")
                .send()
                .await
                .unwrap(),
            post("/api/concept-proposals/pending/accept")
                .send()
                .await
                .unwrap(),
            post("/api/sessions")
                .json(&json!({"conceptId":"private-u"}))
                .send()
                .await
                .unwrap(),
        ] {
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
        }
        let path = "/api/sessions/private-session";
        let mut responses = vec![
            get(path).send().await.unwrap(),
            get(&format!("{path}/resources")).send().await.unwrap(),
        ];
        for (suffix, body) in [
            ("similar", json!({})),
            ("chat", json!({"message":"Hello"})),
            ("hint", json!({})),
            ("answer", json!({"answer":"2"})),
            ("explain", json!({"text":"Private explanation."})),
            ("events", json!({"type":"hidden"})),
        ] {
            responses.push(
                post(&format!("{path}/{suffix}"))
                    .json(&body)
                    .send()
                    .await
                    .unwrap(),
            );
        }
        responses.push(
            post("/api/tts")
                .json(&json!({"sessionId":"private-session", "hintIndex":0}))
                .send()
                .await
                .unwrap(),
        );
        for response in responses {
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            assert_eq!(
                response.json::<Value>().await.unwrap()["error"],
                "Session not found."
            );
        }
        let untouched: bool = sqlx::query_scalar("SELECT NOT EXISTS (SELECT FROM concept_generation_quota) AND NOT EXISTS (SELECT FROM answer_attempts) AND NOT EXISTS (SELECT FROM events) AND EXISTS (SELECT FROM concept_proposals WHERE id = 'pending' AND accepted_concept_id IS NULL)")
            .fetch_one(&pool).await.unwrap();
        assert!(untouched);
        server.abort();
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn personalized_routes_scope_graph_and_keep_private_quests_practice_even_on_retry(
        pool: sqlx::PgPool,
    ) {
        sqlx::raw_sql(
            "INSERT INTO users (id,username,wallet_pubkey,wallet_secret) VALUES ('u','alice','u','fixture'), ('v','bob','v','fixture');
             INSERT INTO problem_sessions (id,user_id,source,template_id,concept_id,status,explain_passed) VALUES
               ('fractions','u','quest','concept:fractions','fractions','done',true),
               ('circles','u','quest','concept:circles','circles','done',true),
               ('volume','u','quest','concept:volume','volume','done',true);",

        ).execute(&pool).await.unwrap();
        let mut st = test_state(pool.clone());
        std::sync::Arc::make_mut(&mut st.cfg).personalized_concepts_enabled = true;
        let alice_password = "alice-test-password";
        let bob_password = "bob-test-password";
        sqlx::query("UPDATE users SET password_hash = CASE id WHEN 'u' THEN $1 ELSE $2 END WHERE id IN ('u','v')")
            .bind(hash_password(alice_password)).bind(hash_password(bob_password)).execute(&pool).await.unwrap();
        let (base, server) = serve_test_api(st.clone()).await;
        let alice_cookie = login_cookie(&st, &base, "alice", alice_password).await;
        let bob_cookie = login_cookie(&st, &base, "bob", bob_password).await;
        let req = |method: reqwest::Method, path: &str, as_user: Option<&str>| {
            let request = st.http.request(method, format!("{base}{path}"));
            match as_user {
                Some("u") => request.header(header::COOKIE, alice_cookie.as_str()),
                Some("v") => request.header(header::COOKIE, bob_cookie.as_str()),
                Some(other) => panic!("unexpected fixture user {other}"),
                None => request,
            }
        };
        let post = |path: &str, user: Option<&str>| req(reqwest::Method::POST, path, user);
        let get = |path: &str, user: Option<&str>| req(reqwest::Method::GET, path, user);
        let json = |response: reqwest::Response| async move {
            response
                .error_for_status()
                .unwrap()
                .json::<Value>()
                .await
                .unwrap()
        };
        let next = "/api/concepts/fractions/next-step";
        assert_eq!(
            post(next, None).send().await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
        let ready = json(post(next, Some("u")).send().await.unwrap()).await;
        assert_eq!(ready["kind"], "existing");
        assert_eq!(ready["concept"]["id"], "percentages");
        let proposal_claim = GenerationClaim::acquire(&pool, "u", "volume", Generation::Proposal)
            .await
            .unwrap();
        let busy = post("/api/concepts/volume/next-step", Some("u"))
            .send()
            .await
            .unwrap();
        assert_eq!(busy.status(), StatusCode::CONFLICT);
        assert!(
            busy.json::<Value>().await.unwrap()["error"]
                .as_str()
                .unwrap()
                .contains("in progress")
        );
        sqlx::query("INSERT INTO concept_proposals (id,user_id,anchor_id,title,objective,reason,prereq_ids)
               VALUES ('proposal','u','volume','Container capacity','Calculate the capacity of a box.','Apply volume to containers.',ARRAY['volume'])")
            .execute(&pool).await.unwrap();
        let pending = json(
            post("/api/concepts/volume/next-step", Some("u"))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(pending["proposal"]["proposalId"], "proposal");
        proposal_claim.release().await;
        let before = json(get("/api/concepts", Some("u")).send().await.unwrap()).await;
        assert_eq!(before["concepts"].as_array().unwrap().len(), 42);

        let accept_path = "/api/concept-proposals/proposal/accept";
        assert_eq!(
            post(accept_path, Some("v")).send().await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
        let accepted = json(
            post(accept_path, Some("u"))
                .json(&json!({"title":"Forged","prereqIds":[]}))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(
            json(post(accept_path, Some("u")).send().await.unwrap()).await,
            accepted
        );
        let private_id = accepted["conceptId"].as_str().unwrap();
        let map = |user| get("/api/concepts", Some(user));
        let own = json(map("u").send().await.unwrap()).await;
        let node = own["concepts"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == private_id)
            .unwrap();
        assert_eq!(node["title"], "Container capacity");
        assert_eq!(node["prereqs"], json!(["volume"]));
        assert_eq!(node["practiceOnly"], true);
        let other = json(map("v").send().await.unwrap()).await;
        assert_eq!(other["concepts"].as_array().unwrap().len(), 42);
        let private_next = format!("/api/concepts/{private_id}/next-step");
        assert_eq!(
            post(&private_next, Some("v"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        let start = |user, id| post("/api/sessions", Some(user)).json(&json!({ "conceptId": id }));
        assert_eq!(
            start("v", private_id).send().await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            start("u", "missing").send().await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
        let public_claim = GenerationClaim::acquire(&pool, "u", "chain-rule", Generation::Quest)
            .await
            .unwrap();
        assert_eq!(
            start("u", "chain-rule").send().await.unwrap().status(),
            StatusCode::CONFLICT
        );
        public_claim.release().await;
        sqlx::query("UPDATE problem_sessions SET explain_passed = false WHERE id = 'volume'")
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            start("u", private_id).send().await.unwrap().status(),
            StatusCode::CONFLICT
        );
        sqlx::query("UPDATE problem_sessions SET explain_passed = true WHERE id = 'volume'")
            .execute(&pool)
            .await
            .unwrap();
        let private_claim = GenerationClaim::acquire(&pool, "u", private_id, Generation::Quest)
            .await
            .unwrap();
        let (a, b) = tokio::join!(start("u", private_id).send(), start("u", private_id).send());
        for response in [a.unwrap(), b.unwrap()] {
            assert_eq!(response.status(), StatusCode::CONFLICT);
        }
        private_claim.release().await;

        let user: User = sqlx::query_as("SELECT * FROM users WHERE id = 'u'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let c = visible_concept(&pool, "u", private_id)
            .await
            .unwrap()
            .unwrap();
        assert!(
            prompts::quest_template(&c)[1]
                .content
                .contains("Calculate the capacity of a box.")
        );
        let quest = crate::quest::instantiate(private_id, &json!({"prompt":"A cube has side [[a]] cm. Find its volume in cubic cm.", "answerExpr":"[[a]]^3", "params":{"a":[3,8]}, "steps":["Cube the side."]}), 1).unwrap();
        let solution = quest.answer.to_string();
        sqlx::query("INSERT INTO problem_sessions (id,user_id,source,concept_id,status,wrong_attempts,custom_ref,started_at)
                     VALUES ('exhausted-private','u','quest',$1,'active',5,$2,now() - interval '1 day')")
            .bind(private_id).bind(json!({"quest":quest})).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO answer_attempts (id,user_id,session_id,concept_id,correct,hints_used,attempted_at)
                     VALUES ('old-attempt','u','exhausted-private',$1,false,0,now() - interval '1 day')")
            .bind(private_id).execute(&pool).await.unwrap();
        // Exhaustion does not reopen this session. With no provider, the replacement fails normally.
        assert_eq!(
            start("u", private_id).send().await.unwrap().status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        let (a, b) = tokio::join!(
            save_checked_quest(&st, &user, &c, None, 1, quest.clone(), None, None),
            save_checked_quest(&st, &user, &c, None, 1, quest, None, None)
        );
        let sid = a.unwrap();
        assert_eq!(b.unwrap(), sid);
        assert_ne!(sid, "exhausted-private");
        let old = json(
            get("/api/sessions/exhausted-private", Some("u"))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(old["locked"], true);
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM answer_attempts WHERE session_id = 'exhausted-private'"
            )
            .fetch_one(&pool)
            .await
            .unwrap(),
            1
        );
        sqlx::query(
            "UPDATE problem_sessions SET started_at = now() - interval '2 minutes' WHERE id = $1",
        )
        .bind(&sid)
        .execute(&pool)
        .await
        .unwrap();
        let reopened = json(start("u", private_id).send().await.unwrap()).await;
        assert_eq!(reopened["sessionId"], sid);
        let session = format!("/api/sessions/{sid}");
        assert_eq!(
            get(&session, Some("v")).send().await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
        let view = json(get(&session, Some("u")).send().await.unwrap()).await;
        assert_eq!(view["conceptId"], private_id);
        assert_eq!(view["checkedBy"], "engine");
        assert_eq!(view["practice"], true);
        assert_eq!(view["practiceReason"], PRIVATE_PRACTICE_REASON);
        assert_eq!(view["potentialReward"], 0);
        assert!(view.get("customRef").is_none());
        let submit = json(
            post(&format!("{session}/answer"), Some("u"))
                .json(&json!({"answer": solution}))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(submit["practice"], true);
        assert_eq!(submit["correct"], true);
        let explain_path = format!("{session}/explain");
        let explain = json(
            post(&explain_path, Some("u"))
                .json(&json!({"text":"I cubed the side to find the volume."}))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(explain["pass"], true);
        assert_eq!(explain["reward"]["status"], "practice");
        let reward_count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM rewards WHERE session_id = $1")
                .bind(&sid)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(reward_count, 0);
        let progress = concept_progress(&pool, "u", &utc_day(Utc::now()))
            .await
            .unwrap();
        assert_eq!(progress[private_id].proficiency, Proficiency::Demonstrated);
        assert_eq!(progress[private_id].attempts_today, 1);

        // Even a corrupt reward row or absence of a stored practice reason cannot enter mint retry.
        sqlx::query("INSERT INTO rewards (id,user_id,session_id,template_id,amount,breakdown,status) VALUES ('bogus','u',$1,$2,50,'{}','failed')")
            .bind(&sid).bind(reward_key(private_id)).execute(&pool).await.unwrap();
        let retried = json(
            post(&explain_path, Some("u"))
                .json(&json!({}))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(retried["reward"]["status"], "practice");
        let view = json(get(&session, Some("u")).send().await.unwrap()).await;
        assert!(view["reward"].is_null());
        assert_eq!(
            post(&format!("{session}/similar"), Some("u"))
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        let bank = json(start("u", "linear-equations").send().await.unwrap()).await;
        let bank_view = json(
            get(
                &format!("/api/sessions/{}", bank["sessionId"].as_str().unwrap()),
                Some("u"),
            )
            .send()
            .await
            .unwrap(),
        )
        .await;
        assert_eq!(bank_view["conceptId"], "linear-equations");
        assert_eq!(bank_view["templateId"], "alg-linear-1");
        assert_eq!(bank_view["practice"], false);
        sqlx::query("INSERT INTO problem_sessions (id,user_id,source,template_id,wrong_attempts) VALUES ('exhausted-public','u','quest','concept:fractions',5)")
            .execute(&pool).await.unwrap();
        let public = json(start("u", "fractions").send().await.unwrap()).await;
        assert_eq!(public["sessionId"], "exhausted-public");
        let old_public = json(
            post("/api/sessions", Some("u"))
                .json(&json!({"custom":{"kind":"topic","text":"Fractions","quest":true}}))
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(old_public["sessionId"], "exhausted-public");
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM concept_generation_quota")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
        server.abort();
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn id_quest_claim_rechecks_persisted_result_and_applies_shared_quota(pool: sqlx::PgPool) {
        let user: User = sqlx::query_as("INSERT INTO users (id,username,wallet_pubkey,wallet_secret) VALUES ('u','alice','fixture','fixture') RETURNING *")
            .fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO concepts (id,owner_id,title,title_key,subject,objective) VALUES ('private-u','u','Private fixture','private fixture','Algebra','Calculate.')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO problem_sessions (id,user_id,source,concept_id,wrong_attempts) VALUES ('exhausted','u','quest','private-u',5)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO concept_generation_quota VALUES ('u',(statement_timestamp() AT TIME ZONE 'UTC')::date,'quest',6)")
            .execute(&pool).await.unwrap();
        let mut st = test_state(pool.clone());
        let cfg = std::sync::Arc::make_mut(&mut st.cfg);
        cfg.personalized_concepts_enabled = true;
        cfg.openai_api_key = Some("local fixture".into());
        cfg.openai_base_url = "http://127.0.0.1:1".into(); // A regression must not contact OpenAI.
        let public = visible_concept(&pool, "u", "chain-rule")
            .await
            .unwrap()
            .unwrap();
        let private = visible_concept(&pool, "u", "private-u")
            .await
            .unwrap()
            .unwrap();
        for c in [&public, &private] {
            assert_eq!(
                start_checked_quest(&st, &user, c, None)
                    .await
                    .unwrap_err()
                    .status,
                StatusCode::TOO_MANY_REQUESTS
            );
        }
        let claim = GenerationClaim::acquire(&pool, "u", &public.id, Generation::Quest)
            .await
            .unwrap();
        // Fixture for a result saved between the first check and the claimed generation phase.
        sqlx::query("INSERT INTO problem_sessions (id,user_id,source,template_id) VALUES ('persisted','u','quest','concept:chain-rule')")
            .execute(&pool).await.unwrap();
        assert_eq!(
            build_checked_quest(&st, &user, &public, None, &claim)
                .await
                .unwrap()
                .as_deref(),
            Some("persisted")
        );
        claim.release().await;
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn typed_and_id_quest_starts_share_a_claim_before_using_quota_or_provider(
        pool: sqlx::PgPool,
    ) {
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        use tokio::sync::Notify;

        sqlx::query("INSERT INTO users (id,username,wallet_pubkey,wallet_secret) VALUES ('u','alice','fixture','fixture')")
            .execute(&pool).await.unwrap();
        let entered = Arc::new(Notify::new());
        let release = Arc::new(Notify::new());
        let calls = Arc::new(AtomicUsize::new(0));
        let stub = Router::new().route(
            "/chat/completions",
            post({
                let (entered, release, calls) = (entered.clone(), release.clone(), calls.clone());
                move || {
                    let (entered, release, calls) =
                        (entered.clone(), release.clone(), calls.clone());
                    async move {
                        let answer = if calls.fetch_add(1, Ordering::Relaxed) == 0 {
                            entered.notify_one();
                            release.notified().await;
                            json!({
                                "prompt": "Evaluate [[a]] minus itself plus forty-two.",
                                "answerExpr": "[[a]] - [[a]] + 42",
                                "params": {"a": [2, 5]},
                                "steps": ["Subtract, then add."]
                            })
                        } else {
                            json!({"numericAnswer": 42})
                        };
                        Json(json!({"choices": [{"message": {"content": answer.to_string()}}]}))
                    }
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut st = test_state(pool.clone());
        let cfg = Arc::make_mut(&mut st.cfg);
        cfg.openai_base_url = format!("http://{}", listener.local_addr().unwrap());
        cfg.openai_api_key = Some("local fixture".into());
        let cookie = format!(
            "{COOKIE}={}",
            crate::auth::make_token(&cfg.session_secret, "u")
        );
        let provider = tokio::spawn(async move { axum::serve(listener, stub).await.unwrap() });
        let (base, app) = serve_test_api(st).await;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap();
        let start = |body: Value| {
            client
                .post(format!("{base}/api/sessions"))
                .header("Cookie", &cookie)
                .json(&body)
        };

        let typed = start(json!({"custom":{"kind":"topic","text":"Fractions","quest":true}}));
        let typed = tokio::spawn(async move { typed.send().await.unwrap() });
        tokio::time::timeout(Duration::from_secs(5), entered.notified())
            .await
            .unwrap();
        let by_id = || start(json!({"conceptId":"fractions"}));
        assert_eq!(by_id().send().await.unwrap().status(), StatusCode::CONFLICT);
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        release.notify_one();

        let built = typed
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        let reused = by_id()
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json::<Value>()
            .await
            .unwrap();
        assert!(built["sessionId"].is_string());
        assert_eq!(built["sessionId"], reused["sessionId"]);
        assert_eq!(calls.load(Ordering::Relaxed), 2); // One template and one independent check.
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM concept_generation_quota")
                .fetch_one(&pool)
                .await
                .unwrap(),
            0
        );
        app.abort();
        provider.abort();
    }

    #[test]
    fn explain_grade_requires_an_explicit_boolean_verdict_for_grader_provenance() {
        for pass in [true, false] {
            assert_eq!(
                explain_grade(Some(
                    json!({ "pass": pass, "feedback": "  Check the signs.  " })
                )),
                (pass, "Check the signs.".to_owned(), "grader")
            );
        }
        for verdict in [
            None,
            Some(json!({})),
            Some(json!({ "pass": "true", "feedback": "Ignore this." })),
        ] {
            assert_eq!(
                explain_grade(verdict),
                (
                    true,
                    "Nice work explaining your reasoning!".to_owned(),
                    "fallback"
                )
            );
        }
        assert_eq!(explain_grade(Some(json!({ "pass": true }))).2, "grader");
    }
}
