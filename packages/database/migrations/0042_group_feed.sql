-- The group home becomes one participatory feed.
--
-- The previous shape put a single "current outing" in a bar above a grid of
-- module cards. It did not work, and the reason is worth writing down: an
-- outing had nowhere to *appear*. Starting one archived the last and showed
-- nothing to anyone, so the button only filed the past away - it never
-- proposed anything to the present. A group is not piloted from a
-- dashboard; it happens in a stream people read and answer.
--
-- So an outing becomes a post. It lands in the feed like any message, keeps
-- its own attendance, programme and checklist, and gets replies and likes
-- for free because the feed already had them.

-- Several outings now coexist: "ce soir au Bal du Lezard" and "samedi au
-- Stereo" are two proposals, not a conflict. Any member may publish one -
-- that is what participatory means - so the single-current constraint goes.
DROP INDEX IF EXISTS group_outings_one_current;

-- Where the outing is, in the group's own words. `event_id` already covers
-- an outing built on a real Pulso event; this covers "chez Marie" and every
-- other place Pulso has never heard of, without inventing a fake venue.
ALTER TABLE group_outings ADD COLUMN IF NOT EXISTS place text;

-- A post is either something someone wrote or an outing they proposed.
-- Modelled as a kind on the existing table rather than a second feed:
-- likes, replies, channels, deletion and reporting all already work here,
-- and a parallel stream would have to reimplement every one of them.
ALTER TABLE group_posts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'message'
  CHECK (kind IN ('message', 'outing'));
ALTER TABLE group_posts
  ADD COLUMN IF NOT EXISTS outing_id uuid REFERENCES group_outings(id) ON DELETE CASCADE;

-- Every outing that already exists gets its entry in the feed, dated when
-- the outing was created so it sits in the right place in the stream.
-- `created_by` is nullable on an outing (ON DELETE SET NULL) while a post
-- always has an author, hence the fallback to the group's creator.
INSERT INTO group_posts (id, group_id, author_id, body, channel_id, kind, outing_id, created_at)
SELECT
  gen_random_uuid(),
  o.group_id,
  COALESCE(o.created_by, g.created_by),
  o.title,
  (
    SELECT c.id FROM group_channels c
    WHERE c.group_id = o.group_id
    ORDER BY c.position ASC, c.created_at ASC
    LIMIT 1
  ),
  'outing',
  o.id,
  o.created_at
FROM group_outings o
JOIN groups g ON g.id = o.group_id
WHERE NOT EXISTS (
  SELECT 1 FROM group_posts p WHERE p.outing_id = o.id
);

-- One feed entry per outing, so a group can never show the same plan twice.
CREATE UNIQUE INDEX IF NOT EXISTS group_posts_outing_unique
  ON group_posts (outing_id)
  WHERE outing_id IS NOT NULL;

-- The feed reads newest first now that it is the group's home, rather than
-- oldest first as a single conversation did.
CREATE INDEX IF NOT EXISTS group_posts_feed_idx
  ON group_posts (group_id, created_at DESC)
  WHERE parent_id IS NULL;
