CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_memberships (
  group_id uuid NOT NULL REFERENCES groups(id),
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_posts (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id),
  author_id uuid NOT NULL REFERENCES users(id),
  parent_id uuid REFERENCES group_posts(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_post_likes (
  post_id uuid NOT NULL REFERENCES group_posts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS group_memberships_user_idx ON group_memberships (user_id);
CREATE INDEX IF NOT EXISTS group_posts_group_idx ON group_posts (group_id, created_at ASC);
CREATE INDEX IF NOT EXISTS group_posts_parent_id_idx ON group_posts (parent_id);

ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN ('forum_post', 'message', 'group_post'));
