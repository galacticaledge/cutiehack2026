//! Generated problems for knowledge-graph concepts ("quests"). Pure.
//!
//! The LLM writes a template with [[a]]-style placeholders and an answer expression. The
//! server picks the numbers and the math engine computes the answer, so the student never
//! authors the problem and the stored answer is never typed by the LLM.
//!
//! Code-tracing concepts use a Python program instead: the server fills in the numbers and
//! runs it in a Solari sandbox, and whatever it prints is the answer (ground truth by execution).
use crate::answers::parse_answer;
use crate::leak::extract_numbers;
use crate::mathexpr::{eval_number, normalize_math};
use crate::rng::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const QUEST_MIN_SOLVE_SECONDS: i64 = 60;

/// SERVER ONLY (lives in custom_ref). Only `prompt` is ever shown to the student.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Quest {
    pub concept_id: String,
    pub prompt: String,
    pub answer: f64,
    pub tolerance: f64,
    pub steps: Vec<String>,
    /// Answer came from running the shown program in a Solari sandbox (vs. the math engine).
    #[serde(default)]
    pub ran_in_sandbox: bool,
}

type Ranges = Vec<(String, i64, i64)>;

/// 1-4 placeholders named a-h with integer ranges at least 3 values wide; each must appear in every `texts`.
fn parse_params(v: &Value, texts: &[&str]) -> Option<Ranges> {
    let params = v["params"].as_object()?;
    // At least one randomized number, so the answer can't be looked up or shared.
    if params.is_empty() || params.len() > 4 {
        return None;
    }
    let mut ranges = Vec::new();
    for (name, r) in params {
        let mut chars = name.chars();
        let (Some(ch), None) = (chars.next(), chars.next()) else {
            return None;
        };
        if !('a'..='h').contains(&ch) {
            return None;
        }
        let arr = r.as_array()?;
        let (lo, hi) = (arr.first()?.as_i64()?, arr.get(1)?.as_i64()?);
        if !(-10_000..=10_000).contains(&lo) || !(-10_000..=10_000).contains(&hi) || hi - lo < 2 {
            return None;
        }
        let ph = format!("[[{ch}]]");
        if texts.iter().any(|t| !t.contains(&ph)) {
            return None;
        }
        ranges.push((ph, lo, hi));
    }
    Some(ranges)
}

fn parse_steps(v: &Value) -> Vec<String> {
    v["steps"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str())
                .take(8)
                .map(|s| s.chars().take(400).collect())
                .collect()
        })
        .unwrap_or_default()
}

fn draw(ranges: &Ranges, rng: &mut Rng) -> Vec<(String, i64)> {
    ranges
        .iter()
        .map(|(ph, lo, hi)| (ph.clone(), rng.int(*lo, *hi)))
        .collect()
}

fn substitute(s: &str, vals: &[(String, i64)], paren: bool) -> String {
    vals.iter().fold(s.to_string(), |acc, (ph, n)| {
        acc.replace(
            ph.as_str(),
            &if paren {
                format!("({n})")
            } else {
                n.to_string()
            },
        )
    })
}

/// Shared final checks: sane size, not readable off the problem text, sig-fig note.
fn finish(
    concept_id: &str,
    prompt: String,
    answer: f64,
    steps: Vec<String>,
    ran_in_sandbox: bool,
) -> Option<Quest> {
    if !answer.is_finite() || answer.abs() > 1e9 {
        return None;
    }
    let tol = tolerance_for(answer);
    if extract_numbers(&prompt)
        .iter()
        .any(|n| (n - answer).abs() <= tol)
    {
        return None;
    }
    let note = if (answer - answer.round()).abs() > 1e-9 {
        "\n\nGive your answer to at least 3 significant figures."
    } else {
        ""
    };
    Some(Quest {
        concept_id: concept_id.to_string(),
        prompt: format!("{prompt}{note}"),
        answer,
        tolerance: tol,
        steps,
        ran_in_sandbox,
    })
}

pub fn tolerance_for(answer: f64) -> f64 {
    (answer.abs() * 5e-3).max(1e-6)
}

/// Does an independent solve agree with the engine's answer?
pub fn agrees(engine: f64, independent: f64) -> bool {
    (engine - independent).abs() <= (engine.abs() * 1e-2).max(1e-6)
}

