//! Problem templates (SPEC §7). SERVER ONLY: `answer` and `checkpoints` never reach the client.
use crate::rng::Rng;

#[derive(Debug, Clone)]
pub enum CheckpointKind {
    Number { value: f64, tolerance: f64 },
    Expression { value: String, variable: String },
    List(Vec<f64>),
}

/// An intermediate quantity a student might state. `label` never contains the value.
#[derive(Debug, Clone)]
pub struct Checkpoint {
    pub id: &'static str,
    pub label: String,
    pub kind: CheckpointKind,
}

impl Checkpoint {
    fn number(id: &'static str, label: impl Into<String>, value: f64, tolerance: f64) -> Self {
        Checkpoint { id, label: label.into(), kind: CheckpointKind::Number { value, tolerance } }
    }
    fn list(id: &'static str, label: impl Into<String>, value: Vec<i64>) -> Self {
        Checkpoint { id, label: label.into(), kind: CheckpointKind::List(value.into_iter().map(|v| v as f64).collect()) }
    }
}

#[derive(Debug, Clone)]
pub struct GeneratedProblem {
    pub prompt: String,
    pub answer: f64,
    pub tolerance: f64,
    pub solution_steps: Vec<String>, // MUST NOT contain the final computed answer
    pub hints: [String; 3],
    pub checkpoints: Vec<Checkpoint>,
}

pub struct Template {
    pub id: &'static str,
    pub title: &'static str,
    pub concept: &'static str,
    pub difficulty: i32,
    pub min_solve_seconds: i64,
    pub learn_more_query: &'static str,
    pub generate: fn(i64) -> GeneratedProblem,
}

pub static TEMPLATES: [Template; 5] = [
    Template {
        id: "alg-linear-1",
        title: "Solve a linear equation",
        concept: "linear-equations",
        difficulty: 1,
        min_solve_seconds: 20,
        learn_more_query: "solving two-step linear equations explained",
        generate: gen_linear,
    },
    Template {
        id: "cs-trace-loop-1",
        title: "Trace a loop (CS1)",
        concept: "code-tracing-loops",
        difficulty: 2,
        min_solve_seconds: 40,
        learn_more_query: "python for loop range modulo tracing explained",
        generate: gen_trace_loop,
    },
    Template {
        id: "calc-deriv-poly-1",
        title: "Evaluate a derivative",
        concept: "derivatives-power-rule",
        difficulty: 2,
        min_solve_seconds: 40,
        learn_more_query: "power rule derivative of polynomial explained",
        generate: gen_deriv,
    },
    Template {
        id: "kin-freefall-1",
        title: "Free fall time",
        concept: "kinematics-free-fall",
        difficulty: 2,
        min_solve_seconds: 40,
        learn_more_query: "free fall time from height kinematics explained",
        generate: gen_freefall,
    },
    Template {
        id: "cs-trace-nested-1",
        title: "Count nested loop iterations (CS1)",
        concept: "code-tracing-nested-loops",
        difficulty: 3,
        min_solve_seconds: 60,
        learn_more_query: "nested loops counting iterations python explained",
        generate: gen_nested,
    },
];

pub fn get_template(id: &str) -> Option<&'static Template> {
    TEMPLATES.iter().find(|t| t.id == id)
}

fn gen_linear(seed: i64) -> GeneratedProblem {
    let mut r = Rng::new(seed);
    let a = r.int(2, 9);
    let x = r.int_except(-10, 10, &[0]);
    let b = r.int_except(-20, 20, &[0]);
    let c = a * x + b;
    let undo = if b >= 0 { format!("subtract {b} from both sides") } else { format!("add {} to both sides", -b) };
    GeneratedProblem {
        prompt: format!("Solve for $x$: ${a}x {} {} = {c}$", if b >= 0 { "+" } else { "-" }, b.abs()),
        answer: x as f64,
        tolerance: 1e-9,
        solution_steps: vec![
            format!("Undo the constant: {undo}."),
            format!("This gives {a}x = {}.", c - b),
            format!("Divide both sides by {a}."),
        ],
        hints: [
            "What operations are being applied to x, and in what order?".into(),
            "Undo operations in reverse order: addition/subtraction first, then multiplication.".into(),
            format!("After removing the constant you get ${a}x = {}$. What's next?", c - b),
        ],
        checkpoints: vec![
            Checkpoint::number("rhs", "right-hand side after removing the constant", (c - b) as f64, 1e-9),
            Checkpoint::number("final", "value of x", x as f64, 1e-9),
        ],
    }
}

