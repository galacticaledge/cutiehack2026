//! Keenable "Go deeper" links after a solve (P2). Allowlisted domains only.
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
pub struct Link {
    pub title: String,
    pub url: String,
    pub domain: String,
}

const ALLOW: [&str; 7] = [
    "khanacademy.org",
    "openstax.org",
    "libretexts.org",
    "mathsisfun.com",
    "wikipedia.org",
    "physicsclassroom.com",
    "tutorial.math.lamar.edu",
];

pub fn allowed_domain(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let host = rest.split(['/', '?', '#']).next()?.split(':').next()?.to_lowercase();
    ALLOW
        .iter()
        .any(|d| host == *d || host.ends_with(&format!(".{d}")))
        .then(|| host.trim_start_matches("www.").to_string())
}

/// Never fails; returns [] on any error so the panel hides.
pub async fn learn_more_links(state: &AppState, template_id: &str, query: &str) -> Vec<Link> {
    let Some(key) = state.cfg.keenable_api_key.as_deref() else { return vec![] };
    if let Some(hit) = state.resource_cache.lock().unwrap().get(template_id) {
        return hit.clone();
    }
    let res = state
        .http
        .post(format!("{}/v1/search", state.cfg.keenable_base_url.trim_end_matches('/')))
        .header("X-API-Key", key)
        .timeout(Duration::from_secs(5))
        .json(&serde_json::json!({ "query": query, "max_results": 20 }))
        .send()
        .await;
    let data: Value = match res {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or(Value::Null),
        Ok(r) => {
            tracing::warn!("[resources] Keenable {}", r.status());
            return vec![];
        }
        Err(e) => {
            tracing::warn!("[resources] Keenable failed: {e}");
            return vec![];
        }
    };
    let mut links: Vec<Link> = Vec::new();
    for r in data["results"].as_array().into_iter().flatten() {
        let Some(url) = r["url"].as_str() else { continue };
        let Some(domain) = allowed_domain(url) else { continue };
        if links.iter().any(|l| l.url == url) {
            continue;
        }
        let title = r["title"].as_str().unwrap_or(&domain).chars().take(120).collect();
        links.push(Link { title, url: url.to_string(), domain });
        if links.len() == 3 {
            break;
        }
    }
    state.resource_cache.lock().unwrap().insert(template_id.to_string(), links.clone());
    links
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn allowlist() {
        assert_eq!(allowed_domain("https://www.khanacademy.org/math/x").as_deref(), Some("khanacademy.org"));
        assert_eq!(allowed_domain("https://en.wikipedia.org/wiki/Free_fall").as_deref(), Some("en.wikipedia.org"));
        assert!(allowed_domain("https://evil-khanacademy.org/").is_none());
        assert!(allowed_domain("https://khanacademy.org.evil.com/").is_none());
        assert!(allowed_domain("javascript:alert(1)").is_none());
    }
}
