//! Environment configuration. All secrets are server-only.

#[derive(Debug, Clone)]
pub struct Config {
    pub openai_api_key: Option<String>,
    pub openai_base_url: String,
    pub openai_model: String,
    pub tutor_effort: String,
    pub check_effort: String,
    pub database_url: String,
    pub session_secret: String,
    pub daily_cap: f64,
    pub demo_fixed_seeds: bool,
    pub solana_rpc_url: String,
    pub mint_authority_secret: Option<String>,
    pub mint_address: Option<String>,
    pub token_decimals: u8,
    pub elevenlabs_api_key: Option<String>,
    pub elevenlabs_voice_id: Option<String>,
    pub elevenlabs_model_id: String,
    pub keenable_api_key: Option<String>,
    pub keenable_base_url: String,
    pub static_dir: String,
    pub port: u16,
    pub secure_cookies: bool,
}

fn var(k: &str) -> Option<String> {
    std::env::var(k)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn or(k: &str, d: &str) -> String {
    var(k).unwrap_or_else(|| d.to_string())
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let session_secret = var("SESSION_SECRET").unwrap_or_default();
        if session_secret.len() < 32 {
            anyhow::bail!("SESSION_SECRET must be set (32+ chars)");
        }
        Ok(Config {
            openai_api_key: var("OPENAI_API_KEY"),
            openai_base_url: or("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            openai_model: or("OPENAI_MODEL", "gpt-6.1-terra"),
            tutor_effort: or("LLM_TUTOR_EFFORT", "low"),
            check_effort: or("LLM_CHECK_EFFORT", "none"),
            database_url: var("DATABASE_URL")
                .ok_or_else(|| anyhow::anyhow!("DATABASE_URL must be set"))?,
            session_secret,
            daily_cap: or("DAILY_TOKEN_CAP", "1000").parse().unwrap_or(1000.0),
            demo_fixed_seeds: or("DEMO_FIXED_SEEDS", "false") == "true",
            solana_rpc_url: or("SOLANA_RPC_URL", "https://api.devnet.solana.com"),
            mint_authority_secret: var("MINT_AUTHORITY_SECRET"),
            mint_address: var("MINT_ADDRESS"),
            token_decimals: or("TOKEN_DECIMALS", "2").parse().unwrap_or(2),
            elevenlabs_api_key: var("ELEVENLABS_API_KEY"),
            elevenlabs_voice_id: var("ELEVENLABS_VOICE_ID"),
            elevenlabs_model_id: or("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5"),
            keenable_api_key: var("KEENABLE_API_KEY"),
            keenable_base_url: or("KEENABLE_BASE_URL", "https://api.keenable.ai"),
            static_dir: or("STATIC_DIR", "../frontend/dist"),
            port: or("PORT", "3000").parse().unwrap_or(3000),
            secure_cookies: or("SECURE_COOKIES", "false") == "true",
        })
    }

    pub fn tts_enabled(&self) -> bool {
        self.elevenlabs_api_key.is_some() && self.elevenlabs_voice_id.is_some()
    }
    pub fn resources_enabled(&self) -> bool {
        self.keenable_api_key.is_some()
    }
    pub fn active_llm_provider(&self) -> &'static str {
        if self.openai_api_key.is_some() {
            "openai"
        } else {
            "none"
        }
    }
    pub fn to_base_units(&self, learn: f64) -> i64 {
        (learn * 10f64.powi(self.token_decimals as i32)).round() as i64
    }
    pub fn from_base_units(&self, base: i64) -> f64 {
        base as f64 / 10f64.powi(self.token_decimals as i32)
    }
}
