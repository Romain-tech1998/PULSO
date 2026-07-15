DO $$ BEGIN
  CREATE TYPE event_category AS ENUM (
    'music', 'nightlife', 'festival', 'show', 'comedy', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('scheduled', 'cancelled', 'postponed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS venues (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL,
  location geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS venues_location_gist_idx ON venues USING GIST (location);
CREATE INDEX IF NOT EXISTS venues_location_geography_gist_idx
  ON venues USING GIST ((location::geography));

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES venues(id),
  title text NOT NULL,
  category event_category NOT NULL,
  status event_status NOT NULL DEFAULT 'scheduled',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL CHECK (timezone = 'America/Toronto'),
  source_name text NOT NULL,
  source_url text NOT NULL,
  observed_at timestamptz NOT NULL,
  freshness text NOT NULL CHECK (freshness IN ('fresh', 'stale', 'unknown')),
  location_confidence text NOT NULL CHECK (location_confidence IN ('confirmed', 'uncertain')),
  price_kind text NOT NULL CHECK (price_kind IN ('free', 'paid', 'unknown'))
);

CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events (starts_at);
