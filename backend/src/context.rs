use crate::models::ProblemSession;
use crate::problems::{Checkpoint, CheckpointKind, GeneratedProblem, Template, get_template};
use crate::quest::{QUEST_MIN_SOLVE_SECONDS, Quest};
use serde::{Deserialize, Serialize};

/// AI reference solution for custom sessions.
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
    /// Knowledge-graph node this topic mapped to
    #[serde(default)]
    pub concept_id: Option<String>,
    /// Why this session can't earn
    #[serde(default)]
    pub practice_reason: Option<String>,
    /// Generated problem for source = "quest"
    #[serde(default)]
    pub quest: Option<Quest>,
}

pub struct ProblemContext {
    pub source: String, // One of bank, quest, custom_problem, or custom_topic
    pub title: String,
    pub display_prompt: String,
    pub steps: Vec<String>,
    pub hints: Vec<String>,
    pub answer: Option<f64>,
    pub tolerance: f64,
    pub checkpoints: Vec<Checkpoint>,
    pub difficulty: i32,
    pub min_solve_seconds: i64,
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

    pub fn is_quest(&self) -> bool {
        self.source == "quest"
    }

    pub fn earns(&self) -> bool {
        self.is_bank() || self.is_quest()
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
            min_solve_seconds: t.min_solve_seconds,
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
    if s.source == "quest" {
        let q = r
            .quest
            .clone()
            .ok_or_else(|| anyhow::anyhow!("quest session {} has no quest", s.id))?;
        return Ok(ProblemContext {
            source: "quest".into(),
            title: "New topic".into(),
            display_prompt: q.prompt.clone(),
            steps: q.steps.clone(),
            hints: vec![],
            answer: Some(q.answer),
            tolerance: q.tolerance,
            checkpoints: vec![Checkpoint {
                id: "final",
                label: "the final answer to the problem".into(),
                kind: CheckpointKind::Number {
                    value: q.answer,
                    tolerance: q.tolerance,
                },
            }],
            difficulty: 1,
            min_solve_seconds: QUEST_MIN_SOLVE_SECONDS,
            template: None,
            problem: None,
            academic: true,
            custom_ref: r,
            custom_text: text,
        });
    }
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
        min_solve_seconds: 0,
        template: None,
        problem: None,
        academic: r.academic != Some(false),
        custom_ref: r,
        custom_text: text,
    })
}
