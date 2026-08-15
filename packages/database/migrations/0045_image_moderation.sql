-- DEC-0021: every user-uploaded image is screened before it is published,
-- and every published one can be reported into a queue an administrator
-- actually works.
--
-- One central table rather than a moderation column set on each of the five
-- tables that hold an uploaded file (users, user_photos, event_photos,
-- groups, events). Five copies of the same five columns would mean a
-- five-way UNION every time the console asks "what needs a decision", and
-- five places to change when a provider is added. The natural key is the
-- stored path: every surface already records exactly that string, so
-- nothing is duplicated to join on.
CREATE TABLE IF NOT EXISTS image_moderations (
  id uuid PRIMARY KEY,
  -- Relative to the upload root, e.g. "user-photos/<userId>/<uuid>.jpg".
  file_path text NOT NULL UNIQUE,
  surface text NOT NULL CHECK (
    surface IN (
      'profile_photo',
      'user_photo',
      'event_photo',
      'group_photo',
      'event_cover'
    )
  ),
  -- Who uploaded it. Kept so the console can name an owner without joining
  -- through five different parent tables.
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  -- Three states, not four. A 'pending' state would never be observed:
  -- screening happens inline during the upload request, so a row exists
  -- only once a decision has been reached. 'rejected' is stored even though
  -- the file is discarded, so a repeated attempt is visible.
  status text NOT NULL CHECK (status IN ('approved', 'flagged', 'rejected')),
  provider text,
  -- The provider's raw category scores, kept verbatim. A threshold that
  -- moves later can then be judged against decisions already made.
  scores jsonb,
  reason text,
  moderated_at timestamptz NOT NULL DEFAULT now(),
  -- Set when a human settled it, which is what distinguishes an image an
  -- administrator approved from one the provider approved.
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz
);

-- The console's only question: what still needs a decision, oldest first.
CREATE INDEX IF NOT EXISTS image_moderations_flagged_idx
  ON image_moderations (moderated_at)
  WHERE status = 'flagged';

CREATE INDEX IF NOT EXISTS image_moderations_owner_idx
  ON image_moderations (owner_id);

-- Reports reach the same queue rather than a second one. target_id is an
-- image_moderations.id for the new kinds, keeping one reports table for
-- every kind of content (DEC-0012).
ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE content_reports
  ADD CONSTRAINT content_reports_target_type_check CHECK (
    target_type IN ('forum_post', 'message', 'group_post', 'image')
  );

-- One report per account per target. DEC-0021 says a second attempt changes
-- nothing rather than inflating a count, and the database is where that
-- holds regardless of which route is calling.
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_reporter_target_key
  ON content_reports (reporter_id, target_type, target_id);

-- Everything already on disk was published under DEC-0020's rules, which
-- had no screening at all. Backfilled as approved so no existing photo
-- disappears the moment this ships - DEC-0021 applies going forward, and
-- says so in its boundaries.
INSERT INTO image_moderations (id, file_path, surface, owner_id, status, provider, reason)
SELECT gen_random_uuid(), u.photo_path, 'profile_photo', u.id, 'approved', 'backfill',
       'Published before DEC-0021 introduced screening.'
FROM users u
WHERE u.photo_path IS NOT NULL
ON CONFLICT (file_path) DO NOTHING;

INSERT INTO image_moderations (id, file_path, surface, owner_id, status, provider, reason)
SELECT gen_random_uuid(), p.file_path, 'user_photo', p.user_id, 'approved', 'backfill',
       'Published before DEC-0021 introduced screening.'
FROM user_photos p
ON CONFLICT (file_path) DO NOTHING;

INSERT INTO image_moderations (id, file_path, surface, owner_id, status, provider, reason)
SELECT gen_random_uuid(), p.file_path, 'event_photo', p.uploader_id, 'approved', 'backfill',
       'Published before DEC-0021 introduced screening.'
FROM event_photos p
ON CONFLICT (file_path) DO NOTHING;

INSERT INTO image_moderations (id, file_path, surface, owner_id, status, provider, reason)
SELECT gen_random_uuid(), g.image_path, 'group_photo', g.created_by, 'approved', 'backfill',
       'Published before DEC-0021 introduced screening.'
FROM groups g
WHERE g.image_path IS NOT NULL
ON CONFLICT (file_path) DO NOTHING;
