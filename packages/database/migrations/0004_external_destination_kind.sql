ALTER TABLE events ADD COLUMN IF NOT EXISTS external_destination_kind text;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_external_destination_kind_check
    CHECK (external_destination_kind IS NULL OR external_destination_kind IN ('event_source', 'ticketing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
