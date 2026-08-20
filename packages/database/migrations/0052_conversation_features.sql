-- DEC-0025 v1.1: what a conversation carries besides its messages.
--
-- Mute, pin, search and attachments, added together because they are one
-- decision - a messaging surface people can live in rather than tolerate -
-- and because the room model of migration 0051 lets each of them be built
-- once instead of twice.

-- Both belong to the participant, not to the room: muting is my choice about
-- my attention, and pinning is my ordering of my inbox. Neither is visible to
-- anyone else, and neither changes what anybody receives.
ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS muted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- DEC-0025 §8. One notification per room while one is still unread, rather
-- than one per message: a room of eight would otherwise turn a lively Friday
-- into seven notifications a sentence, and the first thing anybody does about
-- an avalanche is silence it - which for a feature whose whole purpose is
-- retention would be the exact opposite of the point.
--
-- Held here rather than derived from the notifications table so the check is
-- one column read on a row already being written.
ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- An attachment is a file that belongs to a message. Kept in its own table
-- rather than as columns on `messages`, because a message may carry several
-- and because a message with none - the overwhelming majority - should pay
-- nothing for the possibility.
--
-- `file_path` is the same shape the rest of the product stores: a path under
-- the upload directory, screened by DEC-0021 before it is ever readable. An
-- attachment that fails screening is not stored here at all, so nothing in
-- this table needs a moderation state.
CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_message_idx
  ON message_attachments (message_id);

-- Search runs inside the rooms one account is in, never across the product,
-- so the index that matters is (conversation, folded body). `pulso_fold` is
-- the same accent-flattening the venue search already uses, so "soiree" finds
-- "soirée" the way it does everywhere else in Pulso.
CREATE INDEX IF NOT EXISTS messages_search_idx
  ON messages (conversation_id, pulso_fold(body) text_pattern_ops);
