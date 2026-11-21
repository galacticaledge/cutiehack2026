//! Knowledge graph of rewardable concepts. Pure.
//!
//! The graph is closed: a topic request can only earn LEARN if it maps onto one of these
//! nodes. Synonyms collapse onto the same node, so re-asking the same topic in different
//! words can't farm rewards. Edges are prerequisites: a student earns on a node only after
//! demonstrating every node it builds on.
use crate::problems::TEMPLATES;
use std::collections::HashSet;

pub struct Concept {
    pub id: &'static str,
    pub title: &'static str,
    pub subject: &'static str,
    pub aliases: &'static [&'static str],
    pub prereqs: &'static [&'static str],
}

macro_rules! c {
    ($id:literal, $title:literal, $subject:literal, [$($a:literal),*], [$($p:literal),*]) => {
        Concept { id: $id, title: $title, subject: $subject, aliases: &[$($a),*], prereqs: &[$($p),*] }
    };
}

pub static CONCEPTS: &[Concept] = &[
    // Algebra
    c!("fractions", "Fractions", "Algebra", ["fraction", "adding fractions", "fraction arithmetic"], []),
    c!("percentages", "Percentages", "Algebra", ["percent", "percentage", "percent change"], ["fractions"]),
    c!("exponents", "Exponent rules", "Algebra", ["exponent", "powers", "laws of exponents", "exponent laws"], []),
    c!("linear-equations", "Linear equations", "Algebra", ["linear equation", "solving for x", "solve for x", "one step equations", "two step equations"], []),
    c!("slope-lines", "Slope and lines", "Algebra", ["slope", "slope intercept", "equation of a line", "y mx b"], ["linear-equations"]),
    c!("systems-of-equations", "Systems of linear equations", "Algebra", ["systems of equations", "system of equations", "simultaneous equations", "elimination method", "substitution method"], ["linear-equations"]),
    c!("quadratic-equations", "Quadratic equations", "Algebra", ["quadratics", "quadratic", "quadratic formula", "factoring quadratics", "completing the square"], ["linear-equations", "exponents"]),
    c!("logarithms", "Logarithms", "Algebra", ["log", "logs", "logarithm", "log rules", "natural log"], ["exponents"]),
    c!("exponential-growth", "Exponential growth and decay", "Algebra", ["exponential growth", "exponential decay", "compound interest", "half life"], ["exponents", "percentages"]),
    c!("arithmetic-sequences", "Arithmetic sequences", "Algebra", ["arithmetic sequence", "arithmetic series", "arithmetic progression"], ["linear-equations"]),
    c!("geometric-sequences", "Geometric sequences", "Algebra", ["geometric sequence", "geometric series", "geometric progression"], ["exponents"]),
    // Geometry
    c!("circles", "Circle area and circumference", "Geometry", ["circle", "area of a circle", "circumference"], []),
    c!("pythagorean-theorem", "Pythagorean theorem", "Geometry", ["pythagoras", "pythagorean", "hypotenuse"], ["exponents"]),
    c!("right-triangle-trig", "Right-triangle trigonometry", "Geometry", ["trig", "trigonometry", "sohcahtoa", "sine cosine tangent"], ["pythagorean-theorem"]),
    c!("volume", "Volume of solids", "Geometry", ["volume", "volume of a cylinder", "volume of a sphere", "volume of a cone"], ["circles"]),
    // Calculus
    c!("limits", "Limits", "Calculus", ["limit", "limits at infinity"], ["slope-lines"]),
    c!("derivatives-power-rule", "Derivatives: the power rule", "Calculus", ["derivative", "derivatives", "power rule", "differentiation"], ["exponents"]),
    c!("product-rule", "Product rule", "Calculus", ["product rule", "quotient rule"], ["derivatives-power-rule"]),
    c!("chain-rule", "Chain rule", "Calculus", ["chain rule", "composite functions derivative"], ["derivatives-power-rule"]),
    c!("optimization", "Optimization with derivatives", "Calculus", ["optimization", "maxima and minima", "max min problems", "critical points"], ["derivatives-power-rule", "quadratic-equations"]),
    c!("definite-integrals", "Definite integrals", "Calculus", ["integral", "integrals", "integration", "area under a curve", "antiderivative"], ["derivatives-power-rule"]),
    c!("u-substitution", "Integration by substitution", "Calculus", ["u substitution", "u sub", "integration by substitution"], ["definite-integrals", "chain-rule"]),
    // Physics
    c!("constant-velocity", "Constant-velocity motion", "Physics", ["speed distance time", "constant velocity", "average speed", "velocity"], ["linear-equations"]),
    c!("kinematics-free-fall", "Free fall", "Physics", ["free fall", "freefall", "falling objects", "acceleration due to gravity"], ["constant-velocity"]),
    c!("projectile-motion", "Projectile motion", "Physics", ["projectile", "projectiles"], ["kinematics-free-fall", "right-triangle-trig"]),
    c!("newtons-second-law", "Newton's second law", "Physics", ["f ma", "newtons second law", "force and acceleration", "newtons laws"], ["linear-equations"]),
    c!("work-energy", "Work and kinetic energy", "Physics", ["kinetic energy", "work energy theorem", "potential energy", "conservation of energy"], ["newtons-second-law"]),
    c!("momentum", "Momentum and collisions", "Physics", ["momentum", "collisions", "impulse"], ["newtons-second-law"]),
    c!("ohms-law", "Ohm's law and circuits", "Physics", ["ohms law", "resistors", "series and parallel circuits", "circuits"], ["linear-equations"]),
    // Probability & statistics
    c!("mean-median", "Mean, median and mode", "Statistics", ["mean", "median", "mode", "average", "averages"], []),
    c!("standard-deviation", "Standard deviation", "Statistics", ["standard deviation", "variance", "spread"], ["mean-median"]),
    c!("basic-probability", "Basic probability", "Statistics", ["probability", "chance", "odds"], ["fractions"]),
    c!("combinations", "Permutations and combinations", "Statistics", ["permutations", "combinations", "combinatorics", "n choose k", "counting"], ["basic-probability"]),
    c!("expected-value", "Expected value", "Statistics", ["expected value", "expectation"], ["basic-probability"]),
    // Computer science
    c!("code-tracing-loops", "Tracing loops", "Computer science", ["loops", "for loops", "while loops", "tracing code"], []),
    c!("code-tracing-nested-loops", "Tracing nested loops", "Computer science", ["nested loops", "nested for loops"], ["code-tracing-loops"]),
    c!("binary-numbers", "Binary and number bases", "Computer science", ["binary", "base 2", "hexadecimal", "number bases", "number systems"], ["exponents"]),
    c!("recursion", "Recursion", "Computer science", ["recursive functions", "recursive"], ["code-tracing-loops"]),
    c!("binary-search", "Binary search", "Computer science", [], ["logarithms", "code-tracing-loops"]),
    c!("big-o", "Counting operations (Big-O)", "Computer science", ["big o", "time complexity", "runtime analysis", "algorithm complexity"], ["code-tracing-nested-loops"]),
    // Chemistry
    c!("moles", "Moles and molar mass", "Chemistry", ["mole", "moles", "molar mass", "stoichiometry"], ["fractions"]),
    c!("ideal-gas-law", "Ideal gas law", "Chemistry", ["pv nrt", "gas laws"], ["moles"]),
];

