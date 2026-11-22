use crate::auth::AuthUser;
use crate::error::ApiResult;
use crate::models::Reward;
use crate::problems::get_template;
use crate::rewards::{
    BreakdownItem, QUEST_BASE, RewardInput, RewardStatus, attempt_mult, bank_base, compute_reward,
    hint_mult,
};
use crate::sessions::{earned_today, reward_json, topic_rewards_today};
use crate::solana::explorer_address_url;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Query, State};
use chrono::{Days, NaiveDate, Utc};
use serde::Deserialize;
use serde_json::{Value, json};

const HISTORY_DAYS: u64 = 14;

#[derive(sqlx::FromRow)]
struct LedgerRow {
    #[sqlx(flatten)]
    reward: Reward,
    concept_title: Option<String>,
}

pub async fn treasury(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
) -> ApiResult<Json<Value>> {
    let rows: Vec<LedgerRow> = sqlx::query_as(
        "SELECT r.*, c.title AS concept_title FROM rewards r
         LEFT JOIN concepts c ON r.template_id = 'concept:' || c.id AND (c.owner_id IS NULL OR c.owner_id = r.user_id)
         WHERE r.user_id = $1 ORDER BY r.created_at DESC",
    )
    .bind(&user.id)
    .fetch_all(&st.pool)
    .await?;

    let today = Utc::now().date_naive();
    let first_day = today - Days::new(HISTORY_DAYS - 1);
    let mut daily = vec![0.0f64; HISTORY_DAYS as usize];
    let (mut paid, mut paid_count, mut forfeited_count, mut pending_count) = (0.0, 0, 0, 0);
    for r in rows.iter().map(|r| &r.reward) {
        let amount = st.cfg.from_base_units(r.amount);
        match r.status.as_str() {
            "paid" => {
                paid += amount;
                paid_count += 1;
                let day = r.created_at.date_naive();
                if day >= first_day {
                    daily[(day - first_day).num_days() as usize] += amount;
                }
            }
            "forfeited" => forfeited_count += 1,
            _ => pending_count += 1,
        }
    }

    let ledger: Vec<Value> = rows
        .iter()
        .map(|row| {
            let r = &row.reward;
            let (kind, title) = match r.template_id.strip_prefix("concept:") {
                Some(id) => (
                    "topic",
                    row.concept_title.clone().unwrap_or_else(|| id.to_string()),
                ),
                None => (
                    "problem",
                    get_template(&r.template_id)
                        .map_or_else(|| r.template_id.clone(), |t| t.title.to_string()),
                ),
            };
            let mut v = reward_json(&st.cfg, r);
            v["sessionId"] = json!(r.session_id);
            v["kind"] = json!(kind);
            v["title"] = json!(title);
            v["createdAt"] = json!(r.created_at);
            v
        })
        .collect();

    Ok(Json(json!({
        "earnedToday": earned_today(&st, &user.id).await?,
        "dailyCap": st.cfg.daily_cap,
        "topicRewardsToday": topic_rewards_today(&st.pool, &user.id).await?,
        "dailyTopicCap": st.cfg.daily_topic_cap,
        "mintUrl": st.cfg.mint_address.as_deref().map(explorer_address_url),
        "totals": {
            "paid": paid,
            "paidCount": paid_count,
            "forfeitedCount": forfeited_count,
            "pendingCount": pending_count,
        },
        "daily": daily_series(first_day, &daily),
        "ledger": ledger,
        "rates": {
            "bankBase": [bank_base(1), bank_base(2), bank_base(3)],
            "questBase": QUEST_BASE,
            "hintMult": (0..4).map(hint_mult).collect::<Vec<_>>(),
            "attemptStep": 1.0 - attempt_mult(1),
            "attemptFloor": attempt_mult(i32::MAX),
            "testimonyMiss": 0.5,
            "minimumShare": 0.2,
        },
    })))
}

