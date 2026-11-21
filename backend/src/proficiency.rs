//! Proficiency: how well a student knows each topic, carried across visits.
//!
//! Replaces "solve the same thing again" as a way to look productive. Every
//! finished trial adds to a topic's proficiency according to its quality
//! (hints, wrong tries, testimony), but repeats count less and less, cramming
//! (repeats within 12 hours) counts less again, and proficiency fades slowly
//! when a topic is left alone. Suggestions point to what to learn next.
//! The scoring is pure and unit-tested; `load` reads finished sessions.
use crate::problems::{TEMPLATES, get_template};
use crate::rewards::{attempt_mult, hint_mult};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;

/// What each topic builds on (bank templates only). A new topic is suggested once
/// its foundations are at least "Learning".
pub const PREREQS: &[(&str, &[&str])] = &[
    ("alg-linear-1", &[]),
    ("cs-trace-loop-1", &[]),
    ("calc-deriv-poly-1", &["alg-linear-1"]),
    ("kin-freefall-1", &["alg-linear-1"]),
    ("cs-trace-nested-1", &["cs-trace-loop-1"]),
];

/// One finished trial on a topic.
#[derive(Debug, Clone)]
pub struct Solve {
    pub hints_used: i32,
    pub wrong_attempts: i32,
    pub explain_passed: bool,
    pub solved_at: DateTime<Utc>,
}

/// Share of the remaining gap one perfect first solve closes.
const FIRST_SOLVE: f64 = 0.8;
/// Each repeat of the same topic counts this much of the previous one.
const REPEAT_WEIGHT: f64 = 0.5;
/// A repeat within this many hours of the last one is cramming: it counts half again.
const CRAM_HOURS: i64 = 12;
/// Daily fade when a topic is left alone, never below this share of the earned value.
const DAILY_FADE: f64 = 0.97;
const FADE_FLOOR: f64 = 0.6;

/// Quality of one solve, 0–1: the same factors as the reward (hints, wrong tries, testimony).
pub fn quality(s: &Solve) -> f64 {
    let explain = if s.explain_passed { 1.0 } else { 0.5 };
    hint_mult(s.hints_used) * attempt_mult(s.wrong_attempts) * explain
}

/// Earned proficiency (0–100) before fading, from solves in time order.
pub fn earned(solves: &[Solve]) -> f64 {
    let mut gap = 1.0;
    let mut prev: Option<DateTime<Utc>> = None;
    for (k, s) in solves.iter().enumerate() {
        let mut weight = FIRST_SOLVE * REPEAT_WEIGHT.powi(k as i32);
        if prev.is_some_and(|p| (s.solved_at - p).num_hours() < CRAM_HOURS) {
            weight *= 0.5;
        }
        gap *= 1.0 - (quality(s) * weight).clamp(0.0, 1.0);
        prev = Some(s.solved_at);
    }
    100.0 * (1.0 - gap)
}

/// Proficiency now (0–100): earned, faded by time since the last solve.
pub fn current(solves: &[Solve], now: DateTime<Utc>) -> f64 {
    let Some(last) = solves.last() else {
        return 0.0;
    };
    let days = (now - last.solved_at).num_hours().max(0) as f64 / 24.0;
    earned(solves) * DAILY_FADE.powf(days).max(FADE_FLOOR)
}

pub fn level(p: f64, solves: usize) -> &'static str {
    match (solves, p) {
        (0, _) => "Unexplored",
        (_, p) if p >= 85.0 => "Mastered",
        (_, p) if p >= 70.0 => "Skilled",
        (_, p) if p >= 40.0 => "Learning",
        _ => "Curious",
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Topic {
    pub template_id: &'static str,
    pub title: &'static str,
    pub concept: &'static str,
    pub difficulty: i32,
    pub proficiency: i64,
    pub earned: i64,
    pub level: &'static str,
    pub solves: usize,
    pub last_solved_at: Option<DateTime<Utc>>,
    /// Lost at least 5 points to time: worth a review.
    pub fading: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub template_id: &'static str,
    pub title: &'static str,
    /// "new" (never tried, foundations ready), "strengthen" (tried, not yet Skilled),
    /// "review" (fading), "foundation" (needed before something new).
    pub kind: &'static str,
    pub reason: String,
}

fn prereqs_of(id: &str) -> &'static [&'static str] {
    PREREQS
        .iter()
        .find(|(t, _)| *t == id)
        .map(|(_, p)| *p)
        .unwrap_or(&[])
}

