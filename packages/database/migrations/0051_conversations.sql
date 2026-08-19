-- DEC-0025: messaging becomes a room with participants, and a one-to-one
-- exchange becomes a room with two of them.
--
-- The alternative was group chat beside the existing pair, which forks every
-- read, every unread count and every inbox query in the product forever, so
-- that the second participant of a pair and the fifth of a room can be told
-- apart for no reason a user would ever notice. Existing messages are moved
-- into the new shape rather than left behind in the old one.

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  -- Optional, and null for every migrated pair: a two-person exchange is
  -- named by who is in it, which the client already does.
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Who opened it. Carries no authority (DEC-0025 §4 is flat: no owner, no
  -- admin) - it is kept because "who started this" is a question a report or
  -- a support request will ask.
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL
);

-- DEC-0025 §2. Read state belongs here rather than on the message: in a room
-- "read" is true of some people and false of others at the same instant, and
-- `messages.read_at` has no way to say that. It also makes an unread count a
-- comparison instead of a write per message, which is what lets an inbox of
-- many rooms be answered in one query.
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  -- Everything after this instant is unread for this participant. Starts at
  -- the epoch so a new member's first read marks the history they were given.
  last_read_at timestamptz NOT NULL DEFAULT 'epoch',
  -- §5. Set rather than deleted: the messages this account wrote stay visible
  -- to everyone still in the room, and a row that vanished would leave them
  -- attributed to nobody. It also records that they were here.
  left_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

-- The inbox: every room this account is still in, and the unread comparison.
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON conversation_participants (user_id)
  WHERE left_at IS NULL;

-- A message now belongs to a room. `recipient_id` stays for the length of the
-- transition so nothing reading the old shape breaks mid-deploy; it is dropped
-- once every reader is on conversations.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE messages
  ALTER COLUMN recipient_id DROP NOT NULL;

-- One room per unordered pair that has ever exchanged a message.
--
-- `least`/`greatest` is what makes the pair unordered: (A→B) and (B→A) are the
-- same conversation, and a migration that treated them as two would split
-- every existing exchange down the middle of its own history.
WITH pairs AS (
  SELECT DISTINCT
    least(sender_id, recipient_id) AS a,
    greatest(sender_id, recipient_id) AS b
  FROM messages
  WHERE conversation_id IS NULL AND recipient_id IS NOT NULL
),
made AS (
  INSERT INTO conversations (id, created_at)
  SELECT gen_random_uuid(), now() FROM pairs
  RETURNING id
),
numbered_pairs AS (
  SELECT a, b, row_number() OVER (ORDER BY a, b) AS n FROM pairs
),
numbered_rooms AS (
  SELECT id, row_number() OVER (ORDER BY id) AS n FROM made
),
joined AS (
  SELECT p.a, p.b, r.id
  FROM numbered_pairs p
  JOIN numbered_rooms r ON r.n = p.n
),
participants AS (
  INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
  SELECT id, a, now() FROM joined
  UNION ALL
  SELECT id, b, now() FROM joined
  ON CONFLICT DO NOTHING
  RETURNING conversation_id
)
UPDATE messages m
SET conversation_id = j.id
FROM joined j
WHERE m.conversation_id IS NULL
  AND least(m.sender_id, m.recipient_id) = j.a
  AND greatest(m.sender_id, m.recipient_id) = j.b;

-- Carry the one thing the old shape did record: a message already read by its
-- recipient should not come back unread. The recipient's marker moves to the
-- newest message they had read.
UPDATE conversation_participants cp
SET last_read_at = newest.read_at
FROM (
  SELECT conversation_id, recipient_id, max(read_at) AS read_at
  FROM messages
  WHERE read_at IS NOT NULL AND recipient_id IS NOT NULL
  GROUP BY conversation_id, recipient_id
) AS newest
WHERE cp.conversation_id = newest.conversation_id
  AND cp.user_id = newest.recipient_id;

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (conversation_id, created_at DESC);
