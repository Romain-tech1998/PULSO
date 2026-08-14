-- DEC-0016: in-app notifications.
--
-- Only the five *stored* kinds live here. The sixth kind authorized by
-- DEC-0016 - the upcoming-event reminder - is derived at read time from
-- attendance and event start time, so it deliberately has no row: a stored
-- reminder would need a scheduler Pulso does not have and would go stale if
-- the event moved or the user withdrew.
--
-- No label/title column on purpose. A notification references a row that
-- already exists and the display text is composed at render time, so a
-- renamed venue or a deleted event is reflected rather than frozen as a
-- stale claim (DEC-0016 §Data and trust rules).
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN (
      'venue_new_event',
      'friend_request_received',
      'friend_request_accepted',
      'message_received',
      'forum_reply'
    )
  ),
  -- ON DELETE CASCADE on every reference: acceptance criterion 7 requires a
  -- deleted event to take its notifications with it rather than leave a
  -- dangling entry.
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The two hot reads: the panel (newest first for one account) and the
-- unread count. Partial index keeps the count cheap as read rows pile up.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id)
  WHERE read_at IS NULL;

-- One notification per (recipient, kind, referenced row). Re-running
-- ingestion over an event Pulso already knows must not notify a venue's
-- followers a second time (acceptance criterion 1: "exactly one").
CREATE UNIQUE INDEX IF NOT EXISTS notifications_venue_event_unique
  ON notifications (user_id, kind, venue_id, event_id)
  WHERE kind = 'venue_new_event';
