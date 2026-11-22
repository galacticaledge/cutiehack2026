//! Bring-your-own problem/topic intake (SPEC §8.6) and generated topic problems. Results are SERVER ONLY.
use crate::answers::parse_answer;
use crate::concepts::{Concept, match_alias};
use crate::context::CustomRef;
use crate::llm::{BoundedJson, Kind, Msg, complete_bounded, complete_json};
use crate::problems::get_template;
use crate::prompts;
use crate::quest::{Quest, agrees, draw_code, finish_code, instantiate, parse_code_template};
use crate::rng::Rng;
use crate::solari::Sandbox;
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
        ..Default::default()
    }
}

pub struct TopicClass<'a> {
    pub academic: bool,
    pub concept: Option<&'a Concept>,
}

/// Keep free-text/reward topic classification on the public catalog. Private practice uses IDs.
pub async fn classify_topic<'a>(
    state: &AppState,
    text: &str,
    public: &'a [Concept],
) -> TopicClass<'a> {
    if text.chars().count() <= 80
        && let Some(c) = match_alias(public, text)
    {
        return TopicClass {
            academic: true,
            concept: Some(c),
        };
    }
    match complete_json(
        state,
        Kind::Check,
        &prompts::intake_topic(text, public),
        None,
    )
    .await
    {
        Ok(Some(v)) => TopicClass {
            academic: v["academic"].as_bool() != Some(false),
            concept: v["conceptId"]
                .as_str()
                .and_then(|id| public.iter().find(|c| c.id == id)),
        },
        Ok(None) => TopicClass {
            academic: true,
            concept: None,
        },
        Err(e) => {
            tracing::warn!("[custom] topic intake failed: {e}");
            TopicClass {
                academic: true,
                concept: None,
            }
        }
    }
}

async fn math_completion(
    state: &AppState,
    messages: &[Msg],
    private: bool,
    bound: BoundedJson,
) -> anyhow::Result<Option<Value>> {
    if private {
        let text = complete_bounded(state, messages, bound).await?;
        Ok(serde_json::from_str(&text).ok())
    } else {
        complete_json(state, Kind::Tutor, messages, Some("medium")).await
    }
}

async fn independent_answer(state: &AppState, prompt: &str, private: bool) -> Option<f64> {
    let v = math_completion(
        state,
        &prompts::quest_solve(prompt),
        private,
        BoundedJson::QuestAnswer,
    )
    .await
    .ok()??;
    v["numericAnswer"].as_f64().or_else(|| {
        v["numericAnswer"]
            .as_str()
            .and_then(|s| parse_answer(s).ok())
    })
}

/// Generate a checked problem for a concept: LLM template → server-picked numbers →
/// math-engine answer → independent LLM solve must agree. None if any step fails.
pub async fn generate_quest(state: &AppState, concept: &Concept, seed: i64) -> Option<Quest> {
    if concept.is_code() && state.cfg.code_runner_enabled() {
        return generate_code_quest(state, concept, seed).await;
    }
    for attempt in 0..2 {
        let v = match math_completion(
            state,
            &prompts::quest_template(concept),
            concept.is_private(),
            BoundedJson::QuestTemplate,
        )
        .await
        {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(e) => {
                tracing::warn!("[quest] template failed: {e}");
                return None;
            }
        };
        let Some(q) = instantiate(&concept.id, &v, seed.wrapping_add(attempt)) else {
            tracing::warn!("[quest] template for {} didn't validate", concept.id);
            continue;
        };
        match independent_answer(state, &q.prompt, concept.is_private()).await {
            Some(n) if agrees(q.answer, n) => return Some(q),
            other => tracing::warn!(
                "[quest] cross-check failed for {} (independent: {other:?})",
                concept.id
            ),
        }
    }
    None
}

/// Code-tracing problem: LLM writes a program template → server picks the numbers →
/// a Solari sandbox runs the exact program shown → its printed number is the answer.
async fn generate_code_quest(state: &AppState, concept: &Concept, seed: i64) -> Option<Quest> {
    for attempt in 0..2 {
        let v = match complete_json(
            state,
            Kind::Tutor,
            &prompts::code_quest_template(concept),
            Some("medium"),
        )
        .await
        {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(e) => {
                tracing::warn!("[quest] code template failed: {e}");
                return None;
            }
        };
        let Some(tpl) = parse_code_template(&v) else {
            tracing::warn!("[quest] code template for {} didn't validate", concept.id);
            continue;
        };
        let _one_at_a_time = state.solari_lock.lock().await;
        let sbx = match Sandbox::create(state).await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("[solari] {e}");
                return None;
            }
        };
        let mut rng = Rng::new(seed.wrapping_add(attempt));
        let mut found = None;
        for _ in 0..3 {
            let Some(d) = draw_code(&tpl, &mut rng) else {
                break;
            };
            match sbx.run_python(&d.code).await {
                Ok(out) if out.exit_code == 0 => {
                    if let Some(q) = finish_code(&concept.id, d, &out.stdout) {
                        found = Some(q);
                        break;
                    }
                }
                Ok(out) => tracing::warn!(
                    "[solari] program exited {}: {}",
                    out.exit_code,
                    out.stderr.lines().last().unwrap_or_default()
                ),
                Err(e) => {
                    tracing::warn!("[solari] {e}");
                    break;
                }
            }
        }
        sbx.delete().await;
        if found.is_some() {
            tracing::info!(
                "[quest] {} answer verified by running it in a Solari sandbox",
                concept.id
            );
            return found;
        }
    }
    None
}
