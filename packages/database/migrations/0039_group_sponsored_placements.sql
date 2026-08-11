-- Paid placement of an event into a group (DEC-0015 §Future monetization).
--
-- The commercial unit is an event shown to a relevant community, never a
-- banner ad and never an automatic post in the group's conversation: a
-- venue buys a placement, Pulso puts that event at the top of the group's
-- "Organiser" tab, and the group's own administrator can take it down.
--
-- Placements are created by a Pulso administrator only. There is no route
-- that lets a group, a venue or an organizer place one on their own - the
-- sale happens outside the product, and inventing a self-serve path here
-- would be an unpriced way into every community on Pulso.
CREATE TABLE IF NOT EXISTS group_sponsored_placements (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- Who the placement is on behalf of, shown on the banner. Typed by the
  -- administrator rather than derived from the event's organizer field:
  -- the payer and the listed organizer are not always the same name, and
  -- a banner must say who actually paid for it.
  sponsor_name text NOT NULL,
  message text,
  placed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- When the placement stops showing. NULL means "until the event starts",
  -- which the read query enforces - a banner for last week's party is worse
  -- than no banner.
  ends_at timestamptz,
  -- The group's own moderator taking it down. DEC-0015 requires the group
  -- to keep the last word ("staff can reject a proposal without penalty"),
  -- and recording who and when is what makes that measurable rather than
  -- silent.
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- One live placement per event per group: buying the same slot twice is a
-- billing question, not two banners.
CREATE UNIQUE INDEX IF NOT EXISTS group_sponsored_placements_live_unique
  ON group_sponsored_placements (group_id, event_id)
  WHERE dismissed_at IS NULL;

-- The hot read: what this group should show right now.
CREATE INDEX IF NOT EXISTS group_sponsored_placements_group_idx
  ON group_sponsored_placements (group_id)
  WHERE dismissed_at IS NULL;
