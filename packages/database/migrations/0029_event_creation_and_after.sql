-- DEC-0017: account-created events and the After filter.

-- Links an account to a venue it is verified to represent. Rows are created
-- by a Pulso operator after an out-of-band check - there is deliberately no
-- self-service route, because Pulso has no way to actually verify venue
-- ownership and claiming otherwise would be a fabricated guarantee.
CREATE TABLE IF NOT EXISTS venue_organizers (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);

-- Provenance, deliberately orthogonal to trust_label. trust_label describes
-- how well Pulso corroborated a *sourced* record (DATA-0001) and is
-- meaningless for a form submission, so a created event carries an origin
-- instead and leaves trust_label null.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'directory'
    CHECK (origin IN ('directory', 'verified_organizer', 'community')),
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_after boolean NOT NULL DEFAULT false;

-- Every existing row is ingested, which the DEFAULT already covers; this is
-- only here so a re-run over a partially-migrated database converges.
UPDATE events SET origin = 'directory' WHERE origin IS NULL;

-- The three DATA-0001 trust columns become nullable so an account-created
-- event can genuinely carry no trust verdict (DEC-0017 acceptance criterion
-- 7). Ingested rows still always populate them - the repository only reads
-- them for origin = 'directory'.
ALTER TABLE events
  ALTER COLUMN trust_label DROP NOT NULL,
  ALTER COLUMN freshness DROP NOT NULL,
  ALTER COLUMN location_confidence DROP NOT NULL;

-- The anonymous surfaces filter on `origin = 'directory'` on every query
-- (DEC-0017 acceptance criterion 2), so it is part of the hot path.
CREATE INDEX IF NOT EXISTS events_origin_idx ON events (origin);

-- "My created events", and the cascade target when an author is deleted.
CREATE INDEX IF NOT EXISTS events_created_by_idx
  ON events (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

-- DEC-0017 v1.2: an organizer may withhold the exact address (a "select"
-- after). The event still needs real coordinates to be a map pin, so this
-- hides the street line from everyone but the organizer rather than
-- allowing an event with no location at all.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS address_hidden boolean NOT NULL DEFAULT false;

-- DEC-0017 v1.2: an organizer can pin their own created events into the
-- sidebar's Raccourcis, alongside pinned groups. Only meaningful for
-- created events - an ingested one has no owner to pin it.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
