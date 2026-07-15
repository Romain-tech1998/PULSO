ALTER TABLE events ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_name text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS access_information text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_destination_label text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_destination_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS external_destination_status text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS trust_label text;

UPDATE events
SET access_information = 'Known access information is unavailable.'
WHERE access_information IS NULL;

UPDATE events SET trust_label = 'to_verify' WHERE trust_label IS NULL;

ALTER TABLE events ALTER COLUMN access_information SET NOT NULL;
ALTER TABLE events ALTER COLUMN trust_label SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_trust_label_check
    CHECK (trust_label IN ('confirmed', 'probable', 'to_verify', 'conflicting'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events ADD CONSTRAINT events_external_destination_status_check
    CHECK (external_destination_status IS NULL OR external_destination_status IN ('available', 'unavailable'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
