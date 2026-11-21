CREATE TABLE answer_attempts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  concept_id   TEXT NOT NULL,
  session_id   TEXT NOT NULL REFERENCES problem_sessions(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  correct      BOOLEAN NOT NULL,
  hints_used   INT NOT NULL
);
CREATE INDEX answer_attempts_user_day_idx ON answer_attempts(user_id, attempted_at, concept_id);
CREATE INDEX answer_attempts_session_day_idx ON answer_attempts(session_id, attempted_at);

-- Leave old explain-backs untouched: their grading source and timestamp are unknown.
ALTER TABLE problem_sessions
  ADD COLUMN explain_grade_source TEXT CHECK (explain_grade_source IN ('grader', 'fallback')),
  ADD COLUMN explain_graded_at TIMESTAMPTZ,
  ADD CHECK ((explain_grade_source IS NULL) = (explain_graded_at IS NULL));
