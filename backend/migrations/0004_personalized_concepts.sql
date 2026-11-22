-- Public catalog and aliases retain the original stable IDs, bank bindings and map order.
CREATE TABLE concepts (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT REFERENCES users(id),  -- NULL = public; otherwise accepted private practice
  title            TEXT NOT NULL,
  subject          TEXT NOT NULL,
  aliases          TEXT[] NOT NULL DEFAULT '{}',
  bank_template_id TEXT UNIQUE,
  catalog_order    INT UNIQUE,
  title_key        TEXT,
  objective        TEXT,
  CHECK (
    (owner_id IS NULL AND catalog_order IS NOT NULL AND title_key IS NULL AND objective IS NULL)
    OR
    (owner_id IS NOT NULL AND catalog_order IS NULL AND title_key IS NOT NULL AND objective IS NOT NULL
     AND bank_template_id IS NULL AND cardinality(aliases) = 0)
  )
);
CREATE UNIQUE INDEX concepts_private_title_idx ON concepts(owner_id, title_key) WHERE owner_id IS NOT NULL;

CREATE TABLE concept_prerequisites (
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  prereq_id  TEXT NOT NULL REFERENCES concepts(id),
  position   INT NOT NULL CHECK (position > 0),
  PRIMARY KEY (concept_id, prereq_id),
  UNIQUE (concept_id, position),
  CHECK (concept_id <> prereq_id)
);

