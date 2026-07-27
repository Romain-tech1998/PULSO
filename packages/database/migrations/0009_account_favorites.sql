CREATE TABLE IF NOT EXISTS user_favorite_events (
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS user_favorite_venues (
  user_id uuid NOT NULL REFERENCES users(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);
