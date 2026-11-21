use crate::mathexpr::{eval, eval_number, normalize_math, parse};
use crate::problems::{Checkpoint, CheckpointKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    #[serde(rename = "checkpointId")]
    pub checkpoint_id: String,
    pub claimed: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Correct,
    Incorrect,
    Unverifiable,
    Final,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verdict {
    #[serde(rename = "checkpointId")]
    pub checkpoint_id: String,
    pub label: String,
    pub claimed: String,
    pub status: Status,
}

/// Client-safe chip: label only, only correct/incorrect.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Chip {
    pub label: String,
    pub status: Status,
}

fn rhs(raw: &str) -> String {
    let s = normalize_math(raw);
    match s.rfind('=') {
        Some(i) => s[i + 1..].trim().to_string(),
        None => s,
    }
}

/// A list of values, each of which may be arithmetic ("4, 4*2, 4*3" → [4, 8, 12]).
/// Items split on commas/semicolons/"and", or on whitespace when there are no commas.
/// Any item that doesn't evaluate makes the whole list unverifiable (never a false ✗).
pub fn parse_list(raw: &str) -> Option<Vec<f64>> {
    let lower = normalize_math(raw).to_lowercase();
    let s = lower
        .trim()
        .trim_start_matches(['[', '(', '{'])
        .trim_end_matches([']', ')', '}', '.']);
    if s.is_empty() || s.len() > 500 {
        return None;
    }
    let s = s.replace(" and ", ",").replace(';', ",");
    let items: Vec<&str> = if s.contains(',') {
        s.split(',').collect()
    } else {
        s.split_whitespace().collect()
    };
    let mut out = Vec::new();
    for item in items {
        let item = item.trim();
        let item = item.strip_prefix("and ").unwrap_or(item).trim();
        if !item.is_empty() {
            out.push(eval_number(item)?);
        }
    }
    (!out.is_empty()).then_some(out)
}

fn squash(s: &str) -> String {
    normalize_math(s)
        .to_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace() && !"[](){}".contains(*c))
        .collect()
}

/// The extractor must quote the student: a claim whose text isn't in the message is dropped.
pub fn claim_in_message(claimed: &str, message: &str) -> bool {
    let c = squash(claimed);
    !c.is_empty() && squash(message).contains(&c)
}

const SAMPLE_POINTS: [f64; 5] = [0.37, 1.3, -0.8, 2.1, -1.7];

/// Some(true/false) if both parse and are (in)equivalent at sample points; None if unparseable.
pub fn equivalent(a: &str, b: &str, var: &str) -> Option<bool> {
    let ea = parse(&rhs(a), Some(var))?;
    let eb = parse(&rhs(b), Some(var))?;
    for p in SAMPLE_POINTS {
        let (va, vb) = (eval(&ea, p), eval(&eb, p));
        if !va.is_finite() || !vb.is_finite() {
            return None;
        }
        if (va - vb).abs() > 1e-6 * 1f64.max(va.abs()).max(vb.abs()) {
            return Some(false);
        }
    }
    Some(true)
}

pub fn verify_claim(claim: &Claim, checkpoints: &[Checkpoint]) -> Verdict {
    let claimed: String = claim.claimed.chars().take(200).collect();
    let Some(cp) = checkpoints.iter().find(|c| c.id == claim.checkpoint_id) else {
        return Verdict {
            checkpoint_id: claim.checkpoint_id.clone(),
            label: String::new(),
            claimed,
            status: Status::Unverifiable,
        };
    };
    let mk = |status| Verdict {
        checkpoint_id: cp.id.to_string(),
        label: cp.label.clone(),
        claimed: claimed.clone(),
        status,
    };
    // The final answer is never verified in chat.
    if cp.id == "final" {
        return mk(Status::Final);
    }
    let status = match &cp.kind {
        CheckpointKind::Number { value, tolerance } => match eval_number(&rhs(&claimed)) {
            None => Status::Unverifiable,
            Some(n) if (n - value).abs() <= tolerance.max(1e-9) => Status::Correct,
            Some(_) => Status::Incorrect,
        },
        CheckpointKind::Expression { value, variable } => {
            match equivalent(&claimed, value, variable) {
                None => Status::Unverifiable,
                Some(true) => Status::Correct,
                Some(false) => Status::Incorrect,
            }
        }
        CheckpointKind::List(expected) => match parse_list(&claimed) {
            None => Status::Unverifiable,
            Some(list)
                if list.len() == expected.len()
                    && list.iter().zip(expected).all(|(a, b)| (a - b).abs() < 1e-9) =>
            {
                Status::Correct
            }
            Some(_) => Status::Incorrect,
        },
    };
    mk(status)
}