INSERT INTO concepts (id, title, subject, aliases, bank_template_id, catalog_order) VALUES
  ('fractions', 'Fractions', 'Algebra', ARRAY['fraction', 'adding fractions', 'fraction arithmetic']::TEXT[], NULL, 1),
  ('percentages', 'Percentages', 'Algebra', ARRAY['percent', 'percentage', 'percent change']::TEXT[], NULL, 2),
  ('exponents', 'Exponent rules', 'Algebra', ARRAY['exponent', 'powers', 'laws of exponents', 'exponent laws']::TEXT[], NULL, 3),
  ('linear-equations', 'Linear equations', 'Algebra', ARRAY['linear equation', 'solving for x', 'solve for x', 'one step equations', 'two step equations']::TEXT[], 'alg-linear-1', 4),
  ('slope-lines', 'Slope and lines', 'Algebra', ARRAY['slope', 'slope intercept', 'equation of a line', 'y mx b']::TEXT[], NULL, 5),
  ('systems-of-equations', 'Systems of linear equations', 'Algebra', ARRAY['systems of equations', 'system of equations', 'simultaneous equations', 'elimination method', 'substitution method']::TEXT[], NULL, 6),
  ('quadratic-equations', 'Quadratic equations', 'Algebra', ARRAY['quadratics', 'quadratic', 'quadratic formula', 'factoring quadratics', 'completing the square']::TEXT[], NULL, 7),
  ('logarithms', 'Logarithms', 'Algebra', ARRAY['log', 'logs', 'logarithm', 'log rules', 'natural log']::TEXT[], NULL, 8),
  ('exponential-growth', 'Exponential growth and decay', 'Algebra', ARRAY['exponential growth', 'exponential decay', 'compound interest', 'half life']::TEXT[], NULL, 9),
  ('arithmetic-sequences', 'Arithmetic sequences', 'Algebra', ARRAY['arithmetic sequence', 'arithmetic series', 'arithmetic progression']::TEXT[], NULL, 10),
  ('geometric-sequences', 'Geometric sequences', 'Algebra', ARRAY['geometric sequence', 'geometric series', 'geometric progression']::TEXT[], NULL, 11),
  ('circles', 'Circle area and circumference', 'Geometry', ARRAY['circle', 'area of a circle', 'circumference']::TEXT[], NULL, 12),
  ('pythagorean-theorem', 'Pythagorean theorem', 'Geometry', ARRAY['pythagoras', 'pythagorean', 'hypotenuse']::TEXT[], NULL, 13),
  ('right-triangle-trig', 'Right-triangle trigonometry', 'Geometry', ARRAY['trig', 'trigonometry', 'sohcahtoa', 'sine cosine tangent']::TEXT[], NULL, 14),
  ('volume', 'Volume of solids', 'Geometry', ARRAY['volume', 'volume of a cylinder', 'volume of a sphere', 'volume of a cone']::TEXT[], NULL, 15),
  ('limits', 'Limits', 'Calculus', ARRAY['limit', 'limits at infinity']::TEXT[], NULL, 16),
  ('derivatives-power-rule', 'Derivatives: the power rule', 'Calculus', ARRAY['derivative', 'derivatives', 'power rule', 'differentiation']::TEXT[], 'calc-deriv-poly-1', 17),
  ('product-rule', 'Product rule', 'Calculus', ARRAY['product rule', 'quotient rule']::TEXT[], NULL, 18),
  ('chain-rule', 'Chain rule', 'Calculus', ARRAY['chain rule', 'composite functions derivative']::TEXT[], NULL, 19),
  ('optimization', 'Optimization with derivatives', 'Calculus', ARRAY['optimization', 'maxima and minima', 'max min problems', 'critical points']::TEXT[], NULL, 20),
  ('definite-integrals', 'Definite integrals', 'Calculus', ARRAY['integral', 'integrals', 'integration', 'area under a curve', 'antiderivative']::TEXT[], NULL, 21),
  ('u-substitution', 'Integration by substitution', 'Calculus', ARRAY['u substitution', 'u sub', 'integration by substitution']::TEXT[], NULL, 22),
  ('constant-velocity', 'Constant-velocity motion', 'Physics', ARRAY['speed distance time', 'constant velocity', 'average speed', 'velocity']::TEXT[], NULL, 23),
  ('kinematics-free-fall', 'Free fall', 'Physics', ARRAY['free fall', 'freefall', 'falling objects', 'acceleration due to gravity']::TEXT[], 'kin-freefall-1', 24),
  ('projectile-motion', 'Projectile motion', 'Physics', ARRAY['projectile', 'projectiles']::TEXT[], NULL, 25),
  ('newtons-second-law', 'Newton''s second law', 'Physics', ARRAY['f ma', 'newtons second law', 'force and acceleration', 'newtons laws']::TEXT[], NULL, 26),
  ('work-energy', 'Work and kinetic energy', 'Physics', ARRAY['kinetic energy', 'work energy theorem', 'potential energy', 'conservation of energy']::TEXT[], NULL, 27),
  ('momentum', 'Momentum and collisions', 'Physics', ARRAY['momentum', 'collisions', 'impulse']::TEXT[], NULL, 28),
  ('ohms-law', 'Ohm''s law and circuits', 'Physics', ARRAY['ohms law', 'resistors', 'series and parallel circuits', 'circuits']::TEXT[], NULL, 29),
  ('mean-median', 'Mean, median and mode', 'Statistics', ARRAY['mean', 'median', 'mode', 'average', 'averages']::TEXT[], NULL, 30),
  ('standard-deviation', 'Standard deviation', 'Statistics', ARRAY['standard deviation', 'variance', 'spread']::TEXT[], NULL, 31),
  ('basic-probability', 'Basic probability', 'Statistics', ARRAY['probability', 'chance', 'odds']::TEXT[], NULL, 32),
  ('combinations', 'Permutations and combinations', 'Statistics', ARRAY['permutations', 'combinations', 'combinatorics', 'n choose k', 'counting']::TEXT[], NULL, 33),
  ('expected-value', 'Expected value', 'Statistics', ARRAY['expected value', 'expectation']::TEXT[], NULL, 34),
  ('code-tracing-loops', 'Tracing loops', 'Computer science', ARRAY['loops', 'for loops', 'while loops', 'tracing code']::TEXT[], 'cs-trace-loop-1', 35),
  ('code-tracing-nested-loops', 'Tracing nested loops', 'Computer science', ARRAY['nested loops', 'nested for loops']::TEXT[], 'cs-trace-nested-1', 36),
  ('binary-numbers', 'Binary and number bases', 'Computer science', ARRAY['binary', 'base 2', 'hexadecimal', 'number bases', 'number systems']::TEXT[], NULL, 37),
  ('recursion', 'Recursion', 'Computer science', ARRAY['recursive functions', 'recursive']::TEXT[], NULL, 38),
  ('binary-search', 'Binary search', 'Computer science', ARRAY[]::TEXT[], NULL, 39),
  ('big-o', 'Counting operations (Big-O)', 'Computer science', ARRAY['big o', 'time complexity', 'runtime analysis', 'algorithm complexity']::TEXT[], NULL, 40),
  ('moles', 'Moles and molar mass', 'Chemistry', ARRAY['mole', 'moles', 'molar mass', 'stoichiometry']::TEXT[], NULL, 41),
  ('ideal-gas-law', 'Ideal gas law', 'Chemistry', ARRAY['pv nrt', 'gas laws']::TEXT[], NULL, 42);

