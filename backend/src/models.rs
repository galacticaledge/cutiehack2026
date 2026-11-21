use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::FromRow;

#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: String,
    pub username: String,
    pub wallet_pubkey: String,
    pub wallet_secret: String, // NEVER sent to client
    pub password_hash: String, // Argon2id PHC string. NEVER sent to client.
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct ProblemSession {
    pub id: String,
    pub user_id: String,
    pub source: String,
    pub template_id: Option<String>,
    pub seed: i64,
    pub custom_text: Option<String>,
    pub custom_ref: Option<Value>, // SERVER ONLY
    pub from_session_id: Option<String>,
    pub condition: String,
    pub hints_used: i32,
    pub wrong_attempts: i32,
    pub status: String,
    pub explain_passed: Option<bool>,
    pub explanation: Option<String>,
    pub explain_feedback: Option<String>,
    pub started_at: DateTime<Utc>,
    pub solved_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub verdicts: Option<Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct Event {
    pub id: String,
    pub session_id: String,
    #[sqlx(rename = "type")]
    pub kind: String,
    pub data: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct Reward {
    pub id: String,
    pub user_id: String,
    pub session_id: String,
    pub template_id: String,
    pub amount: i64,
    pub breakdown: Value,
    pub status: String,
    pub flags: Option<Value>,
    pub tx_sig: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}
