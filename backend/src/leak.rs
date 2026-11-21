//! Deterministic leak check (SPEC §8.3 step 1). Pure.

pub const LEAK_FALLBACK: &str = "Good progress! What do you think the next step is, and why?";

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '.'
}

/// Scan a number starting at `i` (which must be a digit). Returns (value, end index).
fn scan_number(chars: &[char], mut i: usize) -> (f64, usize) {
    let start = i;
    while i < chars.len() && chars[i].is_ascii_digit() {
        i += 1;
    }
    // thousands separators: ,ddd
    while i + 3 < chars.len() + 0
        && chars[i] == ','
        && chars[i + 1..i + 4].iter().all(|c| c.is_ascii_digit())
        && !(i + 4 < chars.len() && chars[i + 4].is_ascii_digit())
    {
        i += 4;
    }
    if i + 1 < chars.len() && chars[i] == '.' && chars[i + 1].is_ascii_digit() {
        i += 1;
        while i < chars.len() && chars[i].is_ascii_digit() {
            i += 1;
        }
    }
    let text: String = chars[start..i].iter().filter(|c| **c != ',').collect();
    (text.parse().unwrap_or(f64::NAN), i)
}

/// Extract numbers: plain numbers, negatives, decimals, `a/b` and `\frac{a}{b}`.
pub fn extract_numbers(text: &str) -> Vec<f64> {
    let normalized = text.replace(['−', '–'], "-");
    // \frac{a}{b} → a/b
    let mut t = normalized.clone();
    for cmd in ["\\dfrac", "\\tfrac", "\\frac"] {
        t = t.replace(cmd, " \\frac");
    }
    let t = t
        .replace("\\frac", "")
        .replace("}{", "/")
        .replace(['{', '}'], " ");
    let chars: Vec<char> = t.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let neg_start = c == '-'
            && i + 1 < chars.len()
            && chars[i + 1].is_ascii_digit()
            && !prev.is_some_and(is_word);
        if neg_start || (c.is_ascii_digit() && !prev.is_some_and(is_word)) {
            let neg = c == '-';
            let (mut v, mut end) = scan_number(&chars, if neg { i + 1 } else { i });
            if neg {
                v = -v;
            }
            out.push(v);
            // simple fraction a / b
            let mut j = end;
            while j < chars.len() && chars[j] == ' ' {
                j += 1;
            }
            if j < chars.len() && chars[j] == '/' {
                j += 1;
                while j < chars.len() && chars[j] == ' ' {
                    j += 1;
                }
                if j < chars.len() && chars[j].is_ascii_digit() {
                    let (d, e2) = scan_number(&chars, j);
                    out.push(d);
                    if d != 0.0 {
                        out.push(v / d);
                    }
                    end = e2;
                }
            }
            i = end;
        } else {
            i += 1;
        }
    }
    out.retain(|n| n.is_finite());
    out
}

fn near(a: f64, b: f64, tol: f64) -> bool {
    (a - b).abs() <= tol.max(1e-9)
}

/// True if the reply contains a number within tolerance of the answer that isn't already in the prompt.
pub fn deterministic_leak(reply: &str, answer: f64, tolerance: f64, prompt: &str) -> bool {
    let prompt_nums = extract_numbers(prompt);
    let in_prompt = |n: f64| prompt_nums.iter().any(|p| near(*p, n, tolerance));
    extract_numbers(reply).into_iter().any(|n| {
        let hit = near(n, answer, tolerance) || (answer < 0.0 && near(n, -answer, tolerance));
        hit && !in_prompt(n)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    const PROMPT: &str = "Solve for $x$: $2x + 3 = 17$";

    #[test]
    fn catches_leaks() {
        for reply in [
            "So x = 7.",
            "x equals 7",
            "That gives $x = \\frac{14}{2}$",
            "You get 14/2, which is the answer.",
            "Great, so $x=7$!",
        ] {
            assert!(
                deterministic_leak(reply, 7.0, 1e-9, PROMPT),
                "missed: {reply}"
            );
        }
    }
    #[test]
    fn passes_prompt_numbers_only() {
        assert!(!deterministic_leak(
            "You have $2x + 3 = 17$. What could you do with the 3?",
            7.0,
            1e-9,
            PROMPT
        ));
    }
    #[test]
    fn passes_intermediate_numbers() {
        assert!(!deterministic_leak(
            "Nice, $2x = 14$. What's next?",
            7.0,
            1e-9,
            PROMPT
        ));
    }
    #[test]
    fn answer_in_prompt_not_flagged() {
        assert!(!deterministic_leak(
            "Look at the 3 on the left.",
            3.0,
            1e-9,
            PROMPT
        ));
    }
    #[test]
    fn negative_answers() {
        let p = "Solve for $x$: $3x + 5 = -16$";
        assert!(deterministic_leak("x = −7", -7.0, 1e-9, p));
        assert!(deterministic_leak("x is negative 7", -7.0, 1e-9, p));
    }
    #[test]
    fn decimal_tolerance() {
        let ans = (100.0f64 / 9.8).sqrt();
        assert!(deterministic_leak(
            "about 3.19 seconds",
            ans,
            0.05,
            "dropped from 50 m"
        ));
        assert!(!deterministic_leak(
            "use g = 9.8",
            ans,
            0.05,
            "dropped from 50 m"
        ));
    }
    #[test]
    fn commas_and_fracs() {
        let n = extract_numbers("1,234 and \\dfrac{3}{4}");
        assert!(n.contains(&1234.0));
        assert!(n.contains(&0.75));
        assert!(!extract_numbers("5-7").contains(&-7.0));
    }
}
