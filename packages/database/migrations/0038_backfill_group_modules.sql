-- Give every existing group the module layout its type implies.
--
-- Until now the workspace ignored `modules_config` and drew the same three
-- cards for everybody, so nothing ever noticed that the column was empty:
-- on this database all nine groups carried `[]`, either because they predate
-- the column or because findOrCreateEventGroup wrote '[]' literally. The
-- moment the workspace starts reading the column, `[]` means "show nothing",
-- and every one of those groups would lose its programme, attendance and
-- checklist.
--
-- An empty or unrecognisable config means "never configured", not
-- "everything off", so it is filled from the group's type template - the
-- same layout defaultModulesForGroupType() produces in the domain package.
-- A group that was genuinely configured keeps exactly what it has.
UPDATE groups SET modules_config = CASE type
  WHEN 'event' THEN '[
    {"module": "attendance",   "enabled": true,  "position": 0},
    {"module": "programme",    "enabled": true,  "position": 1},
    {"module": "meetup_point", "enabled": true,  "position": 2},
    {"module": "checklist",    "enabled": true,  "position": 3}
  ]'::jsonb
  WHEN 'private_crew' THEN '[
    {"module": "attendance",   "enabled": true,  "position": 0},
    {"module": "checklist",    "enabled": true,  "position": 1},
    {"module": "programme",    "enabled": false, "position": 2},
    {"module": "meetup_point", "enabled": false, "position": 3}
  ]'::jsonb
  ELSE '[
    {"module": "programme",    "enabled": true,  "position": 0},
    {"module": "attendance",   "enabled": true,  "position": 1},
    {"module": "meetup_point", "enabled": false, "position": 2},
    {"module": "checklist",    "enabled": false, "position": 3}
  ]'::jsonb
END
WHERE NOT EXISTS (
  -- "Has at least one module this build still knows about switched on."
  --
  -- Checking merely for the module's presence is not enough: the previous
  -- sixteen-module template listed all four of these and left every one of
  -- them disabled, because it enabled event_proposals, next_event,
  -- announcements, members and discussion instead - none of which exist as
  -- configurable modules any more. Such a group is carrying a default from
  -- a registry that is gone, not a choice a person made, and reading it
  -- literally would leave its workspace permanently empty.
  SELECT 1
  FROM jsonb_array_elements(groups.modules_config) AS entry
  WHERE (entry ->> 'enabled')::boolean
    AND entry ->> 'module' IN (
      'programme', 'attendance', 'meetup_point', 'checklist'
    )
);
