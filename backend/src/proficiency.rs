//! Read-only learning progress, separate from reward eligibility.
use crate::concepts::concept_of_key;
use crate::problems::get_template;
use chrono::{DateTime, Days, Utc};
use serde::Serialize;
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::ops::Range;

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Proficiency {
    #[default]
    New,
    Learning,
    Demonstrated,
    Proficient,
}

#[derive(Default)]
pub(crate) struct ConceptProgress {
    pub proficiency: Proficiency,
    pub attempts_today: i64,
}

#[derive(sqlx::FromRow)]
struct SessionEvidence {
    source: String,
    template_id: String,
    seed: i64,
    quest_prompt: Option<String>,
    demonstrated: bool,
    from_grader: bool,
}

impl SessionEvidence {
    fn graded_variant(&self) -> Option<String> {
        if !self.demonstrated || !self.from_grader {
            return None;
        }
        // Different seeds can produce the exact same question in either source.
        match self.source.as_str() {
            "bank" => get_template(&self.template_id)
                .map(|template| (template.generate)(self.seed).prompt.trim().to_owned()),
            "quest" => self
                .quest_prompt
                .as_deref()
                .map(str::trim)
                .map(str::to_owned),
            _ => None,
        }
        .filter(|prompt| !prompt.is_empty())
    }
}

pub(crate) fn utc_day(now: DateTime<Utc>) -> Range<DateTime<Utc>> {
    let day = now.date_naive();
    day.and_hms_opt(0, 0, 0).unwrap().and_utc()
        ..(day + Days::new(1)).and_hms_opt(0, 0, 0).unwrap().and_utc()
}

