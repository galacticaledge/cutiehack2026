-- Public nodes students grow by asking about a topic that isn't on the map yet.
-- created_by is NULL for the seeded catalog; it drives the per-user daily limit on new nodes.
ALTER TABLE concepts ADD COLUMN created_by TEXT REFERENCES users(id);
ALTER TABLE concepts ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX concepts_created_by_idx ON concepts(created_by, created_at) WHERE created_by IS NOT NULL;
