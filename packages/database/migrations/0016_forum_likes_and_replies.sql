ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES forum_posts(id);

CREATE TABLE IF NOT EXISTS forum_post_likes (
  post_id uuid NOT NULL REFERENCES forum_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS forum_posts_parent_id_idx ON forum_posts (parent_id);
