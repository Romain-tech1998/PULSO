CREATE TABLE IF NOT EXISTS event_photos (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  uploader_id uuid NOT NULL REFERENCES users(id),
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_photos_event_idx ON event_photos (event_id, created_at DESC);
