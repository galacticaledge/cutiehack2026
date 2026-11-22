//! The public and accepted private graph. Migration 0004 owns the public catalog.
use sqlx::{Executor, PgPool, Postgres};
use std::collections::HashSet;

#[derive(sqlx::FromRow)]
pub struct Concept {
    pub id: String,
    pub title: String,
    pub subject: String,
    pub aliases: Vec<String>,
    pub prereqs: Vec<String>,
    pub bank_template_id: Option<String>,
    pub objective: Option<String>,
}

impl Concept {
    pub fn is_private(&self) -> bool {
        self.objective.is_some()
    }

    pub fn is_code(&self) -> bool {
        !self.is_private() && self.subject == "Computer science"
    }

    pub fn ready(&self, mastered: &HashSet<String>) -> bool {
        self.prereqs.iter().all(|p| mastered.contains(p))
    }
}

async fn read_graph<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: Option<&str>,
    id: Option<&str>,
) -> sqlx::Result<Vec<Concept>> {
    sqlx::query_as(
        "SELECT c.id, c.title, c.subject, c.aliases, c.bank_template_id, c.objective,
                ARRAY(SELECT p.id FROM concept_prerequisites e JOIN concepts p ON p.id = e.prereq_id
                      WHERE e.concept_id = c.id AND (p.owner_id IS NULL OR p.owner_id = c.owner_id)
                      ORDER BY e.position) AS prereqs
         FROM concepts c
         WHERE (c.owner_id IS NULL OR c.owner_id = $1) AND ($2::text IS NULL OR c.id = $2)
         ORDER BY c.catalog_order NULLS LAST, c.title, c.id",
    )
    .bind(user_id)
    .bind(id)
    .fetch_all(db)
    .await
}

pub(crate) async fn public_concepts(pool: &PgPool) -> sqlx::Result<Vec<Concept>> {
    read_graph(pool, None, None).await
}

pub(crate) async fn visible_concepts<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: &str,
) -> sqlx::Result<Vec<Concept>> {
    read_graph(db, Some(user_id), None).await
}

pub(crate) async fn visible_concept(
    pool: &PgPool,
    user_id: &str,
    id: &str,
) -> sqlx::Result<Option<Concept>> {
    Ok(read_graph(pool, Some(user_id), Some(id)).await?.pop())
}

/// Reward keys stay stable for the public graph and the problem bank.
pub(crate) fn reward_key(concept_id: &str) -> String {
    format!("concept:{concept_id}")
}

pub(crate) fn normalize(text: &str) -> String {
    let lowered: String = text
        .to_lowercase()
        .replace('\'', "")
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    lowered.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn names(c: &Concept) -> impl Iterator<Item = &str> {
    std::iter::once(c.title.as_str())
        .chain(c.aliases.iter().map(String::as_str))
        .chain(std::iter::once(c.id.as_str()))
}

pub(crate) fn already_named(concepts: &[Concept], title_key: &str) -> bool {
    concepts
        .iter()
        .any(|c| names(c).any(|name| normalize(name) == title_key))
}

fn contains_phrase(haystack: &str, phrase: &str) -> bool {
    !phrase.is_empty() && format!(" {haystack} ").contains(&format!(" {phrase} "))
}

/// Match title, alias or ID. Prefer the more specific phrase; unrelated matches defer to classification.
pub(crate) fn match_alias<'a>(concepts: &'a [Concept], text: &str) -> Option<&'a Concept> {
    let t = normalize(text);
    let best: Vec<_> = concepts
        .iter()
        .filter_map(|c| {
            names(c)
                .map(normalize)
                .filter(|p| contains_phrase(&t, p))
                .max_by_key(|p| p.len())
                .map(|p| (c, p))
        })
        .collect();
    let mut top = best.iter().filter(|(c, p)| {
        !best
            .iter()
            .any(|(o, q)| o.id != c.id && q.len() > p.len() && contains_phrase(q, p))
    });
    let (c, _) = top.next()?;
    top.next().is_none().then_some(*c)
}