/// Code-tracing concepts: generated problems are Python programs checked by running them.
pub fn is_code(c: &Concept) -> bool {
    c.subject == "Computer science"
}

pub fn get_concept(id: &str) -> Option<&'static Concept> {
    CONCEPTS.iter().find(|c| c.id == id)
}

/// The verified bank template that already teaches this concept, if any.
/// Those concepts earn through the bank problem, never through a generated one.
pub fn bank_template_for(concept_id: &str) -> Option<&'static str> {
    TEMPLATES.iter().find(|t| t.concept == concept_id).map(|t| t.id)
}

/// Reward key for a generated problem on a concept (one payout per user per key).
pub fn reward_key(concept_id: &str) -> String {
    format!("concept:{concept_id}")
}

/// Concept a reward key or bank template id belongs to.
pub fn concept_of_key(key: &str) -> Option<&'static str> {
    if let Some(id) = key.strip_prefix("concept:") {
        return get_concept(id).map(|c| c.id);
    }
    TEMPLATES.iter().find(|t| t.id == key).and_then(|t| get_concept(t.concept)).map(|c| c.id)
}

fn normalize(text: &str) -> String {
    let lowered: String = text.to_lowercase().replace('\'', "").chars().map(|c| if c.is_alphanumeric() { c } else { ' ' }).collect();
    lowered.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_phrase(haystack: &str, phrase: &str) -> bool {
    !phrase.is_empty() && format!(" {haystack} ").contains(&format!(" {phrase} "))
}

/// Deterministic first pass: the concept whose title, alias or id appears in the text.
/// Returns None when nothing matches or two concepts tie (the LLM classifier decides then).
pub fn match_alias(text: &str) -> Option<&'static Concept> {
    let t = normalize(text);
    // Longest matching phrase per concept, so "nested loops" beats "loops".
    let mut best: Vec<(&'static Concept, String)> = Vec::new();
    for c in CONCEPTS {
        let longest = std::iter::once(c.title)
            .chain(c.aliases.iter().copied())
            .chain(std::iter::once(c.id))
            .map(normalize)
            .filter(|p| contains_phrase(&t, p))
            .max_by_key(|p| p.len());
        if let Some(p) = longest {
            best.push((c, p));
        }
    }
    // Drop a match whose phrase sits inside another match's phrase ("loops" in "nested loops").
    // Anything else left over means the text names several concepts: let the classifier decide.
    let top: Vec<_> = best
        .iter()
        .filter(|(c, p)| !best.iter().any(|(o, q)| o.id != c.id && q.len() > p.len() && contains_phrase(q, p)))
        .collect();
    (top.len() == 1).then(|| top[0].0)
}

/// Prerequisites of `concept_id` not yet in `mastered`.
pub fn missing_prereqs(concept_id: &str, mastered: &HashSet<String>) -> Vec<&'static Concept> {
    get_concept(concept_id)
        .map(|c| c.prereqs.iter().filter(|p| !mastered.contains(**p)).filter_map(|p| get_concept(p)).collect())
        .unwrap_or_default()
}