INSERT INTO concept_prerequisites (concept_id, prereq_id, position) VALUES
  ('percentages', 'fractions', 1),
  ('slope-lines', 'linear-equations', 1),
  ('systems-of-equations', 'linear-equations', 1),
  ('quadratic-equations', 'linear-equations', 1),
  ('quadratic-equations', 'exponents', 2),
  ('logarithms', 'exponents', 1),
  ('exponential-growth', 'exponents', 1),
  ('exponential-growth', 'percentages', 2),
  ('arithmetic-sequences', 'linear-equations', 1),
  ('geometric-sequences', 'exponents', 1),
  ('pythagorean-theorem', 'exponents', 1),
  ('right-triangle-trig', 'pythagorean-theorem', 1),
  ('volume', 'circles', 1),
  ('limits', 'slope-lines', 1),
  ('derivatives-power-rule', 'exponents', 1),
  ('product-rule', 'derivatives-power-rule', 1),
  ('chain-rule', 'derivatives-power-rule', 1),
  ('optimization', 'derivatives-power-rule', 1),
  ('optimization', 'quadratic-equations', 2),
  ('definite-integrals', 'derivatives-power-rule', 1),
  ('u-substitution', 'definite-integrals', 1),
  ('u-substitution', 'chain-rule', 2),
  ('constant-velocity', 'linear-equations', 1),
  ('kinematics-free-fall', 'constant-velocity', 1),
  ('projectile-motion', 'kinematics-free-fall', 1),
  ('projectile-motion', 'right-triangle-trig', 2),
  ('newtons-second-law', 'linear-equations', 1),
  ('work-energy', 'newtons-second-law', 1),
  ('momentum', 'newtons-second-law', 1),
  ('ohms-law', 'linear-equations', 1),
  ('standard-deviation', 'mean-median', 1),
  ('basic-probability', 'fractions', 1),
  ('combinations', 'basic-probability', 1),
  ('expected-value', 'basic-probability', 1),
  ('code-tracing-nested-loops', 'code-tracing-loops', 1),
  ('binary-numbers', 'exponents', 1),
  ('recursion', 'code-tracing-loops', 1),
  ('binary-search', 'logarithms', 1),
  ('binary-search', 'code-tracing-loops', 2),
  ('big-o', 'code-tracing-nested-loops', 1),
  ('moles', 'fractions', 1),
  ('ideal-gas-law', 'moles', 1);

-- A public node can never depend on private evidence, nor can a private node depend on another owner's.
CREATE FUNCTION check_concept_prerequisite_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM concepts c, concepts p
    WHERE c.id = NEW.concept_id AND p.id = NEW.prereq_id
      AND p.owner_id IS NOT NULL AND p.owner_id IS DISTINCT FROM c.owner_id
  ) THEN
    RAISE EXCEPTION 'prerequisite not visible to concept owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER concept_prerequisite_owner
  BEFORE INSERT OR UPDATE ON concept_prerequisites
  FOR EACH ROW EXECUTE FUNCTION check_concept_prerequisite_owner();

CREATE FUNCTION legacy_public_session_concept(session_source TEXT, template TEXT, reference JSONB)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT c.id FROM concepts c WHERE c.owner_id IS NULL AND (
    (session_source = 'bank' AND template = c.bank_template_id)
    OR (session_source = 'quest' AND template = 'concept:' || c.id)
    OR (session_source = 'custom_topic' AND reference ->> 'conceptId' = c.id)
  );
$$;

ALTER TABLE problem_sessions ADD COLUMN concept_id TEXT REFERENCES concepts(id);
WITH known AS (
  SELECT id, legacy_public_session_concept(source, template_id, custom_ref) AS concept_id
  FROM problem_sessions
)
UPDATE problem_sessions s SET concept_id = known.concept_id
FROM known WHERE s.id = known.id AND known.concept_id IS NOT NULL;

-- Older app instances still write public sessions without this column during a rollout.
CREATE FUNCTION fill_legacy_public_session_concept() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.concept_id IS NULL THEN
    NEW.concept_id := legacy_public_session_concept(NEW.source, NEW.template_id, NEW.custom_ref);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER problem_sessions_legacy_public_concept
  BEFORE INSERT ON problem_sessions FOR EACH ROW EXECUTE FUNCTION fill_legacy_public_session_concept();
CREATE INDEX problem_sessions_active_quest_idx ON problem_sessions(user_id, concept_id, started_at DESC)
  WHERE source = 'quest' AND status IN ('active', 'solved');

CREATE TABLE concept_proposals (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  anchor_id           TEXT NOT NULL REFERENCES concepts(id),
  title               TEXT NOT NULL,
  objective           TEXT NOT NULL,
  reason              TEXT NOT NULL,
  prereq_ids          TEXT[] NOT NULL,
  accepted_concept_id TEXT UNIQUE REFERENCES concepts(id),
  CHECK (cardinality(prereq_ids) BETWEEN 1 AND 3 AND anchor_id = ANY(prereq_ids))
);
CREATE UNIQUE INDEX concept_proposals_pending_idx ON concept_proposals(user_id, anchor_id)
  WHERE accepted_concept_id IS NULL;

CREATE TABLE concept_generation_quota (
  user_id TEXT NOT NULL REFERENCES users(id),
  day_utc DATE NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('proposal', 'quest')),
  used    INT NOT NULL CHECK (used > 0),
  PRIMARY KEY (user_id, day_utc, kind)
);

CREATE TABLE concept_generation_claims (
  user_id    TEXT NOT NULL REFERENCES users(id),
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  kind       TEXT NOT NULL CHECK (kind IN ('proposal', 'quest')),
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, concept_id, kind)
);
