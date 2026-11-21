//! Pure reward formula (SPEC §10). Amounts here are whole tokens.
use serde::Serialize;

pub const BASE: f64 = 100.0;
/// Generated problems on knowledge-graph concepts: AI-authored, so they pay half of a d1 bank problem.
pub const QUEST_BASE: f64 = 50.0;

pub fn bank_base(difficulty: i32) -> f64 {
    BASE * difficulty as f64
}
const HINT_MULT: [f64; 4] = [1.0, 0.75, 0.5, 0.3];

pub struct RewardInput {
    pub base: f64,
    pub hints_used: i32,
    pub wrong_attempts: i32,
    pub explain_passed: bool,
    pub flagged: bool,
    pub earned_today: f64,
    pub daily_cap: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct BreakdownItem {
    pub label: &'static str,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum RewardStatus {
    Pay,
    Forfeited,
}

#[derive(Debug, Clone, Serialize)]
pub struct RewardResult {
    pub amount: i64,
    pub status: RewardStatus,
    pub breakdown: Vec<BreakdownItem>,
    pub summary: String,
    pub capped: bool,
}

pub fn hint_mult(hints_used: i32) -> f64 {
    HINT_MULT[hints_used.clamp(0, 3) as usize]
}

pub fn attempt_mult(wrong: i32) -> f64 {
    (1.0 - 0.1 * wrong.max(0) as f64).max(0.6)
}

fn fmt(n: f64) -> String {
    let r = (n * 100.0).round() / 100.0;
    if r.fract() == 0.0 {
        format!("{}", r as i64)
    } else {
        format!("{r}")
    }
}

/// Reward before the daily cap (for the "Potential reward" display).
pub fn potential_reward(base: f64, hints_used: i32, wrong: i32) -> i64 {
    let raw = base * hint_mult(hints_used) * attempt_mult(wrong);
    raw.max(0.2 * base).round() as i64
}

pub fn compute_reward(i: &RewardInput) -> RewardResult {
    let base = i.base;
    let hm = hint_mult(i.hints_used);
    let am = attempt_mult(i.wrong_attempts);
    let um = if i.explain_passed { 1.0 } else { 0.5 };
    let breakdown = vec![
        BreakdownItem {
            label: "Base",
            value: base,
        },
        BreakdownItem {
            label: "Drink Me",
            value: hm,
        },
        BreakdownItem {
            label: "Attempts",
            value: am,
        },
        BreakdownItem {
            label: "Testimony",
            value: um,
        },
    ];
    if i.flagged && !i.explain_passed {
        return RewardResult {
            amount: 0,
            status: RewardStatus::Forfeited,
            breakdown,
            summary:
                "Suspicious solve and the testimony didn't convince the court: off with the tarts!"
                    .into(),
            capped: false,
        };
    }
    let raw = base * hm * am * um;
    let floored = raw.max(0.2 * base).round() as i64;
    let room = (i.daily_cap - i.earned_today).max(0.0).floor() as i64;
    let amount = floored.min(room).max(0);
    let capped = amount < floored;
    let parts: Vec<String> = breakdown
        .iter()
        .enumerate()
        .filter(|(idx, b)| *idx == 0 || b.value != 1.0)
        .map(|(_, b)| format!("{} {}", b.label, fmt(b.value)))
        .collect();
    let mut summary = format!("{} = {} TARTS", parts.join(" × "), floored);
    if raw < 0.2 * base {
        summary.push_str(" (minimum)");
    }
    if capped {
        if amount == 0 {
            summary.push_str(" · daily cap reached");
        } else {
            summary.push_str(&format!(" · capped to {amount} by the daily limit"));
        }
    }
    RewardResult {
        amount,
        status: RewardStatus::Pay,
        breakdown,
        summary,
        capped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn base() -> RewardInput {
        RewardInput {
            base: bank_base(1),
            hints_used: 0,
            wrong_attempts: 0,
            explain_passed: true,
            flagged: false,
            earned_today: 0.0,
            daily_cap: 1000.0,
        }
    }

    #[test]
    fn d1_clean_is_100() {
        assert_eq!(compute_reward(&base()).amount, 100);
    }
    #[test]
    fn floor_applies() {
        let r = compute_reward(&RewardInput {
            hints_used: 3,
            wrong_attempts: 6,
            explain_passed: false,
            ..base()
        });
        assert_eq!(r.amount, 20);
        assert_eq!(r.status, RewardStatus::Pay);
    }
    #[test]
    fn d2_one_hint_is_150() {
        assert_eq!(
            compute_reward(&RewardInput {
                base: bank_base(2),
                hints_used: 1,
                ..base()
            })
            .amount,
            150
        );
    }
    #[test]
    fn attempt_mult_bottoms_out() {
        assert_eq!(
            compute_reward(&RewardInput {
                wrong_attempts: 2,
                ..base()
            })
            .amount,
            80
        );
        assert_eq!(
            compute_reward(&RewardInput {
                wrong_attempts: 10,
                ..base()
            })
            .amount,
            60
        );
    }
    #[test]
    fn cap_clamps() {
        let r = compute_reward(&RewardInput {
            base: bank_base(2),
            earned_today: 950.0,
            ..base()
        });
        assert_eq!(r.amount, 50);
        assert!(r.capped);
    }
    #[test]
    fn cap_reached_is_zero() {
        assert_eq!(
            compute_reward(&RewardInput {
                earned_today: 1000.0,
                ..base()
            })
            .amount,
            0
        );
        assert_eq!(
            compute_reward(&RewardInput {
                earned_today: 1200.0,
                ..base()
            })
            .amount,
            0
        );
    }
    #[test]
    fn flagged_failed_is_forfeited() {
        let r = compute_reward(&RewardInput {
            flagged: true,
            explain_passed: false,
            ..base()
        });
        assert_eq!(r.amount, 0);
        assert_eq!(r.status, RewardStatus::Forfeited);
    }
    #[test]
    fn flagged_passed_pays() {
        let r = compute_reward(&RewardInput {
            flagged: true,
            ..base()
        });
        assert_eq!(r.amount, 100);
    }
    #[test]
    fn quest_base_pays_half() {
        assert_eq!(
            compute_reward(&RewardInput {
                base: QUEST_BASE,
                ..base()
            })
            .amount,
            50
        );
        assert_eq!(
            compute_reward(&RewardInput {
                base: QUEST_BASE,
                hints_used: 3,
                wrong_attempts: 9,
                explain_passed: false,
                ..base()
            })
            .amount,
            10
        );
        assert_eq!(potential_reward(QUEST_BASE, 0, 1), 45);
    }
    #[test]
    fn summary_text() {
        let r = compute_reward(&RewardInput {
            base: bank_base(2),
            hints_used: 1,
            wrong_attempts: 1,
            ..base()
        });
        assert_eq!(r.amount, 135);
        assert_eq!(
            r.summary,
            "Base 200 × Drink Me 0.75 × Attempts 0.9 = 135 TARTS"
        );
    }
}
