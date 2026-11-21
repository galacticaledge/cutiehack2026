//! Tutor reply generation + leak/contradiction guard (SPEC §8.3). Runs on EVERY tutor reply.
use crate::context::ProblemContext;
use crate::leak::{deterministic_leak, LEAK_FALLBACK};
use crate::llm::{complete, complete_json, Kind, Msg};
use crate::models::Message;
use crate::prompts;
use crate::state::AppState;

struct Guard {
    leak: bool,
    contradicts: bool,
    reason: String,
}

async fn guard(state: &AppState, ctx: &ProblemContext, reply: &str, verdict_lines: &[String]) -> Guard {
    if let Some(ans) = ctx.answer {
        if deterministic_leak(reply, ans, ctx.tolerance, &ctx.display_prompt) {
            return Guard { leak: true, contradicts: false, reason: "reply contains the final answer".into() };
        }
    }
    match complete_json(state, Kind::Check, &prompts::leak_check(ctx, reply, verdict_lines), None).await {
        Ok(Some(v)) => Guard {
            leak: v["leak"].as_bool().unwrap_or(false),
            contradicts: v["contradicts"].as_bool().unwrap_or(false),
            reason: v["reason"].as_str().unwrap_or_default().to_string(),
        },
        Ok(None) => Guard { leak: false, contradicts: false, reason: String::new() },
        Err(e) => {
            tracing::warn!("[leak] LLM check failed; deterministic check only: {e}");
            Guard { leak: false, contradicts: false, reason: String::new() }
        }
    }
}

pub struct TutorReply {
    pub reply: String,
    pub provider: &'static str,
    pub blocked: bool,
}

pub async fn tutor_reply(
    state: &AppState,
    ctx: &ProblemContext,
    hints_used: i32,
    history: &[Message],
    verdict_lines: &[String],
    extra_system: Option<String>,
) -> anyhow::Result<TutorReply> {
    let mut messages = vec![Msg::system(prompts::tutor_system_prompt(ctx, hints_used, verdict_lines))];
    let start = history.len().saturating_sub(20);
    for m in &history[start..] {
        messages.push(if m.role == "tutor" { Msg::assistant(m.content.clone()) } else { Msg::user(m.content.clone()) });
    }
    if let Some(extra) = extra_system {
        messages.push(Msg::system(extra));
    }

    let (first, provider) = complete(state, Kind::Tutor, &messages, false, None).await?;
    let draft = first.trim().to_string();
    let g = guard(state, ctx, &draft, verdict_lines).await;
    if !g.leak && !g.contradicts && !draft.is_empty() {
        return Ok(TutorReply { reply: draft, provider, blocked: false });
    }
    tracing::warn!("[leak] draft rejected ({}): {}", if g.leak { "leak" } else if g.contradicts { "contradiction" } else { "empty" }, g.reason);
    let note = if g.leak {
        "Your previous draft revealed too much. Rewrite it without stating or implying the final answer, and ask one guiding question.".to_string()
    } else {
        format!("Your previous draft contradicted a verified fact: {}. Rewrite it so it agrees with the verified facts.", g.reason)
    };
    messages.push(Msg::assistant(draft));
    messages.push(Msg::system(note));
    let (second, provider) = complete(state, Kind::Tutor, &messages, false, None).await?;
    let draft = second.trim().to_string();
    let g = guard(state, ctx, &draft, verdict_lines).await;
    if !g.leak && !g.contradicts && !draft.is_empty() {
        return Ok(TutorReply { reply: draft, provider, blocked: false });
    }
    tracing::warn!("[leak] blocked");
    Ok(TutorReply { reply: LEAK_FALLBACK.into(), provider, blocked: true })
}
