CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  wallet_pubkey TEXT NOT NULL UNIQUE,
  wallet_secret TEXT NOT NULL, -- devnet only. NEVER sent to client.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE problem_sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  source           TEXT NOT NULL DEFAULT 'bank',      -- bank | custom_problem | custom_topic
  template_id      TEXT,
  seed             BIGINT NOT NULL DEFAULT 0,
  custom_text      TEXT,
  custom_ref       JSONB,                             -- SERVER ONLY
  from_session_id  TEXT,
  condition        TEXT NOT NULL DEFAULT 'socratic',
  hints_used       INT NOT NULL DEFAULT 0,
  wrong_attempts   INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',    -- active | solved | done
  explain_passed   BOOLEAN,
  explanation      TEXT,
  explain_feedback TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  solved_at        TIMESTAMPTZ
);
CREATE INDEX problem_sessions_user_idx ON problem_sessions(user_id);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES problem_sessions(id),
  role       TEXT NOT NULL,                           -- user | tutor
  content    TEXT NOT NULL,
  verdicts   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_session_idx ON messages(session_id, created_at);

CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES problem_sessions(id),
  type       TEXT NOT NULL,                           -- hidden | visible | paste | solve
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX events_session_idx ON events(session_id);

CREATE TABLE rewards (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  session_id  TEXT NOT NULL UNIQUE REFERENCES problem_sessions(id),
  template_id TEXT NOT NULL,
  amount      BIGINT NOT NULL,                        -- base units
  breakdown   JSONB NOT NULL,
  status      TEXT NOT NULL,                          -- minting | paid | failed | forfeited
  flags       JSONB,
  tx_sig      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_id)                       -- one payout per template per user
);
