DROP INDEX IF EXISTS groups_event_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS groups_event_id_unique_idx ON groups (event_id) WHERE event_id IS NOT NULL;