/// Concept list for the classifier prompt.
pub fn prompt_list() -> String {
    CONCEPTS.iter().map(|c| format!("- {}: {} ({})", c.id, c.title, c.subject)).collect::<Vec<_>>().join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn ids_unique_and_prereqs_exist() {
        let mut seen = HashSet::new();
        for c in CONCEPTS {
            assert!(seen.insert(c.id), "duplicate id {}", c.id);
        }
        for c in CONCEPTS {
            for p in c.prereqs {
                assert!(get_concept(p).is_some(), "{} has unknown prereq {p}", c.id);
            }
        }
    }

    #[test]
    fn graph_is_acyclic() {
        fn visit(id: &str, state: &mut HashMap<String, u8>) {
            match state.get(id) {
                Some(1) => panic!("cycle through {id}"),
                Some(2) => return,
                _ => {}
            }
            state.insert(id.into(), 1);
            for p in get_concept(id).unwrap().prereqs {
                visit(p, state);
            }
            state.insert(id.into(), 2);
        }
        let mut state = HashMap::new();
        for c in CONCEPTS {
            visit(c.id, &mut state);
        }
    }

    #[test]
    fn every_bank_template_is_a_node() {
        for t in TEMPLATES.iter() {
            assert!(get_concept(t.concept).is_some(), "template {} concept {} missing", t.id, t.concept);
            assert_eq!(concept_of_key(t.id), Some(t.concept));
        }
        assert_eq!(bank_template_for("linear-equations"), Some("alg-linear-1"));
        assert_eq!(bank_template_for("chain-rule"), None);
    }

    #[test]
    fn aliases_do_not_collide() {
        let mut owner: HashMap<String, &str> = HashMap::new();
        for c in CONCEPTS {
            for a in std::iter::once(c.title).chain(c.aliases.iter().copied()) {
                if let Some(prev) = owner.insert(normalize(a), c.id) {
                    assert_eq!(prev, c.id, "alias {a:?} used by {prev} and {}", c.id);
                }
            }
        }
    }

    #[test]
    fn synonyms_collapse_to_one_node() {
        for text in ["chain rule", "The Chain Rule!!", "help me with chain-rule please", "Chain_Rule"] {
            assert_eq!(match_alias(text).map(|c| c.id), Some("chain-rule"), "{text}");
        }
        assert_eq!(match_alias("nested loops in python").map(|c| c.id), Some("code-tracing-nested-loops"));
        assert_eq!(match_alias("PV=nRT").map(|c| c.id), Some("ideal-gas-law"));
        assert_eq!(match_alias("Ohm's law").map(|c| c.id), Some("ohms-law"));
        assert_eq!(match_alias("Newton's second law").map(|c| c.id), Some("newtons-second-law"));
    }

    #[test]
    fn every_title_maps_to_its_own_node() {
        // The knowledge-map page starts a topic by sending the node's title.
        for c in CONCEPTS {
            assert_eq!(match_alias(c.title).map(|m| m.id), Some(c.id), "title {:?}", c.title);
        }
    }

    #[test]
    fn ambiguous_or_unknown_defers() {
        assert!(match_alias("the chain rule and the product rule").is_none());
        assert!(match_alias("french revolution").is_none());
        assert!(match_alias("").is_none());
    }

    #[test]
    fn prereq_gating() {
        let mut m: HashSet<String> = HashSet::new();
        let ids = |v: Vec<&Concept>| v.iter().map(|c| c.id).collect::<Vec<_>>();
        assert_eq!(ids(missing_prereqs("u-substitution", &m)), vec!["definite-integrals", "chain-rule"]);
        m.insert("definite-integrals".into());
        m.insert("chain-rule".into());
        assert!(missing_prereqs("u-substitution", &m).is_empty());
        assert!(missing_prereqs("fractions", &HashSet::new()).is_empty());
    }

    #[test]
    fn reward_keys_round_trip() {
        assert_eq!(concept_of_key(&reward_key("chain-rule")), Some("chain-rule"));
        assert_eq!(concept_of_key("concept:nope"), None);
    }
}
