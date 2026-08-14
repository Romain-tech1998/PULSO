-- DEC-0018: organizer requests and administration.

-- Set directly in the database, never through the product: an escalation
-- path reachable from the interface is a privilege-escalation surface, and
-- Pulso has exactly one administrator today.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS organizer_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  -- Supplied by the requester. Pulso stores and displays it; it verifies
  -- nothing on its own (DEC-0018).
  justification text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- One *pending* request per account and venue (acceptance criterion 2). A
-- declined one may be resubmitted, so the uniqueness is partial rather than
-- covering the whole table.
CREATE UNIQUE INDEX IF NOT EXISTS organizer_requests_pending_unique
  ON organizer_requests (user_id, venue_id)
  WHERE status = 'pending';

-- The administration queue reads pending requests oldest-first.
CREATE INDEX IF NOT EXISTS organizer_requests_pending_idx
  ON organizer_requests (created_at)
  WHERE status = 'pending';

-- DEC-0018 notification kinds, added to DEC-0016's stored set.
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
      'organizer_request_resolved'
    )
  );
