ALTER TABLE groups ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'open';
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_visibility_check;
ALTER TABLE groups ADD CONSTRAINT groups_visibility_check CHECK (visibility IN ('open', 'restricted'));

ALTER TABLE group_memberships ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'member';
ALTER TABLE group_memberships DROP CONSTRAINT IF EXISTS group_memberships_status_check;
ALTER TABLE group_memberships ADD CONSTRAINT group_memberships_status_check CHECK (status IN ('member', 'pending'));

CREATE TABLE IF NOT EXISTS group_schedule_items (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id),
  label text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_schedule_items_group_idx ON group_schedule_items (group_id, scheduled_at ASC);

CREATE TABLE IF NOT EXISTS group_attendance_responses (
  group_id uuid NOT NULL REFERENCES groups(id),
  user_id uuid NOT NULL REFERENCES users(id),
  response text NOT NULL CHECK (response IN ('yes', 'maybe', 'no')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_checklist_items (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id),
  label text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_checklist_items_group_idx ON group_checklist_items (group_id, created_at ASC);

CREATE TABLE IF NOT EXISTS group_checklist_checks (
  item_id uuid NOT NULL REFERENCES group_checklist_items(id),
  user_id uuid NOT NULL REFERENCES users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