pub fn verify_claims(claims: &[Claim], checkpoints: &[Checkpoint]) -> Vec<Verdict> {
    claims
        .iter()
        .take(6)
        .map(|c| verify_claim(c, checkpoints))
        .collect()
}

/// Lines for the tutor prompt. Never include expected values.
pub fn verdict_lines(verdicts: &[Verdict]) -> Vec<String> {
    let mut lines = Vec::new();
    let mut final_added = false;
    for v in verdicts {
        match v.status {
            Status::Final if !final_added => {
                lines.push("The student stated a final answer. Do not say or hint whether it is right. Ask in one light question for the general idea of how they got it (rules 11-12), then have them enter it in the answer box.".into());
                final_added = true;
            }
            Status::Final => {}
            Status::Correct => {
                lines.push(format!("{}: student said {} → CORRECT", v.label, v.claimed))
            }
            Status::Incorrect => lines.push(format!(
                "{}: student said {} → INCORRECT",
                v.label, v.claimed
            )),
            Status::Unverifiable if !v.label.is_empty() => lines.push(format!(
                "{}: student said {} → could not be checked",
                v.label, v.claimed
            )),
            Status::Unverifiable => {}
        }
    }
    lines
}

pub fn verdict_chips(verdicts: &[Verdict]) -> Vec<Chip> {
    verdicts
        .iter()
        .filter(|v| matches!(v.status, Status::Correct | Status::Incorrect))
        .map(|v| Chip {
            label: v.label.clone(),
            status: v.status,
        })
        .collect()
}

/// Did this stored user message state a final answer? (Its verdicts include a "final" claim.)
pub fn stated_final(verdicts: Option<&serde_json::Value>) -> bool {
    verdicts
        .and_then(|v| v.as_array())
        .is_some_and(|a| a.iter().any(|v| v["status"] == "final"))
}

/// Tutor-prompt fact after the student's sketch of how they got a stated answer was graded.
pub fn sketch_line(sound: bool) -> String {
    if sound {
        "The student's general approach for the answer they stated is SOUND. Say so briefly and have them enter their answer in the answer box. Do not say whether the number itself is right.".into()
    } else {
        "The student's sketch of how they got their stated answer does NOT hold up: treat this as them not understanding the problem yet. Do not send them to the answer box and do not say whether the number is right. Go back to the first step and guide them one step at a time (rules 8-10), starting with one question about that first step.".into()
    }
}

