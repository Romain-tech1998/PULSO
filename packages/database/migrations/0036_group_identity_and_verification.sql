-- Groups: a real identity (photo), and verification.
--
-- DEC-0013/DEC-0015 give a group a name and a description but no face, so
-- every group renders as the first letter of its name. The photo reuses the
-- upload mechanism already built for event and venue photos (multipart to
-- the API's own disk) - no new storage dependency.
--
-- `image_url` is the public URL, matching events.image_url/venues.image_url;
-- `image_path` is the on-disk file behind it, kept only so replacing or
-- removing a photo can delete the previous file instead of orphaning it.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_path text;

-- Verification: requested by the group's creator, granted by a Pulso
-- administrator. Deliberately the same request/approve shape DEC-0018
-- established for organizer accounts, reusing users.is_admin rather than
-- inventing a second privileged role. 'none' and 'declined' are distinct:
-- a declined group may ask again, and the interface should not pretend it
-- never asked.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'none'
  CHECK (verification_status IN ('none', 'pending', 'verified', 'declined'));
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verification_justification text;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- The administration queue reads pending requests oldest-first, same as
-- organizer_requests_pending_idx.
CREATE INDEX IF NOT EXISTS groups_verification_pending_idx
  ON groups (verification_requested_at)
  WHERE verification_status = 'pending';

-- A notification about a group has to be able to point at one. DEC-0016
-- stores no display text, so the group's name is joined at read time and a
-- deleted group takes its notifications with it.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;

-- Two group kinds join DEC-0016's stored set. `group_join_request_received`
-- closes a real gap rather than adding noise: a restricted group's pending
-- queue already existed but nothing ever told its moderator to look at it.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check CHECK (
    kind IN (
      'venue_new_event',
      'friend_request_received',
      'friend_request_accepted',
      'message_received',
      'forum_reply',
      'organizer_request_received',
      'organizer_request_resolved',
      'group_verification_received',
      'group_verification_resolved',
      'group_join_request_received',
      'group_join_request_accepted'
    )
  );