/// Turn the LLM's math template JSON into a concrete problem. None if it doesn't validate.
pub fn instantiate(concept_id: &str, v: &Value, seed: i64) -> Option<Quest> {
    let prompt = v["prompt"].as_str()?.trim();
    let expr = v["answerExpr"].as_str()?.trim();
    if prompt.is_empty()
        || prompt.chars().count() > 1500
        || expr.is_empty()
        || expr.chars().count() > 300
    {
        return None;
    }
    let ranges = parse_params(v, &[prompt, expr])?;
    let steps = parse_steps(v);
    let mut rng = Rng::new(seed);
    for _ in 0..20 {
        let vals = draw(&ranges, &mut rng);
        let (p, e) = (
            substitute(prompt, &vals, false),
            substitute(expr, &vals, true),
        );
        if p.contains("[[") || e.contains("[[") {
            return None; // placeholder without a range
        }
        let Some(ans) = eval_number(&normalize_math(&e)) else {
            continue;
        };
        if let Some(q) = finish(
            concept_id,
            p,
            ans,
            steps.iter().map(|s| substitute(s, &vals, false)).collect(),
            false,
        ) {
            return Some(q);
        }
    }
    None
}

/// A Python code-tracing template: the student predicts what the program prints.
pub struct CodeTemplate {
    intro: String,
    code: String,
    ranges: Ranges,
    steps: Vec<String>,
}

/// One concrete draw: the exact program the student sees is the program the sandbox runs.
pub struct CodeDraw {
    pub code: String,
    prompt: String,
    steps: Vec<String>,
}

pub fn parse_code_template(v: &Value) -> Option<CodeTemplate> {
    let intro = v["prompt"].as_str().unwrap_or_default().trim().to_string();
    let code = v["code"]
        .as_str()?
        .trim_matches('\n')
        .trim_end()
        .to_string();
    if code.is_empty()
        || code.chars().count() > 1500
        || code.lines().count() > 40
        || intro.chars().count() > 600
    {
        return None;
    }
    // Deterministic, non-interactive programs only (the sandbox is the security boundary).
    if ["input(", "random", "time.", "datetime", "```"]
        .iter()
        .any(|bad| code.contains(bad))
    {
        return None;
    }
    let ranges = parse_params(v, &[&code])?;
    Some(CodeTemplate {
        intro,
        code,
        ranges,
        steps: parse_steps(v),
    })
}

pub fn draw_code(t: &CodeTemplate, rng: &mut Rng) -> Option<CodeDraw> {
    let vals = draw(&t.ranges, rng);
    let code = substitute(&t.code, &vals, false);
    let intro = substitute(&t.intro, &vals, false);
    if code.contains("[[") || intro.contains("[[") {
        return None;
    }
    let lead = if intro.is_empty() {
        String::new()
    } else {
        format!("{intro}\n\n")
    };
    Some(CodeDraw {
        prompt: format!("{lead}```python\n{code}\n```\n\nWhat number does this program print?"),
        code,
        steps: t
            .steps
            .iter()
            .map(|s| substitute(s, &vals, false))
            .collect(),
    })
}