/// Gate: skip the extractor for messages with no digits, operators or code-like tokens.
pub fn looks_mathy(message: &str) -> bool {
    let m = message.to_lowercase();
    m.chars()
        .any(|c| c.is_ascii_digit() || "+*/^=<>%[]".contains(c))
        || m.contains(" - ")
        || ["sqrt", "pi", "range", "print"]
            .iter()
            .any(|w| m.contains(w))
        || m.split(|c: char| !c.is_alphanumeric()).any(|w| w == "x")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::problems::TEMPLATES;

    fn cps() -> Vec<Checkpoint> {
        vec![
            Checkpoint {
                id: "rhs",
                label: "right-hand side after removing the constant".into(),
                kind: CheckpointKind::Number {
                    value: 21.0,
                    tolerance: 1e-9,
                },
            },
            Checkpoint {
                id: "t2",
                label: "t squared".into(),
                kind: CheckpointKind::Number {
                    value: 10.2,
                    tolerance: 0.05,
                },
            },
            Checkpoint {
                id: "derivative",
                label: "the derivative f'(x)".into(),
                kind: CheckpointKind::Expression {
                    value: "21*x^2+8*x-3".into(),
                    variable: "x".into(),
                },
            },
            Checkpoint {
                id: "kept_values",
                label: "the values added to total".into(),
                kind: CheckpointKind::List(vec![3.0, 6.0, 9.0]),
            },
            Checkpoint {
                id: "final",
                label: "value of x".into(),
                kind: CheckpointKind::Number {
                    value: 7.0,
                    tolerance: 1e-9,
                },
            },
        ]
    }
    fn v(id: &str, claimed: &str) -> Status {
        verify_claim(
            &Claim {
                checkpoint_id: id.into(),
                claimed: claimed.into(),
            },
            &cps(),
        )
        .status
    }

    #[test]
    fn numbers() {
        assert_eq!(v("rhs", "21"), Status::Correct);
        assert_eq!(v("rhs", "20"), Status::Incorrect);
        assert_eq!(v("rhs", "42/2"), Status::Correct);
        assert_eq!(v("t2", "10.22"), Status::Correct);
        assert_eq!(v("t2", "10.4"), Status::Incorrect);
    }

    #[test]
    fn expressions() {
        assert_eq!(v("derivative", "21x^2+8x-3"), Status::Correct);
        assert_eq!(v("derivative", "8x - 3 + 21*x^2"), Status::Correct);
        assert_eq!(v("derivative", "f'(x) = 21x^2 + 8x - 3"), Status::Correct);
        assert_eq!(v("derivative", "21x^2 + 8x"), Status::Incorrect);
    }

    #[test]
    fn lists() {
        assert_eq!(v("kept_values", "[3, 6, 9]"), Status::Correct);
        assert_eq!(v("kept_values", "3, 6 and 9"), Status::Correct);
        assert_eq!(v("kept_values", "[9, 6, 3]"), Status::Incorrect);
        assert_eq!(v("kept_values", "[3, 6]"), Status::Incorrect);
    }

    #[test]
    fn list_items_can_be_arithmetic() {
        assert_eq!(
            parse_list("4, 4*2, 4*3, 4*4"),
            Some(vec![4.0, 8.0, 12.0, 16.0])
        );
        assert_eq!(parse_list("3 6 9"), Some(vec![3.0, 6.0, 9.0]));
        assert_eq!(parse_list("[3, 6, 9]."), Some(vec![3.0, 6.0, 9.0]));
        assert_eq!(v("kept_values", "3, 3*2, 3*3"), Status::Correct);
        // Can't read an item → unverifiable, never a false ✗.
        assert_eq!(v("kept_values", "3, 6, then 9"), Status::Unverifiable);
        assert_eq!(v("kept_values", "multiples of 3"), Status::Unverifiable);
    }
    #[test]
    fn detects_a_stated_final_answer() {
        let finals = serde_json::json!([{ "checkpointId": "final", "label": "x", "claimed": "7", "status": "final" }]);
        let other = serde_json::json!([{ "checkpointId": "rhs", "label": "x", "claimed": "7", "status": "correct" }]);
        assert!(stated_final(Some(&finals)));
        assert!(!stated_final(Some(&other)));
        assert!(!stated_final(None));
        assert!(sketch_line(false).contains("first step"));
        assert!(!sketch_line(false).contains("answer box.")); // never sends a failed sketch to submit
    }
    #[test]
    fn claims_must_quote_the_student() {
        assert!(claim_in_message("[4, 8, 12, 16]", "4, 8, 12, 16"));
        assert!(claim_in_message("4, 4*2", "Multiples of 4. 4, 4*2, 4*3"));
        assert!(!claim_in_message(
            "[4, 8, 12, 16]",
            "Multiples of 4. 4, 4*2, 4*3, 4*4"
        ));
        assert!(!claim_in_message("", "anything"));
    }
    #[test]
    fn garbage_is_unverifiable() {
        assert_eq!(v("rhs", "banana"), Status::Unverifiable);
        assert_eq!(v("derivative", "import os"), Status::Unverifiable);
        assert_eq!(v("kept_values", "some numbers"), Status::Unverifiable);
        assert_eq!(v("unknown", "21"), Status::Unverifiable);
    }

    #[test]
    fn final_never_judged() {
        assert_eq!(v("final", "7"), Status::Final);
        assert_eq!(v("final", "8"), Status::Final);
    }

    #[test]
    fn rendering_never_leaks_expected_values() {
        let verdicts = verify_claims(
            &[
                Claim {
                    checkpoint_id: "rhs".into(),
                    claimed: "20".into(),
                },
                Claim {
                    checkpoint_id: "final".into(),
                    claimed: "7".into(),
                },
                Claim {
                    checkpoint_id: "kept_values".into(),
                    claimed: "[3,6,9]".into(),
                },
            ],
            &cps(),
        );
        let lines = verdict_lines(&verdicts).join("\n");
        assert!(lines.contains("student said 20 → INCORRECT"));
        assert!(!lines.contains("21"));
        assert!(lines.contains("Do not say or hint whether it is right"));
        assert!(lines.contains("general idea"));
        assert_eq!(
            verdict_chips(&verdicts),
            vec![
                Chip {
                    label: "right-hand side after removing the constant".into(),
                    status: Status::Incorrect
                },
                Chip {
                    label: "the values added to total".into(),
                    status: Status::Correct
                },
            ]
        );
    }

    #[test]
    fn templates_self_consistent() {
        for t in TEMPLATES.iter() {
            for seed in [1, 2, 3, 42, 999, 123456] {
                let p = (t.generate)(seed);
                assert!(p.checkpoints.iter().any(|c| c.id == "final"));
                assert!(crate::answers::is_correct(p.answer, p.answer, p.tolerance));
                for c in &p.checkpoints {
                    if c.id == "final" {
                        continue;
                    }
                    let claimed = match &c.kind {
                        CheckpointKind::Number { value, .. } => value.to_string(),
                        CheckpointKind::Expression { value, .. } => value.clone(),
                        CheckpointKind::List(l) => format!("{l:?}"),
                    };
                    let verdict = verify_claim(
                        &Claim {
                            checkpoint_id: c.id.into(),
                            claimed: claimed.clone(),
                        },
                        &p.checkpoints,
                    );
                    assert_eq!(
                        verdict.status,
                        Status::Correct,
                        "{} {} {claimed}",
                        t.id,
                        c.id
                    );
                }
                // steps never state the final answer as a standalone number (beyond the prompt)
                let steps = p.solution_steps.join(" ");
                assert!(
                    !crate::leak::deterministic_leak(&steps, p.answer, p.tolerance, &p.prompt)
                        || t.id == "kin-freefall-1",
                    "{} seed {seed} steps leak",
                    t.id
                );
            }
        }
    }

    #[test]
    fn different_seeds_differ() {
        for t in TEMPLATES.iter() {
            let prompts: std::collections::HashSet<String> =
                (1..6).map(|s| (t.generate)(s).prompt).collect();
            assert!(prompts.len() > 1, "{}", t.id);
        }
    }

    #[test]
    fn derivative_matches_numeric_slope() {
        let p = (TEMPLATES[2].generate)(77);
        let CheckpointKind::Expression { value, .. } = &p.checkpoints[0].kind else {
            panic!()
        };
        let e = parse(value, Some("x")).unwrap();
        // f'(k) from the derivative expression must equal the stored answer
        let k: f64 = p
            .prompt
            .split("f'(")
            .nth(1)
            .unwrap()
            .split(')')
            .next()
            .unwrap()
            .parse()
            .unwrap();
        assert!((eval(&e, k) - p.answer).abs() < 1e-9);
    }
}
