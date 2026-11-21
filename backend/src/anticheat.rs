//! Anti-cheat flags (SPEC §11). Pure: evaluated when the correct answer is submitted.
use chrono::{DateTime, Utc};

/// The student stated the answer in chat, then couldn't sketch a sound approach for it.
pub const SKETCH_FAILED: &str = "sketch_failed";

pub struct TelemetryEvent {
    pub kind: String, // hidden | visible | paste
    pub target: Option<String>,
    pub at: DateTime<Utc>,
}

pub fn compute_flags(started_at: DateTime<Utc>, submitted_at: DateTime<Utc>, min_solve_seconds: i64, events: &[TelemetryEvent]) -> Vec<&'static str> {
    let mut flags = Vec::new();
    if (submitted_at - started_at).num_milliseconds() < min_solve_seconds * 1000 {
        flags.push("too_fast");
    }
    let mut evs: Vec<&TelemetryEvent> = events.iter().collect();
    evs.sort_by_key(|e| e.at);
    let pasted = evs.iter().any(|e| {
        e.kind == "paste"
            && e.target.as_deref().unwrap_or("answer") == "answer"
            && (submitted_at - e.at).num_milliseconds() <= 60_000
            && submitted_at >= e.at
    });
    if pasted {
        flags.push("answer_pasted");
    }
    let mut hidden_at: Option<DateTime<Utc>> = None;
    for e in &evs {
        if e.kind == "hidden" {
            hidden_at = Some(e.at);
        } else if e.kind == "visible" {
            if let Some(h) = hidden_at.take() {
                let away = (e.at - h).num_milliseconds();
                let since = (submitted_at - e.at).num_milliseconds();
                if away >= 30_000 && (0..20_000).contains(&since) {
                    flags.push("away_then_correct");
                    break;
                }
            }
        }
    }
    flags
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn ev(kind: &str, at: DateTime<Utc>) -> TelemetryEvent {
        TelemetryEvent { kind: kind.into(), target: Some("answer".into()), at }
    }

    #[test]
    fn flags() {
        let t0 = Utc::now();
        assert_eq!(compute_flags(t0, t0 + Duration::seconds(5), 20, &[]), vec!["too_fast"]);
        assert!(compute_flags(t0, t0 + Duration::seconds(60), 20, &[]).is_empty());
        let submit = t0 + Duration::seconds(100);
        assert_eq!(compute_flags(t0, submit, 20, &[ev("paste", submit - Duration::seconds(3))]), vec!["answer_pasted"]);
        let away = [ev("hidden", submit - Duration::seconds(50)), ev("visible", submit - Duration::seconds(10))];
        assert_eq!(compute_flags(t0, submit, 20, &away), vec!["away_then_correct"]);
        let short = [ev("hidden", submit - Duration::seconds(15)), ev("visible", submit - Duration::seconds(10))];
        assert!(compute_flags(t0, submit, 20, &short).is_empty());
    }
}
