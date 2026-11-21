//! ElevenLabs read-aloud (P2). Only ever speaks stored, leak-checked text.
use crate::state::AppState;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

/// Turn markdown + LaTeX into something a voice can read.
pub fn to_speakable(text: &str) -> String {
    let mut s = text.replace("```", " ");
    // \frac{a}{b} → a over b ; \sqrt{x} → square root of x
    for (pat, word) in [("\\dfrac{", "\\frac{"), ("\\tfrac{", "\\frac{")] {
        s = s.replace(pat, word);
    }
    while let Some(i) = s.find("\\frac{") {
        let rest = &s[i + 6..];
        let Some(a_end) = rest.find("}{") else { break };
        let Some(b_end) = rest[a_end + 2..].find('}') else {
            break;
        };
        let a = rest[..a_end].to_string();
        let b = rest[a_end + 2..a_end + 2 + b_end].to_string();
        s = format!("{}{a} over {b}{}", &s[..i], &rest[a_end + 2 + b_end + 1..]);
    }
    let s = s
        .replace("\\sqrt{", "square root of {")
        .replace("sqrt(", "square root of (")
        .replace("^{2}", " squared")
        .replace("^2", " squared")
        .replace("^{3}", " cubed")
        .replace("^3", " cubed")
        .replace('^', " to the power ")
        .replace("\\cdot", " times ")
        .replace("\\times", " times ")
        .replace("\\text", "")
        .replace("\\,", " ")
        .replace('=', " equals ");
    let cleaned: String = s.chars().filter(|c| !"{}$`*_#>\\".contains(*c)).collect();
    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(1200)
        .collect()
}

pub async fn synthesize(state: &AppState, text: &str) -> anyhow::Result<Arc<Vec<u8>>> {
    let speakable = to_speakable(text);
    let key = hex::encode(Sha256::digest(speakable.as_bytes()));
    if let Some(hit) = state.tts_cache.lock().unwrap().get(&key) {
        return Ok(hit.clone());
    }
    let cfg = &state.cfg;
    let voice = cfg.elevenlabs_voice_id.as_deref().unwrap_or_default();
    let res = state
        .http
        .post(format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{voice}"
        ))
        .header(
            "xi-api-key",
            cfg.elevenlabs_api_key.as_deref().unwrap_or_default(),
        )
        .header("Accept", "audio/mpeg")
        .timeout(Duration::from_secs(15))
        .json(&serde_json::json!({ "text": speakable, "model_id": cfg.elevenlabs_model_id }))
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        anyhow::bail!(
            "ElevenLabs {status}: {}",
            res.text()
                .await
                .unwrap_or_default()
                .chars()
                .take(200)
                .collect::<String>()
        );
    }
    let bytes = Arc::new(res.bytes().await?.to_vec());
    let mut cache = state.tts_cache.lock().unwrap();
    if cache.len() > 200 {
        cache.clear();
    }
    cache.insert(key, bytes.clone());
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn speakable() {
        assert_eq!(
            to_speakable("So $x^2 = \\frac{14}{2}$?"),
            "So x squared equals 14 over 2?"
        );
        assert_eq!(
            to_speakable("**Try** $\\sqrt{16}$"),
            "Try square root of 16"
        );
    }
}
