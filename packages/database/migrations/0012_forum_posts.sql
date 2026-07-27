CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id),
  author_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('find_partners', 'general', 'ticket_resale', 'find_someone')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_posts_event_category_idx ON forum_posts (event_id, category, created_at DESC);
