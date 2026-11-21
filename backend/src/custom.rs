//! Bring-your-own problem/topic intake (SPEC §8.6). Results are SERVER ONLY.
use crate::answers::parse_answer;
use crate::context::CustomRef;
use crate::llm::{Kind, complete_json};
use crate::problems::get_template;
use crate::prompts;
use crate::state::AppState;
use serde_json::Value;

pub const CUSTOM_MAX: usize = 2000;

fn template_id(v: &Value) -> Option<String> {
    v.as_str()
        .filter(|id| get_template(id).is_some())
        .map(String::from)
}

fn fallback() -> CustomRef {
    CustomRef {
        academic: Some(true),
        solvable: Some(false),
        ..Default::default()
    }
}

/// Hidden reference-solution call. Never fails.
pub async fn intake_problem(state: &AppState, text: &str) -> CustomRef {
    let v = match complete_json(
        state,
        Kind::Tutor,
        &prompts::intake_problem(text),
        Some("medium"),
    )
    .await
    {
        Ok(Some(v)) => v,
        Ok(None) => return fallback(),
        Err(e) => {
            tracing::warn!("[custom] intake failed: {e}");
            return fallback();
        }
    };
    let final_answer = v["finalAnswer"]
        .as_str()
        .map(|s| s.chars().take(500).collect::<String>());
    let mut numeric = v["numericAnswer"].as_f64().filter(|n| n.is_finite());
    // Cross-check numericAnswer against finalAnswer with the math engine.
    if let Some(fa) = &final_answer {
        if let Ok(parsed) = parse_answer(fa) {
            match numeric {
                None => numeric = Some(parsed),
                Some(n) if (parsed - n).abs() > (n.abs() * 1e-3).max(1e-6) => numeric = None,
                _ => {}
            }
        }
    }
    CustomRef {
        academic: Some(v["academic"].as_bool() != Some(false)),
        solvable: Some(v["solvable"].as_bool().unwrap_or(false)),
        final_answer,
        numeric_answer: numeric,
        steps: v["steps"]
            .as_array()
            .map(|a| {
                a.iter()
                    .take(12)
                    .map(|s| {
                        s.as_str()
                            .map(String::from)
                            .unwrap_or_else(|| s.to_string())
                            .chars()
                            .take(400)
                            .collect()
                    })
                    .collect()
            })
            .unwrap_or_default(),
        matched_template_id: template_id(&v["matchedTemplateId"]),
    }
}

pub async fn intake_topic(state: &AppState, text: &str) -> CustomRef {
    match complete_json(state, Kind::Check, &prompts::intake_topic(text), None).await {
        Ok(Some(v)) => CustomRef {
            academic: Some(v["academic"].as_bool() != Some(false)),
            matched_template_id: template_id(&v["matchedTemplateId"]),
            ..Default::default()
        },
        Ok(None) => CustomRef {
            academic: Some(true),
            ..Default::default()
        },
        Err(e) => {
            tracing::warn!("[custom] topic intake failed: {e}");
            CustomRef {
                academic: Some(true),
                ..Default::default()
            }
        }
    }
}