pub(crate) async fn concept_progress(
    pool: &PgPool,
    user_id: &str,
    today: &Range<DateTime<Utc>>,
) -> sqlx::Result<HashMap<String, ConceptProgress>> {
    // A concurrent answer must not split the counts and evidence across snapshots.
    let mut tx = pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        .execute(&mut *tx)
        .await?;
    let counts = sqlx::query_as::<_, (String, i64)>(
        "SELECT concept_id, COUNT(*) FROM answer_attempts
         WHERE user_id = $1 AND attempted_at >= $2 AND attempted_at < $3 GROUP BY concept_id",
    )
    .bind(user_id)
    .bind(today.start)
    .bind(today.end)
    .fetch_all(&mut *tx)
    .await?;
    // A done bank/quest session has already passed the server's answer check, even before attempt logging.
    let sessions = sqlx::query_as::<_, SessionEvidence>(
        "SELECT source, template_id, seed, custom_ref #>> '{quest,prompt}' AS quest_prompt,
                status = 'done' AND explain_passed IS TRUE AS demonstrated,
                explain_grade_source IS NOT DISTINCT FROM 'grader' AS from_grader
         FROM problem_sessions
         WHERE user_id = $1 AND source IN ('bank', 'quest') AND template_id IS NOT NULL
           AND (wrong_attempts > 0 OR status IN ('solved', 'done'))",
    )
    .bind(user_id)
    .fetch_all(&mut *tx)
    .await?;
    tx.commit().await?;

    let mut progress: HashMap<_, _> = counts
        .into_iter()
        .map(|(concept, attempts_today)| {
            (
                concept,
                ConceptProgress {
                    proficiency: Proficiency::Learning,
                    attempts_today,
                },
            )
        })
        .collect();
    let mut variants = HashMap::<_, HashSet<_>>::new();
    for session in sessions {
        let Some(concept) = concept_of_key(&session.template_id) else {
            continue;
        };
        let progress = progress.entry(concept.to_string()).or_default();
        if progress.proficiency == Proficiency::Proficient {
            continue;
        }
        if session.demonstrated {
            progress.proficiency = Proficiency::Demonstrated;
            if let Some(variant) = session.graded_variant() {
                let distinct = variants.entry(concept).or_default();
                distinct.insert(variant);
                if distinct.len() >= 2 {
                    progress.proficiency = Proficiency::Proficient;
                }
            }
        } else if progress.proficiency == Proficiency::New {
            progress.proficiency = Proficiency::Learning;
        }
    }
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn utc_day_spans_utc_midnight_to_midnight() {
        let now = DateTime::parse_from_rfc3339("2026-03-08T20:00:00-07:00")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(
            utc_day(now),
            Utc.with_ymd_and_hms(2026, 3, 9, 0, 0, 0).unwrap()
                ..Utc.with_ymd_and_hms(2026, 3, 10, 0, 0, 0).unwrap(),
        );
    }

    #[test]
    fn bank_variants_deduplicate_identical_prompts_from_different_seeds() {
        let prompt = |seed| {
            SessionEvidence {
                source: "bank".into(),
                template_id: "kin-freefall-1".into(),
                seed,
                quest_prompt: None,
                demonstrated: true,
                from_grader: true,
            }
            .graded_variant()
            .unwrap()
        };
        // The generator has only 61 heights, so at least two of these seeds must collide.
        let mut prompts = HashSet::new();
        for seed in 0..62 {
            prompts.insert(prompt(seed));
        }
        assert!((2..62).contains(&prompts.len()));
    }

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn concept_progress_uses_legacy_evidence_and_deduplicates_graded_variants(pool: PgPool) {
        sqlx::query("INSERT INTO users (id, username, wallet_pubkey, wallet_secret) VALUES ('u', 'u', 'pub', 'test')")
            .execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO problem_sessions (id, user_id, source, template_id, status, wrong_attempts)
             VALUES ('legacy-wrong', 'u', 'bank', 'kin-freefall-1', 'active', 1),
                    ('legacy-solve', 'u', 'bank', 'calc-deriv-poly-1', 'solved', 0),
                    ('custom', 'u', 'custom_problem', 'concept:fractions', 'done', 3)",
        ).execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO problem_sessions (id, user_id, source, template_id, seed, custom_ref,
                                            status, solved_at, explain_passed, explain_grade_source, explain_graded_at)
             SELECT id, 'u', source, template_id, seed, jsonb_build_object('quest', jsonb_build_object('prompt', prompt)),
                    'done', now(), passed, grade_source, CASE WHEN grade_source IS NOT NULL THEN now() END
             FROM (VALUES
                  ('bank-1', 'bank', 'alg-linear-1', 1, NULL::text, true, 'grader'),
                  ('bank-dup', 'bank', 'alg-linear-1', 1, NULL, true, 'grader'),
                  ('bank-legacy', 'bank', 'alg-linear-1', 2, NULL, true, NULL),
                  ('bank-fallback', 'bank', 'alg-linear-1', 3, NULL, true, 'fallback'),
                  ('bank-fail', 'bank', 'alg-linear-1', 4, NULL, false, 'grader'),
                  ('legacy-pass', 'bank', 'cs-trace-loop-1', 1, NULL, true, NULL),
                  ('quest-1', 'quest', 'concept:chain-rule', 1, 'First prompt', true, 'grader'),
                  ('quest-dup', 'quest', 'concept:chain-rule', 2, 'First prompt', true, 'grader'))
             AS v(id, source, template_id, seed, prompt, passed, grade_source)",
        ).execute(&pool).await.unwrap();
        let today = utc_day(Utc::now());
        let progress = concept_progress(&pool, "u", &today).await.unwrap();
        assert!(!progress.contains_key("fractions"));
        for concept in ["kinematics-free-fall", "derivatives-power-rule"] {
            assert_eq!(progress[concept].proficiency, Proficiency::Learning);
        }
        for concept in ["linear-equations", "code-tracing-loops", "chain-rule"] {
            assert_eq!(progress[concept].proficiency, Proficiency::Demonstrated);
        }
        assert!(progress.values().all(|p| p.attempts_today == 0));

        sqlx::query("UPDATE problem_sessions SET explain_passed = true WHERE id = 'bank-fail'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "UPDATE problem_sessions SET seed = 1, custom_ref = '{\"quest\":{\"prompt\":\"Another prompt\"}}' WHERE id = 'quest-dup'",
        ).execute(&pool).await.unwrap();
        let progress = concept_progress(&pool, "u", &today).await.unwrap();
        for concept in ["linear-equations", "chain-rule"] {
            assert_eq!(progress[concept].proficiency, Proficiency::Proficient);
        }
    }
}
