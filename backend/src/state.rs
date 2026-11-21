use crate::config::Config;
use crate::solana::Solana;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub cfg: Arc<Config>,
    pub http: reqwest::Client,
    pub solana: Option<Arc<Solana>>,
    pub chat_rate: Arc<Mutex<HashMap<String, Instant>>>,
    pub tts_cache: Arc<Mutex<HashMap<String, bytes_cache::Bytes>>>,
    pub resource_cache: Arc<Mutex<HashMap<String, Vec<crate::resources::Link>>>>,
    /// One Solari sandbox at a time (free plan concurrency is 1).
    pub solari_lock: Arc<tokio::sync::Mutex<()>>,
}

pub mod bytes_cache {
    pub type Bytes = std::sync::Arc<Vec<u8>>;
}

impl AppState {
    pub async fn new(cfg: Config) -> anyhow::Result<Self> {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(10)
            .connect(&cfg.database_url)
            .await?;
        let solana = match Solana::from_config(&cfg) {
            Ok(s) => Some(Arc::new(s)),
            Err(e) => {
                tracing::warn!("Solana minting disabled: {e}");
                None
            }
        };
        Ok(AppState {
            pool,
            cfg: Arc::new(cfg),
            http: reqwest::Client::builder().build()?,
            solana,
            chat_rate: Default::default(),
            tts_cache: Default::default(),
            resource_cache: Default::default(),
            solari_lock: Default::default(),
        })
    }
}
