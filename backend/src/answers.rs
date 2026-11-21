//! Final-answer checking (SPEC §9). Pure.
use crate::mathexpr::{eval_number, normalize_math};

pub const UNREADABLE: &str = "Couldn't read that answer";

/// Accepts integers, decimals, fractions, negatives, sqrt(...) and pi.
/// Rejects input over 40 chars or with other letters.
pub fn parse_answer(raw: &str) -> Result<f64, &'static str> {
    let input = normalize_math(raw);
    if input.is_empty() || input.chars().count() > 40 {
        return Err(UNREADABLE);
    }
    let lower = input.to_lowercase();
    let letters_left = lower.replace("sqrt", "").replace("pi", "");
    if letters_left.chars().any(|c| c.is_alphabetic() || c == '_' || c == '$' || c == '\\') {
        return Err(UNREADABLE);
    }
    if !lower.chars().all(|c| c.is_ascii_digit() || "+-*/^(). ".contains(c) || c.is_ascii_lowercase()) {
        return Err(UNREADABLE);
    }
    eval_number(&lower).ok_or(UNREADABLE)
}

pub fn is_correct(value: f64, answer: f64, tolerance: f64) -> bool {
    (value - answer).abs() <= tolerance.max(1e-9)
}

/// Max wrong attempts allowed: 5, and each revealed hint unlocks 2 more.
pub fn attempts_allowed(hints_used: i32) -> i32 {
    5 + 2 * hints_used
}

pub fn is_locked(wrong_attempts: i32, hints_used: i32) -> bool {
    wrong_attempts >= attempts_allowed(hints_used)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts() {
        let cases: &[(&str, f64)] = &[
            ("7", 7.0),
            ("-3", -3.0),
            ("−3", -3.0),
            ("2.5", 2.5),
            ("3/4", 0.75),
            ("-14/2", -7.0),
            ("sqrt(16)", 4.0),
            ("2*pi", 2.0 * std::f64::consts::PI),
            ("√9", 3.0),
            (" 42 ", 42.0),
        ];
        for (input, v) in cases {
            let got = parse_answer(input).unwrap_or_else(|_| panic!("rejected {input}"));
            assert!((got - v).abs() < 1e-9, "{input}");
        }
    }

    #[test]
    fn rejects() {
        let long_a = "a".repeat(41);
        let long_1 = "1".repeat(41);
        for input in ["", "x = 7", "seven", "7x", "import os", &long_a, &long_1, "1/0", "cos(0)", "e^2"] {
            assert!(parse_answer(input).is_err(), "accepted {input}");
        }
    }

    #[test]
    fn tolerance() {
        let ans = (100.0f64 / 9.8).sqrt();
        assert!(is_correct(parse_answer("3.19").unwrap(), ans, 0.05));
        assert!(!is_correct(parse_answer("3.3").unwrap(), ans, 0.05));
        assert!(is_correct(7.0, 7.0, 0.0));
        assert!(!is_correct(8.0, 7.0, 0.0));
    }

    #[test]
    fn locking() {
        assert!(!is_locked(4, 0));
        assert!(is_locked(5, 0));
        assert!(!is_locked(5, 1));
        assert!(is_locked(7, 1));
    }
}