/// Per-topic proficiency for every bank topic, in bank order.
pub fn topics(solves_by_topic: &[(&'static str, Vec<Solve>)], now: DateTime<Utc>) -> Vec<Topic> {
    TEMPLATES
        .iter()
        .map(|t| {
            let solves = solves_by_topic
                .iter()
                .find(|(id, _)| *id == t.id)
                .map(|(_, s)| s.as_slice())
                .unwrap_or(&[]);
            let e = earned(solves);
            let c = current(solves, now);
            Topic {
                template_id: t.id,
                title: t.title,
                concept: t.concept,
                difficulty: t.difficulty,
                proficiency: c.round() as i64,
                earned: e.round() as i64,
                level: level(c, solves.len()),
                solves: solves.len(),
                last_solved_at: solves.last().map(|s| s.solved_at),
                fading: e - c >= 5.0,
            }
        })
        .collect()
}

/// Up to three suggestions: fading topics to review, unfinished ones to strengthen,
/// then new topics whose foundations are ready (easiest first), else the foundation to build.
pub fn suggestions(topics: &[Topic]) -> Vec<Suggestion> {
    let by_id = |id: &str| topics.iter().find(|t| t.template_id == id);
    let ready = |id: &str| {
        prereqs_of(id)
            .iter()
            .all(|p| by_id(p).is_some_and(|t| t.proficiency >= 40))
    };
    let mut out = Vec::new();

    let mut fading: Vec<&Topic> = topics.iter().filter(|t| t.fading).collect();
    fading.sort_by_key(|t| t.proficiency);
    for t in fading.into_iter().take(1) {
        out.push(Suggestion {
            template_id: t.template_id,
            title: t.title,
            kind: "review",
            reason: format!(
                "You haven't visited in a while: {}% and fading. A quick review brings it back.",
                t.proficiency
            ),
        });
    }

    let mut weak: Vec<&Topic> = topics
        .iter()
        .filter(|t| t.solves > 0 && t.proficiency < 70 && !t.fading)
        .collect();
    weak.sort_by_key(|t| t.proficiency);
    for t in weak.into_iter().take(1) {
        out.push(Suggestion {
            template_id: t.template_id,
            title: t.title,
            kind: "strengthen",
            reason: format!(
                "{}% so far. One more clean solve, with fewer hints, would make it stick.",
                t.proficiency
            ),
        });
    }

    let mut fresh: Vec<&Topic> = topics.iter().filter(|t| t.solves == 0).collect();
    fresh.sort_by_key(|t| (!ready(t.template_id), t.difficulty));
    for t in fresh {
        if out.len() >= 3 {
            break;
        }
        if ready(t.template_id) {
            let built = prereqs_of(t.template_id)
                .iter()
                .filter_map(|p| get_template(p).map(|x| x.title))
                .collect::<Vec<_>>();
            let reason = if built.is_empty() {
                "A new door you haven't opened yet.".to_string()
            } else {
                format!("You're ready: it builds on {}.", built.join(" and "))
            };
            out.push(Suggestion {
                template_id: t.template_id,
                title: t.title,
                kind: "new",
                reason,
            });
        } else if let Some(p) = prereqs_of(t.template_id)
            .iter()
            .find(|p| by_id(p).is_none_or(|x| x.proficiency < 40))
        {
            if out.iter().any(|s| s.template_id == *p) {
                continue;
            }
            if let Some(pt) = by_id(p) {
                out.push(Suggestion {
                    template_id: pt.template_id,
                    title: pt.title,
                    kind: "foundation",
                    reason: format!("Build this first: {} grows out of it.", t.title),
                });
            }
        }
    }
    out.truncate(3);
    out
}

/// Finished bank trials for a user, grouped by topic in time order.
pub async fn load(pool: &PgPool, user_id: &str) -> anyhow::Result<Vec<(&'static str, Vec<Solve>)>> {
    let rows: Vec<(String, i32, i32, Option<bool>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT template_id, hints_used, wrong_attempts, explain_passed, solved_at FROM problem_sessions
         WHERE user_id = $1 AND source = 'bank' AND status = 'done' AND solved_at IS NOT NULL AND template_id IS NOT NULL
         ORDER BY solved_at ASC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let mut out: Vec<(&'static str, Vec<Solve>)> =
        TEMPLATES.iter().map(|t| (t.id, Vec::new())).collect();
    for (tid, hints, wrong, passed, at) in rows {
        if let Some(entry) = out.iter_mut().find(|(id, _)| *id == tid) {
            entry.1.push(Solve {
                hints_used: hints,
                wrong_attempts: wrong,
                explain_passed: passed.unwrap_or(false),
                solved_at: at,
            });
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn solve(at: DateTime<Utc>) -> Solve {
        Solve {
            hints_used: 0,
            wrong_attempts: 0,
            explain_passed: true,
            solved_at: at,
        }
    }

    #[test]
    fn one_clean_solve_is_skilled_not_mastered() {
        let t0 = Utc::now();
        let p = current(&[solve(t0)], t0);
        assert!((p - 80.0).abs() < 1e-9);
        assert_eq!(level(p, 1), "Skilled");
    }

    #[test]
    fn two_spaced_clean_solves_master_it() {
        let t0 = Utc::now();
        let s = [solve(t0), solve(t0 + Duration::days(2))];
        assert!(current(&s, t0 + Duration::days(2)) >= 85.0);
    }

    #[test]
    fn farming_repeats_barely_moves_it() {
        // ten back-to-back repeats can't beat two spaced solves by much, and never reach 100
        let t0 = Utc::now();
        let crammed: Vec<Solve> = (0..10)
            .map(|i| solve(t0 + Duration::minutes(i * 5)))
            .collect();
        let spaced = [solve(t0), solve(t0 + Duration::days(2))];
        let now = t0 + Duration::days(2);
        let c = earned(&crammed);
        assert!(c < 100.0);
        assert!(
            c - earned(&spaced) < 3.0,
            "cramming {c} vs spaced {}",
            earned(&spaced)
        );
        // the 10th repeat adds almost nothing
        assert!(earned(&crammed) - earned(&crammed[..9]) < 0.1);
        let _ = now;
    }

    #[test]
    fn quality_counts() {
        let t0 = Utc::now();
        let sloppy = Solve {
            hints_used: 3,
            wrong_attempts: 4,
            explain_passed: false,
            solved_at: t0,
        };
        assert!(earned(&[sloppy]) < 40.0);
        assert_eq!(
            level(
                earned(&[Solve {
                    hints_used: 3,
                    wrong_attempts: 4,
                    explain_passed: false,
                    solved_at: t0
                }]),
                1
            ),
            "Curious"
        );
    }

    #[test]
    fn fades_but_not_below_the_floor() {
        let t0 = Utc::now();
        let s = [solve(t0)];
        let week = current(&s, t0 + Duration::days(7));
        assert!(week < 80.0 && week > 60.0);
        let year = current(&s, t0 + Duration::days(365));
        assert!((year - 80.0 * FADE_FLOOR).abs() < 1e-9);
    }

    #[test]
    fn suggests_ready_new_topics_and_foundations() {
        let now = Utc::now();
        // nothing solved: suggest the easiest open doors (no prerequisites)
        let t = topics(&[], now);
        let s = suggestions(&t);
        assert!(!s.is_empty() && s.iter().all(|x| prereqs_of(x.template_id).is_empty()));
        // linear equations solved well: derivatives and free fall become "new", ready topics
        let t = topics(&[("alg-linear-1", vec![solve(now)])], now);
        let s = suggestions(&t);
        assert!(
            s.iter()
                .any(|x| x.kind == "new" && x.template_id == "calc-deriv-poly-1")
        );
        assert!(!s.iter().any(|x| x.template_id == "alg-linear-1"));
    }

    #[test]
    fn suggests_review_for_fading_and_strengthen_for_weak() {
        let now = Utc::now();
        let old = solve(now - Duration::days(20));
        let weak = Solve {
            hints_used: 3,
            wrong_attempts: 2,
            explain_passed: false,
            solved_at: now,
        };
        let t = topics(
            &[("alg-linear-1", vec![old]), ("cs-trace-loop-1", vec![weak])],
            now,
        );
        let s = suggestions(&t);
        assert_eq!(s[0].kind, "review");
        assert_eq!(s[0].template_id, "alg-linear-1");
        assert!(
            s.iter()
                .any(|x| x.kind == "strengthen" && x.template_id == "cs-trace-loop-1")
        );
    }
}