/// Fast-path alias match for free text: only when the matched name is most of what was typed
/// ("the chain rule", "momentum and collisions"). A single shared word inside a longer question
/// ("how do hash tables handle collisions?") is left to the classifier.
pub(crate) fn match_name<'a>(concepts: &'a [Concept], text: &str) -> Option<&'a Concept> {
    let c = match_alias(concepts, text)?;
    let t = normalize(text);
    let words = t.split_whitespace().count().max(1);
    let covered = names(c)
        .map(normalize)
        .filter(|p| contains_phrase(&t, p))
        .map(|p| p.split_whitespace().count())
        .max()?;
    (covered * 2 >= words).then_some(c)
}

#[cfg(test)]
mod name_tests {
    use super::*;

    fn node(id: &str, title: &str, aliases: &[&str]) -> Concept {
        Concept {
            id: id.into(),
            title: title.into(),
            subject: "Physics".into(),
            aliases: aliases.iter().map(|a| a.to_string()).collect(),
            prereqs: vec![],
            bank_template_id: None,
            objective: None,
        }
    }

    #[test]
    fn a_shared_word_in_a_longer_question_is_not_a_match() {
        let g = vec![
            node(
                "momentum",
                "Momentum and collisions",
                &["momentum", "collisions"],
            ),
            node("chain-rule", "Chain rule", &["chain rule"]),
        ];
        assert!(match_name(&g, "how do chained hash lists solve hash collisions?").is_none());
        assert!(match_name(&g, "how do hash tables handle collisions").is_none());
        assert_eq!(
            match_name(&g, "momentum and collisions").unwrap().id,
            "momentum"
        );
        assert_eq!(match_name(&g, "collisions").unwrap().id, "momentum");
        assert_eq!(match_name(&g, "the chain rule").unwrap().id, "chain-rule");
        assert_eq!(match_name(&g, "chain rule help").unwrap().id, "chain-rule");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::problems::TEMPLATES;
    use sha2::{Digest, Sha256};
    use std::collections::HashMap;

    #[sqlx::test]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn public_graph_matches_legacy_catalog(pool: PgPool) {
        let graph = public_concepts(&pool).await.unwrap();
        assert_eq!(graph.len(), 42);
        let entries: Vec<_> = graph
            .iter()
            .map(|c| {
                (
                    &c.id,
                    &c.title,
                    &c.subject,
                    &c.aliases,
                    &c.prereqs,
                    &c.bank_template_id,
                )
            })
            .collect();
        let digest = Sha256::digest(serde_json::to_vec(&entries).unwrap());
        assert_eq!(
            hex::encode(digest),
            "da710170520ae1cb6799860b6921c5e19135aa8d52c59b39044120e82474d600"
        );
        let banks: HashMap<_, _> = graph
            .iter()
            .filter_map(|c| Some((c.bank_template_id.as_deref()?, c.id.as_str())))
            .collect();
        assert_eq!(banks.len(), TEMPLATES.len());
        for t in &TEMPLATES {
            assert_eq!(banks[t.id], t.concept);
        }
        for c in &graph {
            assert_eq!(match_alias(&graph, &c.title).unwrap().id, c.id);
        }
        for (text, id) in [
            ("Chain_Rule", "chain-rule"),
            ("nested loops in python", "code-tracing-nested-loops"),
            ("PV=nRT", "ideal-gas-law"),
            ("Ohm's law", "ohms-law"),
            ("Newton's second law", "newtons-second-law"),
        ] {
            assert_eq!(match_alias(&graph, text).unwrap().id, id);
        }
        assert!(match_alias(&graph, "the chain rule and the product rule").is_none());
        assert!(match_alias(&graph, "french revolution").is_none());
    }

