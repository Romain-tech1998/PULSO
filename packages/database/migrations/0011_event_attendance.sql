CREATE TABLE IF NOT EXISTS event_attendance (
  user_id uuid NOT NULL REFERENCES users(id),
  event_id uuid NOT NULL REFERENCES events(id),
  visibility text NOT NULL CHECK (visibility IN ('private', 'friends')) DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