/// The program's output must be exactly one number; that number is the answer.
pub fn finish_code(concept_id: &str, d: CodeDraw, stdout: &str) -> Option<Quest> {
    let out = stdout.trim();
    if out.is_empty() || out.lines().count() != 1 {
        return None;
    }
    let ans = parse_answer(out).ok()?;
    finish(concept_id, d.prompt, ans, d.steps, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tpl() -> Value {
        json!({
            "prompt": "A car travels [[a]] km in [[b]] hours at constant speed. What is its speed in km/h?",
            "params": { "a": [100, 400], "b": [2, 5] },
            "answerExpr": "[[a]] / [[b]]",
            "steps": ["Speed is distance over time.", "Divide [[a]] by [[b]]."]
        })
    }

    #[test]
    fn instantiates_with_engine_answer() {
        let q = instantiate("constant-velocity", &tpl(), 42).unwrap();
        assert!(!q.prompt.contains("[["));
        let nums = extract_numbers(&q.prompt);
        let (a, b) = (nums[0], nums[1]);
        assert!((q.answer - a / b).abs() < 1e-9);
        assert!(q.steps[1].contains(&format!("{a}")));
        assert_eq!(q.concept_id, "constant-velocity");
    }

    #[test]
    fn same_seed_same_problem_different_seed_varies() {
        assert_eq!(instantiate("x", &tpl(), 7), instantiate("x", &tpl(), 7));
        let distinct: std::collections::HashSet<String> = (0..20)
            .map(|s| instantiate("x", &tpl(), s).unwrap().prompt)
            .collect();
        assert!(distinct.len() > 5);
    }

    #[test]
    fn non_integer_answers_ask_for_sig_figs() {
        let v = json!({ "prompt": "What is [[a]] divided by 7?", "params": { "a": [10, 13] }, "answerExpr": "[[a]]/7" });
        let q = instantiate("fractions", &v, 1).unwrap();
        assert!(q.prompt.ends_with("significant figures."));
    }

    #[test]
    fn rejects_bad_templates() {
        let mut v = tpl();
        v["params"] = json!({});
        assert!(instantiate("x", &v, 1).is_none(), "no randomized numbers");
        let mut v = tpl();
        v["params"] = json!({ "a": [100, 400], "b": [2, 5], "zz": [1, 9] });
        assert!(instantiate("x", &v, 1).is_none(), "bad placeholder name");
        let mut v = tpl();
        v["params"]["a"][0] = json!(i64::MIN);
        assert!(instantiate("x", &v, 1).is_none(), "out-of-range bound");
        let mut v = tpl();
        v["params"] = json!({ "a": [100, 400], "b": [3, 3] });
        assert!(instantiate("x", &v, 1).is_none(), "fixed number");
        let mut v = tpl();
        v["answerExpr"] = json!("[[a]] / [[c]]");
        assert!(instantiate("x", &v, 1).is_none(), "unknown placeholder");
        let mut v = tpl();
        v["answerExpr"] = json!("[[a]] / [[b]] + y");
        assert!(
            instantiate("x", &v, 1).is_none(),
            "free variable can't evaluate"
        );
        let mut v = tpl();
        v["prompt"] = json!("Speed? [[a]] km in 2 hours");
        assert!(
            instantiate("x", &v, 1).is_none(),
            "param missing from prompt"
        );
    }

    #[test]
    fn answer_never_appears_in_prompt() {
        // Answer equals the input for every draw → never valid.
        let v = json!({ "prompt": "What is [[a]] times 1?", "params": { "a": [2, 9] }, "answerExpr": "[[a]] * 1" });
        assert!(instantiate("x", &v, 3).is_none());
    }

    #[test]
    fn division_by_zero_redraws() {
        let v = json!({ "prompt": "Compute 12 / ([[a]] - 3).", "params": { "a": [2, 4] }, "answerExpr": "12 / ([[a]] - 3)" });
        for seed in 0..10 {
            if let Some(q) = instantiate("x", &v, seed) {
                assert!(q.answer.is_finite());
            }
        }
    }

    fn code_tpl() -> Value {
        json!({
            "prompt": "Trace this recursive function.",
            "code": "def f(n):\n    if n <= 1:\n        return 1\n    return n * f(n - 1)\n\nprint(f([[a]]) + [[b]])",
            "params": { "a": [3, 6], "b": [1, 9] },
            "steps": ["f([[a]]) calls f([[a]] - 1)"]
        })
    }

    #[test]
    fn code_draw_shows_exactly_the_program_it_runs() {
        let t = parse_code_template(&code_tpl()).unwrap();
        let d = draw_code(&t, &mut Rng::new(5)).unwrap();
        assert!(!d.code.contains("[["));
        assert!(d.prompt.contains(&d.code));
        assert!(d.prompt.ends_with("What number does this program print?"));
    }

    #[test]
    fn code_answer_comes_from_stdout() {
        let t = parse_code_template(&code_tpl()).unwrap();
        let d = draw_code(&t, &mut Rng::new(5)).unwrap();
        let q = finish_code("recursion", d, "727\n").unwrap();
        assert_eq!(q.answer, 727.0);
        assert!(q.ran_in_sandbox);
        assert!(!q.prompt.contains("727"));
    }

    #[test]
    fn code_output_must_be_one_number() {
        let t = parse_code_template(&code_tpl()).unwrap();
        for bad in ["", "1\n2", "True", "hello", "[1, 2]"] {
            let d = draw_code(&t, &mut Rng::new(5)).unwrap();
            assert!(finish_code("recursion", d, bad).is_none(), "{bad:?}");
        }
        // The printed number can't just be a number already in the code.
        let d = draw_code(&t, &mut Rng::new(5)).unwrap();
        assert!(finish_code("recursion", d, "1").is_none());
    }

    #[test]
    fn rejects_bad_code_templates() {
        let mut v = code_tpl();
        v["code"] = json!("n = int(input())\nprint(n + [[a]] + [[b]])");
        assert!(parse_code_template(&v).is_none(), "interactive");
        let mut v = code_tpl();
        v["code"] = json!("import random\nprint(random.randint(1, [[a]]) + [[b]])");
        assert!(parse_code_template(&v).is_none(), "nondeterministic");
        let mut v = code_tpl();
        v["code"] = json!("print([[a]])");
        assert!(parse_code_template(&v).is_none(), "param b unused");
    }

    #[test]
    fn cross_check_tolerance() {
        assert!(agrees(66.6667, 66.67));
        assert!(!agrees(66.6667, 70.0));
        assert!(agrees(0.0, 0.0));
    }
}
