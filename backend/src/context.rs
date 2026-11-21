//! SERVER ONLY view of a session's problem (includes the answer).
use crate::models::ProblemSession;
use crate::problems::{Checkpoint, GeneratedProblem, Template, get_template};
use serde::{Deserialize, Serialize};

/// AI reference solution for custom sessions. NEVER sent to the client.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomRef {
    pub academic: Option<bool>,
    pub solvable: Option<bool>,
    pub final_answer: Option<String>,
    pub numeric_answer: Option<f64>,
    #[serde(default)]
    pub steps: Vec<String>,
    pub matched_template_id: Option<String>,
}

pub struct ProblemContext {
    pub source: String, // bank | custom_problem | custom_topic
    pub title: String,
    pub display_prompt: String, // safe for the client
    pub steps: Vec<String>,
    pub hints: Vec<String>,
    pub answer: Option<f64>, // SERVER ONLY
    pub tolerance: f64,
    pub checkpoints: Vec<Checkpoint>, // SERVER ONLY
    pub difficulty: i32,
    pub template: Option<&'static Template>,
    pub problem: Option<GeneratedProblem>,
    pub custom_ref: CustomRef,
    pub custom_text: String,
    pub academic: bool,
}

impl ProblemContext {
    pub fn is_bank(&self) -> bool {
        self.source == "bank"
    }
}

pub fn problem_context(s: &ProblemSession) -> anyhow::Result<ProblemContext> {
    if s.source == "bank" {
        let t = get_template(s.template_id.as_deref().unwrap_or_default())
            .ok_or_else(|| anyhow::anyhow!("unknown template {:?}", s.template_id))?;
        let p = (t.generate)(s.seed);
        return Ok(ProblemContext {
            source: "bank".into(),
            title: t.title.into(),
            display_prompt: p.prompt.clone(),
            steps: p.solution_steps.clone(),
            hints: p.hints.to_vec(),
            answer: Some(p.answer),
            tolerance: p.tolerance,
            checkpoints: p.checkpoints.clone(),
            difficulty: t.difficulty,
            template: Some(t),
            problem: Some(p),
            custom_ref: CustomRef::default(),
            custom_text: String::new(),
            academic: true,
        });
    }
    let r: CustomRef = s
        .custom_ref
        .clone()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let text = s.custom_text.clone().unwrap_or_default();
    let is_topic = s.source == "custom_topic";
    let numeric = r.numeric_answer.filter(|n| n.is_finite());
    Ok(ProblemContext {
        source: if is_topic {
            "custom_topic".into()
        } else {
            "custom_problem".into()
        },
        title: if is_topic {
            format!("Topic: {}", text.chars().take(60).collect::<String>())
        } else {
            "Your problem".into()
        },
        display_prompt: text.clone(),
        steps: r.steps.iter().take(12).cloned().collect(),
        hints: vec![],
        answer: if is_topic { None } else { numeric },
        tolerance: numeric.map(|n| (n.abs() * 1e-3).max(1e-6)).unwrap_or(0.0),
        checkpoints: vec![],
        difficulty: 0,
        template: None,
        problem: None,
        academic: r.academic != Some(false),
        custom_ref: r,
        custom_text: text,
    })
}
