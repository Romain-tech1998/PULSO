-- Groups: several discussion threads instead of one flat feed.
--
-- A group that organises real outings does not have one conversation. It
-- has a general one, announcements from whoever runs it, and usually a
-- thread per recurring topic. Until now every group post landed in a single
-- undifferentiated feed.
--
-- `staff_only` is what makes DEC-0015's "announcements reserved for staff"
-- module real without inventing a second content model: an announcements
-- channel is a channel only the group's moderator may post in. Everyone
-- still reads it.
CREATE TABLE IF NOT EXISTS group_channels (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  staff_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS group_channels_group_idx
  ON group_channels (group_id, position);

ALTER TABLE group_posts
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES group_channels(id) ON DELETE CASCADE;

-- Every group that already exists gets its general channel, and every post
-- ever written moves into it. Nothing is lost and nothing is orphaned: the
-- feed a member reads after this migration is the feed they read before it,
-- now with a name.
INSERT INTO group_channels (id, group_id, name, position, staff_only, created_by)
SELECT gen_random_uuid(), g.id, 'Général', 0, false, g.created_by
FROM groups g
WHERE NOT EXISTS (
  SELECT 1 FROM group_channels c WHERE c.group_id = g.id
);

UPDATE group_posts p
SET channel_id = c.id
FROM group_channels c
WHERE c.group_id = p.group_id
  AND c.position = 0
  AND p.channel_id IS NULL;

-- Safe only because the backfill above covers every pre-existing row: from
-- here on a post always belongs to a channel, so "which thread is this in"
-- never has to be answered with a guess.
ALTER TABLE group_posts ALTER COLUMN channel_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS group_posts_channel_idx
  ON group_posts (channel_id, created_at ASC);