    #[sqlx::test(migrations = false)]
    #[ignore = "requires a disposable PostgreSQL server in DATABASE_URL"]
    async fn migration_0004_backfills_evidence_and_accepts_legacy_public_writes(pool: PgPool) {
        for sql in [
            include_str!("../migrations/0001_init.sql"),
            include_str!("../migrations/0002_learning_evidence.sql"),
        ] {
            sqlx::raw_sql(sql).execute(&pool).await.unwrap();
        }
        sqlx::raw_sql(
            "INSERT INTO users (id, username, wallet_pubkey, wallet_secret) VALUES ('u','u','pub','test');
             INSERT INTO problem_sessions (id, user_id, source, template_id, custom_ref, status, explain_passed) VALUES
               ('bank', 'u', 'bank', 'alg-linear-1', NULL, 'done', true),
               ('quest', 'u', 'quest', 'concept:chain-rule', '{\"quest\":{\"prompt\":\"legacy\"}}', 'done', true),
               ('custom', 'u', 'custom_topic', 'alg-linear-1', '{\"conceptId\":\"linear-equations\"}', 'done', true),
               ('unknown', 'u', 'quest', 'concept:unknown', NULL, 'done', true),
               ('mismatch', 'u', 'bank', 'concept:chain-rule', NULL, 'active', NULL);
             INSERT INTO answer_attempts (id, user_id, concept_id, session_id, correct, hints_used)
               VALUES ('a', 'u', 'chain-rule', 'quest', true, 0);
             INSERT INTO rewards (id, user_id, session_id, template_id, amount, breakdown, status)
               VALUES ('r', 'u', 'bank', 'alg-linear-1', 100, '{}', 'paid');",
        ).execute(&pool).await.unwrap();
        sqlx::raw_sql(include_str!("../migrations/0003_user_passwords.sql"))
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = 'u'")
                .fetch_one(&pool)
                .await
                .unwrap(),
            ""
        );
        sqlx::query("UPDATE users SET password_hash = 'fixture-hash' WHERE id = 'u'")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../migrations/0004_personalized_concepts.sql"))
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(
            sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = 'u'")
                .fetch_one(&pool)
                .await
                .unwrap(),
            "fixture-hash"
        );
        let rows: Vec<(String, Option<String>)> =
            sqlx::query_as("SELECT id, concept_id FROM problem_sessions ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(
            rows.iter()
                .map(|(id, c)| (id.as_str(), c.as_deref()))
                .collect::<Vec<_>>(),
            [
                ("bank", Some("linear-equations")),
                ("custom", Some("linear-equations")),
                ("mismatch", None),
                ("quest", Some("chain-rule")),
                ("unknown", None),
            ]
        );
        let preserved: bool = sqlx::query_scalar("SELECT EXISTS (SELECT FROM answer_attempts WHERE id = 'a' AND correct) AND EXISTS (SELECT FROM rewards WHERE id = 'r' AND amount = 100 AND status = 'paid') AND EXISTS (SELECT FROM problem_sessions WHERE id = 'quest' AND explain_passed AND explain_grade_source IS NULL AND custom_ref #>> '{quest,prompt}' = 'legacy')").fetch_one(&pool).await.unwrap();
        assert!(preserved);

        sqlx::raw_sql(
            "INSERT INTO concepts (id, owner_id, title, title_key, subject, objective)
               VALUES ('private-u','u','Private topic','private topic','Algebra','Calculate.');
             INSERT INTO problem_sessions (id, user_id, template_id) VALUES ('old-bank','u','alg-linear-1');
             INSERT INTO problem_sessions (id, user_id, source, template_id, custom_ref) VALUES
               ('old-quest','u','quest','concept:chain-rule',NULL),
               ('old-custom','u','custom_topic','alg-linear-1','{\"conceptId\":\"linear-equations\"}'),
               ('old-unknown','u','quest','concept:unknown',NULL),
               ('old-private-key','u','quest','concept:private-u',NULL),
               ('old-private-custom','u','custom_topic',NULL,'{\"conceptId\":\"private-u\"}');
             INSERT INTO problem_sessions (id, user_id, source, concept_id) VALUES ('new-private','u','quest','private-u');",
        ).execute(&pool).await.unwrap();
        let rows: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, concept_id FROM problem_sessions WHERE id LIKE 'old-%' OR id = 'new-private' ORDER BY id")
            .fetch_all(&pool).await.unwrap();
        assert_eq!(
            rows.iter()
                .map(|(id, c)| (id.as_str(), c.as_deref()))
                .collect::<Vec<_>>(),
            [
                ("new-private", Some("private-u")),
                ("old-bank", Some("linear-equations")),
                ("old-custom", Some("linear-equations")),
                ("old-private-custom", None),
                ("old-private-key", None),
                ("old-quest", Some("chain-rule")),
                ("old-unknown", None),
            ]
        );
        for id in ["old-bank", "old-quest"] {
            let session = sqlx::query_as("SELECT * FROM problem_sessions WHERE id = $1")
                .bind(id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!(
                crate::sessions::has_public_reward_key(&pool, &session)
                    .await
                    .unwrap()
            );
        }
    }
}