fn daily_series(first_day: NaiveDate, amounts: &[f64]) -> Vec<Value> {
    amounts
        .iter()
        .enumerate()
        .map(|(i, a)| json!({ "date": first_day + Days::new(i as u64), "amount": a }))
        .collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateQuery {
    kind: String,
    #[serde(default = "one")]
    difficulty: i32,
    #[serde(default)]
    hints: i32,
    #[serde(default)]
    wrong: i32,
    #[serde(default = "yes")]
    testimony: bool,
}

fn one() -> i32 {
    1
}
fn yes() -> bool {
    true
}

pub struct Estimate {
    pub amount: i64,
    pub uncapped: i64,
    pub summary: String,
    pub breakdown: Vec<BreakdownItem>,
    pub note: Option<&'static str>,
}

pub fn estimate(q: &EstimateQuery, earned_today: f64, daily_cap: f64) -> Estimate {
    let topic = q.kind == "topic";
    let input = RewardInput {
        base: if topic {
            QUEST_BASE
        } else {
            bank_base(q.difficulty.clamp(1, 3))
        },
        hints_used: if topic { 0 } else { q.hints.clamp(0, 3) },
        wrong_attempts: q.wrong.clamp(0, 20),
        explain_passed: q.testimony,
        flagged: false,
        earned_today,
        daily_cap,
    };
    let r = compute_reward(&input);
    let uncapped = compute_reward(&RewardInput {
        earned_today: 0.0,
        daily_cap: f64::MAX,
        ..input
    })
    .amount;
    if topic && !q.testimony {
        return Estimate {
            amount: 0,
            uncapped: 0,
            summary: "New topics pay only when your testimony passes".into(),
            breakdown: r.breakdown,
            note: Some(
                "No reward is recorded, so you can ask for the topic again and try a fresh problem.",
            ),
        };
    }
    debug_assert_eq!(r.status, RewardStatus::Pay);
    let note = (r.amount == 0 && uncapped > 0).then_some(
        "The Queen's treasury is closed for today (daily cap reached). The same solve tomorrow pays in full.",
    );
    Estimate {
        amount: r.amount,
        uncapped,
        summary: r.summary,
        breakdown: r.breakdown,
        note,
    }
}

pub async fn estimate_route(
    State(st): State<AppState>,
    AuthUser(user): AuthUser,
    Query(q): Query<EstimateQuery>,
) -> ApiResult<Json<Value>> {
    let e = estimate(&q, earned_today(&st, &user.id).await?, st.cfg.daily_cap);
    Ok(Json(json!({
        "amount": e.amount,
        "uncapped": e.uncapped,
        "summary": e.summary,
        "breakdown": e.breakdown,
        "note": e.note,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(kind: &str, difficulty: i32, hints: i32, wrong: i32, testimony: bool) -> EstimateQuery {
        EstimateQuery {
            kind: kind.into(),
            difficulty,
            hints,
            wrong,
            testimony,
        }
    }

    #[test]
    fn clean_bank_solve_pays_base() {
        assert_eq!(
            estimate(&q("problem", 2, 0, 0, true), 0.0, 1000.0).amount,
            200
        );
    }

    #[test]
    fn matches_the_payout_formula() {
        assert_eq!(
            estimate(&q("problem", 2, 1, 2, true), 0.0, 1000.0).amount,
            120
        );
        assert_eq!(
            estimate(&q("problem", 1, 0, 0, false), 0.0, 1000.0).amount,
            50
        );
    }

    #[test]
    fn topics_ignore_bottles_and_need_testimony() {
        assert_eq!(estimate(&q("topic", 3, 3, 0, true), 0.0, 1000.0).amount, 50);
        let miss = estimate(&q("topic", 1, 0, 0, false), 0.0, 1000.0);
        assert_eq!((miss.amount, miss.uncapped), (0, 0));
    }

    #[test]
    fn cap_shows_the_uncapped_amount() {
        let e = estimate(&q("problem", 3, 0, 0, true), 1000.0, 1000.0);
        assert_eq!((e.amount, e.uncapped), (0, 300));
        assert!(e.note.is_some());
        let partial = estimate(&q("problem", 3, 0, 0, true), 900.0, 1000.0);
        assert_eq!((partial.amount, partial.uncapped), (100, 300));
    }

    #[test]
    fn out_of_range_inputs_are_clamped() {
        assert_eq!(
            estimate(&q("problem", 9, -4, -1, true), 0.0, 1000.0).amount,
            300
        );
    }
}
