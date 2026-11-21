//! Solari AI Sandboxes: run AI-generated Python in an isolated VM with no network access.
//! SERVER ONLY (the key never reaches the client). Hides itself when SOLARI_API_KEY is unset.
use crate::models::new_id;
use crate::state::AppState;
use serde_json::{json, Value};
use std::time::Duration;

pub struct ExecOutput {
    pub exit_code: i64,
    pub stdout: String,
    pub stderr: String,
}

pub struct Sandbox<'a> {
    state: &'a AppState,
    key: &'a str,
    id: String,
}

fn base(state: &AppState) -> &str {
    state.cfg.solari_base_url.trim_end_matches('/')
}

impl<'a> Sandbox<'a> {
    /// Small, network-less sandbox that kills itself after 2 idle minutes if we never delete it.
    pub async fn create(state: &'a AppState) -> anyhow::Result<Sandbox<'a>> {
        let key = state.cfg.solari_api_key.as_deref().ok_or_else(|| anyhow::anyhow!("Solari not configured"))?;
        let res = state
            .http
            .post(format!("{}/sandboxes", base(state)))
            .bearer_auth(key)
            .header("Idempotency-Key", new_id())
            .timeout(Duration::from_secs(30))
            .json(&json!({
                "template": state.cfg.solari_template,
                "isolation": "hardened",
                "cpu": 1,
                "memMb": 1024,
                "timeoutMs": 120_000,
                "lifecycle": { "onTimeout": "kill" },
                "metadata": { "app": "socra" },
            }))
            .send()
            .await?;
        let status = res.status();
        let v: Value = res.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            anyhow::bail!("Solari create {status}: {}", v.to_string().chars().take(300).collect::<String>());
        }
        let id = v["sandboxId"].as_str().ok_or_else(|| anyhow::anyhow!("Solari create: no sandboxId"))?.to_string();
        Ok(Sandbox { state, key, id })
    }

    /// Runs `python3 -c <code>` synchronously (10 s limit).
    pub async fn run_python(&self, code: &str) -> anyhow::Result<ExecOutput> {
        let res = self
            .state
            .http
            .post(format!("{}/sandboxes/{}/exec", base(self.state), self.id))
            .bearer_auth(self.key)
            .timeout(Duration::from_secs(30))
            .json(&json!({ "cmd": "python3", "args": ["-c", code], "timeoutMs": 10_000 }))
            .send()
            .await?;
        let status = res.status();
        let v: Value = res.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            anyhow::bail!("Solari exec {status}: {}", v.to_string().chars().take(300).collect::<String>());
        }
        Ok(ExecOutput {
            exit_code: v["exitCode"].as_i64().unwrap_or(-1),
            stdout: v["stdout"].as_str().unwrap_or_default().chars().take(2000).collect(),
            stderr: v["stderr"].as_str().unwrap_or_default().chars().take(500).collect(),
        })
    }

    /// Best effort; the sandbox also kills itself on its idle timeout.
    pub async fn delete(self) {
        let r = self
            .state
            .http
            .delete(format!("{}/sandboxes/{}", base(self.state), self.id))
            .bearer_auth(self.key)
            .timeout(Duration::from_secs(15))
            .send()
            .await;
        if let Err(e) = r {
            tracing::warn!("[solari] delete {} failed: {e}", self.id);
        }
    }
}
