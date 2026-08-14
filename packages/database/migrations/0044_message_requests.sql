-- DEC-0020: direct messages open up, behind a request gate.
--
-- DEC-0012 restricted messaging to accepted friendships, and
-- MessagesRepository.sendMessage enforced that with a NotFriendsError. The
-- consequence was that a user who met someone at an event could not say one
-- thing to them inside Pulso, so they exchanged Instagram handles and every
-- future conversation left the product. This is the smallest model that
-- opens the door without turning the inbox into a broadcast target.
--
-- One row per (recipient, sender) ordered pair, created the first time an
-- account writes to someone who is not a friend. The pair is directional on
-- purpose: "A asked to talk to B" and "B asked to talk to A" are different
-- facts, and either can exist alone.
--
-- Friendships are NOT represented here. An accepted friendship still grants
-- messaging directly, checked separately - so becoming friends does not
-- require back-filling a row, and un-friending does not need to write one.
CREATE TABLE IF NOT EXISTS message_requests (
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'pending'  the sender has used their one message and is waiting
  -- 'accepted' the recipient let them in; the conversation is ordinary
  -- 'declined' the recipient refused; further messages are rejected
  --
  -- 'declined' is kept rather than deleted, which is the whole point of
  -- declining: a deleted row would let the sender start over immediately,
  -- making the decline a formality.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (recipient_id, sender_id),
  CHECK (recipient_id != sender_id)
);

-- The "Demandes" list reads one recipient's pending requests, newest first.
CREATE INDEX IF NOT EXISTS message_requests_pending_idx
  ON message_requests (recipient_id, created_at DESC)
  WHERE status = 'pending';
