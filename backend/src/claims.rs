//! Neuro-symbolic step verification (SPEC §8.5).
//! NEURAL: extract claims (extractor sees checkpoint ids + labels only, never values).
//! SYMBOLIC: verify with the math engine against template ground truth.
use crate::llm::{Kind, complete_json};
use crate::problems::Checkpoint;
use crate::prompts;
use crate::state::AppState;
use crate::verify::{Claim, Verdict, looks_mathy, verify_claims};

/// Never fails: on any error returns no verdicts so the tutor still replies.
pub async fn verify_message(
    state: &AppState,
    message: &str,
    checkpoints: &[Checkpoint],
) -> Vec<Verdict> {
    if checkpoints.is_empty() || !looks_mathy(message) {
        return vec![];
    }
    match complete_json(
        state,
        Kind::Check,
        &prompts::claim_extraction(message, checkpoints),
        None,
    )
    .await
    {
        Ok(Some(v)) => {
            let claims: Vec<Claim> = v["claims"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|c| {
                            let id = c["checkpointId"].as_str()?;
                            let claimed = match &c["claimed"] {
                                serde_json::Value::String(s) => s.clone(),
                                serde_json::Value::Null => return None,
                                other => other.to_string(),
                            };
                            Some(Claim {
                                checkpoint_id: id.to_string(),
                                claimed,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            verify_claims(&claims, checkpoints)
        }
        Ok(None) => vec![],
        Err(e) => {
            tracing::warn!("[claims] extractor failed; continuing without verdicts: {e}");
            vec![]
        }
    }
}