fn gen_trace_loop(seed: i64) -> GeneratedProblem {
    let mut r = Rng::new(seed);
    let a = r.int(1, 5);
    let b = r.int(12, 25);
    let k = r.int(2, 4);
    // Ground truth: run the same loop.
    let range_values: Vec<i64> = (a..b).collect();
    let kept: Vec<i64> = range_values.iter().copied().filter(|i| i % k == 0).collect();
    let total: i64 = kept.iter().sum();
    let first_multiple = ((a + k - 1) / k) * k;
    let code = format!("total = 0\nfor i in range({a}, {b}):\n    if i % {k} == 0:\n        total += i\nprint(total)");
    GeneratedProblem {
        prompt: format!("What does this Python code print?\n\n```python\n{code}\n```"),
        answer: total as f64,
        tolerance: 0.0,
        solution_steps: vec![
            format!("List the values range({a}, {b}) produces: from {a} up to {} ({b} is excluded).", b - 1),
            format!("Keep only the values where i % {k} == 0, i.e. multiples of {k}."),
            "Add the kept values together; that sum is what gets printed.".into(),
        ],
        hints: [
            format!("Which values does `i` take? Is `{b}` included?"),
            "`%` gives the remainder; which values leave remainder 0?".into(),
            format!("The first value that counts is {first_multiple}. Keep going."),
        ],
        checkpoints: vec![
            Checkpoint::list("range_values", "every value of i the loop visits", range_values),
            Checkpoint::list("kept_values", "the values added to total", kept),
            Checkpoint::number("final", "the printed total", total as f64, 0.0),
        ],
    }
}

fn latex_term(coef: i64, power: &str, first: bool) -> String {
    if coef == 0 {
        return String::new();
    }
    let sign = if coef < 0 { "-" } else if first { "" } else { "+" };
    let abs = coef.abs();
    let c = if abs == 1 && !power.is_empty() { String::new() } else { abs.to_string() };
    if first { format!("{sign}{c}{power}") } else { format!(" {sign} {c}{power}") }
}

/// Power rule applied to a coefficient vector (index = power), rendered as an expression in x.
fn derivative_expr(coefs: &[i64]) -> String {
    let terms: Vec<String> = coefs
        .iter()
        .enumerate()
        .skip(1)
        .filter(|(_, c)| **c != 0)
        .map(|(p, c)| {
            let k = c * p as i64;
            match p - 1 {
                0 => format!("({k})"),
                1 => format!("({k})*x"),
                n => format!("({k})*x^{n}"),
            }
        })
        .collect();
    if terms.is_empty() { "0".into() } else { terms.join(" + ") }
}

