-- Scope a group's operational modules to one outing instead of to the group.
--
-- The programme, the attendance poll and the checklist each carried a
-- group_id, which made them singletons: a community that goes out every
-- week found last week's schedule, last week's votes and last week's
-- checklist waiting for it, with no way to start fresh short of deleting
-- every row by hand. The group became unusable at its second outing - the
-- opposite of what a permanent community is for.
--
-- An outing is what those modules actually describe. A group has exactly
-- one current outing; creating another archives the previous one, which
-- stays readable rather than being destroyed.
CREATE TABLE IF NOT EXISTS group_outings (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- Set when the outing was started from a real Pulso event (including a
  -- sponsored placement the group decided to adopt). NULL for an outing the
  -- group described in its own words, and ON DELETE SET NULL so a deleted
  -- event does not take the group's whole plan with it.
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- One current outing per group, enforced rather than assumed: two live
-- outings would make "which programme am I looking at" unanswerable.
CREATE UNIQUE INDEX IF NOT EXISTS group_outings_one_current
  ON group_outings (group_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS group_outings_group_idx
  ON group_outings (group_id, created_at DESC);

-- Every existing group gets its current outing, named after the event it is
-- tied to when there is one, so nothing that was already organised loses
-- its context.
INSERT INTO group_outings (id, group_id, event_id, title, starts_at, created_by)
SELECT
  gen_random_uuid(),
  g.id,
  g.event_id,
  COALESCE(e.title, 'Prochaine sortie'),
  e.starts_at,
  g.created_by
FROM groups g
LEFT JOIN events e ON e.id = g.event_id
WHERE NOT EXISTS (
  SELECT 1 FROM group_outings o WHERE o.group_id = g.id
);

ALTER TABLE group_schedule_items
  ADD COLUMN IF NOT EXISTS outing_id uuid REFERENCES group_outings(id) ON DELETE CASCADE;
ALTER TABLE group_checklist_items
  ADD COLUMN IF NOT EXISTS outing_id uuid REFERENCES group_outings(id) ON DELETE CASCADE;
ALTER TABLE group_attendance_responses
  ADD COLUMN IF NOT EXISTS outing_id uuid REFERENCES group_outings(id) ON DELETE CASCADE;

-- Everything written so far belongs to the outing that was just created for
-- its group: it described the group's one and only plan.
UPDATE group_schedule_items i
SET outing_id = o.id
FROM group_outings o
WHERE o.group_id = i.group_id AND o.archived_at IS NULL AND i.outing_id IS NULL;

UPDATE group_checklist_items i
SET outing_id = o.id
FROM group_outings o
WHERE o.group_id = i.group_id AND o.archived_at IS NULL AND i.outing_id IS NULL;

UPDATE group_attendance_responses r
SET outing_id = o.id
FROM group_outings o
WHERE o.group_id = r.group_id AND o.archived_at IS NULL AND r.outing_id IS NULL;

-- Safe only because the backfill above covers every pre-existing row.
ALTER TABLE group_schedule_items ALTER COLUMN outing_id SET NOT NULL;
ALTER TABLE group_checklist_items ALTER COLUMN outing_id SET NOT NULL;
ALTER TABLE group_attendance_responses ALTER COLUMN outing_id SET NOT NULL;

-- "One answer per person" is a fact about an outing, not about a group:
-- keyed on the group, a member could never answer a second outing.
ALTER TABLE group_attendance_responses
  DROP CONSTRAINT IF EXISTS group_attendance_responses_pkey;
ALTER TABLE group_attendance_responses
  ADD PRIMARY KEY (outing_id, user_id);

CREATE INDEX IF NOT EXISTS group_schedule_items_outing_idx
  ON group_schedule_items (outing_id, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS group_checklist_items_outing_idx
  ON group_checklist_items (outing_id, created_at ASC);
