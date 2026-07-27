ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code text;
UPDATE users SET friend_code = substr(md5(random()::text || id::text), 1, 8) WHERE friend_code IS NULL;
ALTER TABLE users ALTER COLUMN friend_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_friend_code_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_friend_code_key UNIQUE (friend_code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY,
  requester_id uuid NOT NULL REFERENCES users(id),
  addressee_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id != addressee_id),
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id) WHERE status = 'pending';
