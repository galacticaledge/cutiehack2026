-- Users now authenticate with a username AND a password (stored as an Argon2id hash).
-- The DEFAULT '' only covers rows that pre-date this migration; the seed backfills
-- demo accounts, and login requires a non-empty hash to succeed.
ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
