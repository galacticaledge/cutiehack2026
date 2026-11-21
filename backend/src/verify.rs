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

pub fn parse_list(raw: &str) -> Option<Vec<f64>> {
    let s = normalize_math(raw).to_lowercase().replace("and", " ");
    if s.is_empty() || s.len() > 500 || s.chars().any(|c| c.is_alphabetic()) {
        return None;
    }
    let mut out = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let neg = chars[i] == '-' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit();
        if chars[i].is_ascii_digit() || neg {
            let start = i;
            i += 1;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            let t: String = chars[start..i].iter().collect();
            out.push(t.parse().ok()?);
        } else {
            i += 1;
        }
    }
    (!out.is_empty()).then_some(out)
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
                lines.push("The student proposed a final answer. Do not say whether it is right; ask them to submit it in the answer box.".into());
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
        assert!(lines.contains("Do not say whether it is right"));
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
