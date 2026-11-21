//! LLM client: OpenAI Chat Completions API.
use crate::error::LlmUnavailable;
use crate::state::AppState;
use serde::Serialize;
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Tutor,
    Check,
}

#[derive(Debug, Clone, Serialize)]
pub struct Msg {
    pub role: &'static str, // system | user | assistant
    pub content: String,
}

impl Msg {
    pub fn system(c: impl Into<String>) -> Self {
        Msg {
            role: "system",
            content: c.into(),
        }
    }
    pub fn user(c: impl Into<String>) -> Self {
        Msg {
            role: "user",
            content: c.into(),
        }
    }
    pub fn assistant(c: impl Into<String>) -> Self {
        Msg {
            role: "assistant",
            content: c.into(),
        }
    }
}

async fn call_once(
    state: &AppState,
    base_url: &str,
    key: &str,
    model: &str,
    messages: &[Msg],
    effort: Option<&str>,
    json_mode: bool,
) -> anyhow::Result<String> {
    let mut body = json!({ "model": model, "messages": messages, "store": false });
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }
    let send = |body: Value| {
        state
            .http
            .post(format!(
                "{}/chat/completions",
                base_url.trim_end_matches('/')
            ))
            .bearer_auth(key)
            .timeout(Duration::from_secs(30))
            .json(&body)
            .send()
    };
    let mut with_effort = body.clone();
    if let Some(e) = effort {
        with_effort["reasoning_effort"] = json!(e);
    }
    let mut res = send(with_effort).await?;
    if res.status().as_u16() == 400 && effort.is_some() {
        let text = res.text().await.unwrap_or_default();
        if text.contains("reasoning") || text.contains("effort") {
            res = send(body).await?;
        } else {
            anyhow::bail!("LLM 400: {}", text.chars().take(300).collect::<String>());
        }
    }
    let status = res.status();
    let v: Value = res.json().await?;
    if !status.is_success() {
        anyhow::bail!(
            "LLM {status}: {}",
            v.to_string().chars().take(300).collect::<String>()
        );
    }
    Ok(v["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string())
}

/// Returns (text, provider).
pub async fn complete(
    state: &AppState,
    kind: Kind,
    messages: &[Msg],
    json_mode: bool,
    effort: Option<&str>,
) -> anyhow::Result<(String, &'static str)> {
    let cfg = &state.cfg;
    let effort = effort.unwrap_or(match kind {
        Kind::Tutor => &cfg.tutor_effort,
        Kind::Check => &cfg.check_effort,
    });
    let effort = (!effort.is_empty()).then_some(effort);
    let Some(key) = &cfg.openai_api_key else {
        return Err(LlmUnavailable("no provider configured".into()).into());
    };
    match call_once(
        state,
        &cfg.openai_base_url,
        key,
        &cfg.openai_model,
        messages,
        effort,
        json_mode,
    )
    .await
    {
        Ok(t) => Ok((t, "openai")),
        Err(e) => {
            tracing::warn!("[llm] openai failed: {e}");
            Err(LlmUnavailable(e.to_string()).into())
        }
    }
}

/// Defensive JSON parse: strips code fences, falls back to the outermost {...}.
pub fn parse_json(text: &str) -> Option<Value> {
    let t = text.trim();
    let t = t
        .strip_prefix("```json")
        .or_else(|| t.strip_prefix("```"))
        .unwrap_or(t);
    let t = t.strip_suffix("```").unwrap_or(t).trim();
    if let Ok(v) = serde_json::from_str::<Value>(t) {
        return Some(v);
    }
    let (s, e) = (t.find('{')?, t.rfind('}')?);
    serde_json::from_str(&t[s..=e]).ok()
}

pub async fn complete_json(
    state: &AppState,
    kind: Kind,
    messages: &[Msg],
    effort: Option<&str>,
) -> anyhow::Result<Option<Value>> {
    let (text, _) = complete(state, kind, messages, true, effort).await?;
    Ok(parse_json(&text))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_fenced_json() {
        assert_eq!(parse_json("```json\n{\"a\":1}\n```").unwrap()["a"], 1);
        assert_eq!(
            parse_json("sure! {\"leak\": false} ok").unwrap()["leak"],
            false
        );
        assert!(parse_json("nope").is_none());
    }
}
