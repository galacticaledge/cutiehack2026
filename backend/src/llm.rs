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

#[derive(Clone, Copy)]
pub(crate) enum BoundedJson {
    Proposal,
    QuestTemplate,
    QuestAnswer,
}

impl BoundedJson {
    // (provider completion tokens, HTTP envelope bytes, returned content bytes)
    fn limits(self) -> (u32, usize, usize) {
        match self {
            Self::Proposal => (512, 16_384, 4096),
            Self::QuestTemplate => (2048, 32_768, 8192),
            Self::QuestAnswer => (256, 8192, 512),
        }
    }
}

async fn read_bounded_response(
    mut res: reqwest::Response,
    max_bytes: usize,
) -> anyhow::Result<Value> {
    let mut response = Vec::new();
    while let Some(chunk) = res.chunk().await? {
        anyhow::ensure!(
            chunk.len() <= max_bytes - response.len(),
            "LLM response too large"
        );
        response.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&response)?)
}

fn bounded_content(v: &Value, max_bytes: usize) -> anyhow::Result<&str> {
    let choice = &v["choices"][0];
    anyhow::ensure!(
        choice["finish_reason"] != "length",
        "LLM completion was truncated"
    );
    let content = choice["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("LLM returned no content"))?;
    anyhow::ensure!(content.len() <= max_bytes, "LLM completion too large");
    Ok(content)
}

async fn call_once(
    state: &AppState,
    base_url: &str,
    key: &str,
    model: &str,
    messages: &[Msg],
    effort: Option<&str>,
    json_mode: bool,
    bound: Option<BoundedJson>,
) -> anyhow::Result<String> {
    let mut body = json!({ "model": model, "messages": messages, "store": false });
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }
    if let Some(limit) = bound {
        body["max_completion_tokens"] = json!(limit.limits().0);
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
    let v: Value = if let Some(limit) = bound {
        read_bounded_response(res, limit.limits().1).await?
    } else {
        res.json().await?
    };
    if !status.is_success() {
        anyhow::bail!(
            "LLM {status}: {}",
            v.to_string().chars().take(300).collect::<String>()
        );
    }
    if let Some(limit) = bound {
        return Ok(bounded_content(&v, limit.limits().2)?.to_owned());
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
    call_provider(state, messages, json_mode, effort, None).await
}

/// Bounded JSON uses one provider request, without an effort-negotiation retry.
pub(crate) async fn complete_bounded(
    state: &AppState,
    messages: &[Msg],
    bound: BoundedJson,
) -> anyhow::Result<String> {
    Ok(call_provider(state, messages, true, None, Some(bound))
        .await?
        .0)
}

async fn call_provider(
    state: &AppState,
    messages: &[Msg],
    json_mode: bool,
    effort: Option<&str>,
    bound: Option<BoundedJson>,
) -> anyhow::Result<(String, &'static str)> {
    let cfg = &state.cfg;
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
        bound,
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
    serde_json::from_str(t.get(s..=e)?).ok()
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

    #[test]
    fn ordinary_json_extraction_rejects_reversed_braces() {
        for text in ["}{", "before } then {", "```json\n}{\n```", "🧮}{"] {
            assert!(parse_json(text).is_none(), "{text:?}");
        }
    }

    #[tokio::test]
    async fn bounded_quest_responses_reject_oversized_and_malformed_local_bodies() {
        use axum::{Router, extract::Path, routing::get};
        let body = |Path(mode): Path<String>| async move {
            match mode.as_str() {
                "too-large" => "x".repeat(BoundedJson::QuestTemplate.limits().1 + 1),
                "malformed" => "}{".into(),
                "too-much-content" => json!({"choices":[{"message":{"content":"x".repeat(BoundedJson::QuestAnswer.limits().2 + 1)}}]}).to_string(),
                "truncated" => json!({"choices":[{"finish_reason":"length","message":{"content":"{}"}}]}).to_string(),
                _ => json!({"choices":[{"finish_reason":"stop","message":{"content":"{\"numericAnswer\": 2}"}}]}).to_string(),
            }
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            axum::serve(listener, Router::new().route("/{mode}", get(body)))
                .await
                .unwrap()
        });
        let client = reqwest::Client::new();
        for bound in [BoundedJson::QuestTemplate, BoundedJson::QuestAnswer] {
            for mode in ["too-large", "malformed"] {
                let response = client.get(format!("{base}/{mode}")).send().await.unwrap();
                assert!(
                    read_bounded_response(response, bound.limits().1)
                        .await
                        .is_err(),
                    "{mode}"
                );
            }
        }
        let (_, max_body, max_content) = BoundedJson::QuestAnswer.limits();
        for mode in ["too-much-content", "truncated", "valid"] {
            let response = client.get(format!("{base}/{mode}")).send().await.unwrap();
            let envelope = read_bounded_response(response, max_body).await.unwrap();
            let content = bounded_content(&envelope, max_content);
            if mode == "valid" {
                assert_eq!(
                    serde_json::from_str::<Value>(content.unwrap()).unwrap()["numericAnswer"],
                    2
                );
            } else {
                assert!(content.is_err(), "{mode}");
            }
        }
        server.abort();
    }
}
