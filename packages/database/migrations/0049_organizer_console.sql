-- DEC-0023 §3 and §4: what the organizer's console counts, and the cap it
-- can put on an event.

-- §4. Optional, and absent by default: most events have no door count, and a
-- NOT NULL column would make every organizer invent one. Nothing here is
-- enforced by the constraint - the cap is applied when an attendance row is
-- written, so lowering it below the number already committed evicts nobody,
-- which is the rule the document is most insistent about.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS attendance_limit integer
  CHECK (attendance_limit IS NULL OR attendance_limit > 0);

-- §3. A counter, not a log.
--
-- One row per event per day holding a number, and deliberately nothing else:
-- no account, no address, no session, no agent, no row per open. There is
-- nothing here to join against another table, which is the entire point - a
-- per-reader view history would contradict the account model DEC-0020 chose,
-- and it would be built for a vanity metric.
--
-- The consequence is written into the name of what this holds: `views` counts
-- openings, and because there is no identifier there is nothing to
-- deduplicate against. The interface says "vues", never "personnes".
CREATE TABLE IF NOT EXISTS event_view_counts (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- A date rather than a timestamp: an hour would start describing when
  -- somebody looked, and the day is already enough to draw a trend.
  on_day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, on_day)
);

-- The console reads one event's whole history at once, and the increment
-- targets a single (event, day) pair the primary key already covers.
CREATE INDEX IF NOT EXISTS event_view_counts_event_idx
  ON event_view_counts (event_id, on_day DESC);