fn gen_deriv(seed: i64) -> GeneratedProblem {
    let mut r = Rng::new(seed);
    let a = r.int_except(-5, 7, &[0]);
    let b = r.int_except(-6, 6, &[0]);
    let c = r.int_except(-9, 9, &[0]);
    let k = r.int_except(-3, 3, &[0]);
    let coefs = [0, c, b, a];
    let dfx = derivative_expr(&coefs); // computed, not hand-written
    let answer = 3 * a * k * k + 2 * b * k + c;
    let latex = latex_term(a, "x^3", true) + &latex_term(b, "x^2", false) + &latex_term(c, "x", false);
    GeneratedProblem {
        prompt: format!("Let $f(x) = {latex}$. Find $f'({k})$."),
        answer: answer as f64,
        tolerance: 1e-9,
        solution_steps: vec![
            "Apply the power rule to each term: d/dx of x^n is n·x^(n-1).".into(),
            "Write f'(x) as a polynomial in x.".into(),
            format!("Substitute x = {k} into f'(x) (the student should do the arithmetic)."),
        ],
        hints: [
            "What rule tells you the derivative of $x^n$?".into(),
            "Differentiate term by term: $\\frac{d}{dx}x^n = n x^{n-1}$, and constants multiply through.".into(),
            format!("The first term of $f'(x)$ is ${}x^2$. Find the rest, then plug in $x = {k}$.", 3 * a),
        ],
        checkpoints: vec![
            Checkpoint {
                id: "derivative",
                label: "the derivative f'(x)".into(),
                kind: CheckpointKind::Expression { value: dfx, variable: "x".into() },
            },
            Checkpoint::number("final", format!("value of f'({k})"), answer as f64, 1e-9),
        ],
    }
}

fn gen_freefall(seed: i64) -> GeneratedProblem {
    let mut r = Rng::new(seed);
    let h = r.int(20, 80) as f64;
    let g = 9.8;
    let answer = (2.0 * h / g).sqrt();
    GeneratedProblem {
        prompt: format!(
            "A ball is dropped from rest from a height of ${h}\\,\\text{{m}}$. Using $g = 9.8\\,\\text{{m/s}}^2$ and ignoring air resistance, how long does it take to hit the ground? Give your answer in seconds (2 decimal places, or an exact expression like `sqrt(...)`)."
        ),
        answer,
        tolerance: 0.05,
        solution_steps: vec![
            "The ball is dropped, so the initial velocity is v₀ = 0.".into(),
            "Use the displacement equation h = v₀t + ½gt², which becomes h = ½gt².".into(),
            "Solve for t symbolically: t² = 2h/g, so t = √(2h/g). Then the student substitutes the numbers.".into(),
        ],
        hints: [
            "What is the ball's initial velocity if it's dropped?".into(),
            "Which kinematics equation relates distance, acceleration and time when you don't know the final velocity?".into(),
            "With $v_0 = 0$ you get $h = \\tfrac{1}{2} g t^2$. Solve that for $t$.".into(),
        ],
        checkpoints: vec![
            Checkpoint::number("v0", "initial velocity", 0.0, 1e-9),
            Checkpoint::number("t_squared", "value of t squared (in s²)", 2.0 * h / g, 0.05),
            Checkpoint::number("final", "time to hit the ground", answer, 0.05),
        ],
    }
}

fn gen_nested(seed: i64) -> GeneratedProblem {
    let mut r = Rng::new(seed);
    let n = r.int(3, 6);
    let m = r.int(n + 1, n + 5);
    let inner: Vec<i64> = (0..n).map(|i| m - i).collect();
    let count: i64 = inner.iter().sum();
    let code = format!("count = 0\nfor i in range({n}):\n    for j in range(i, {m}):\n        count += 1\nprint(count)");
    GeneratedProblem {
        prompt: format!("What does this Python code print?\n\n```python\n{code}\n```"),
        answer: count as f64,
        tolerance: 0.0,
        solution_steps: vec![
            format!("The outer loop runs once for each i in range({n})."),
            format!("For a given i, the inner loop runs for j from i up to {}, so {m} - i times.", m - 1),
            "Add up the inner-loop counts for every value of i.".into(),
        ],
        hints: [
            "How many times does the outer loop run? Which values does i take?".into(),
            format!("The inner loop's start depends on i. How many values are in range(i, {m})?"),
            format!("When i = 0 the inner loop runs {m} times. How many times when i = 1?"),
        ],
        checkpoints: vec![
            Checkpoint::number("outer_count", "number of outer-loop iterations", n as f64, 0.0),
            Checkpoint::list("inner_count", "inner-loop iterations for each value of i, in order", inner),
            Checkpoint::number("final", "the printed count", count as f64, 0.0),
        ],
    }
}
