ALTER TABLE groups ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id);
CREATE INDEX IF NOT EXISTS groups_event_id_idx ON groups (event_id) WHERE event_id IS NOT NULL;
