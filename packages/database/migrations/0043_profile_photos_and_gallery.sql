-- DEC-0020: a profile becomes a person - a real photo, and a gallery.
--
-- Phase 4.7 deliberately allowed no user image beyond the Google avatar,
-- and gave the profile gradient/emoji presets instead. DEC-0020 reverses
-- that for two specific places, reusing the multipart-to-local-disk upload
-- already serving event covers (DEC-0017), venue photos (DEC-0019), group
-- photos (DEC-0013 v1.3) and event photos (DEC-0012 v1.2). No new storage
-- dependency, same on-disk mechanism.

-- The profile photo. `photo_url` is the public URL, matching the
-- events/venues/groups convention; `photo_path` is the file behind it, kept
-- only so replacing or clearing a photo can delete the previous file
-- instead of orphaning it on disk.
--
-- Deliberately NOT a write to users.avatar_url: that column mirrors
-- whatever Google reports on each login (see upsertUserFromGoogle's ON
-- CONFLICT branch), so anything written there is destroyed on the user's
-- next sign-in. Resolution order is photo -> avatar_style preset ->
-- avatar_url -> initial, resolved on the web side.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_path text;

-- The personal gallery. One row per photo, owned by its author.
--
-- `event_id`/`venue_id` are an optional "taken at" reference, at most one
-- of the two (see the CHECK). It is a link and not a publication: nothing
-- joins this table when rendering an event or a venue page, which keep
-- their own separate photo sets. Both cascade to NULL rather than deleting
-- the photo - a user's own photo must not disappear because an event was
-- removed from the directory.
--
-- No likes, no comments, no visibility column: DEC-0020 scopes gallery
-- visibility to accepted friends for every photo alike, enforced in the
-- repository's SQL rather than per-row here.
CREATE TABLE IF NOT EXISTS user_photos (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  caption text,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_photos_single_reference CHECK (
    event_id IS NULL OR venue_id IS NULL
  )
);

-- Every read is "this user's gallery, newest first" - the only access
-- pattern DEC-0020 authorizes, since there is no cross-user feed.
CREATE INDEX IF NOT EXISTS user_photos_user_created_idx
  ON user_photos (user_id, created_at DESC);
