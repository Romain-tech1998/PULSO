-- DEC-0022 §6: an organizer may withhold the exact location of their event
-- until they have approved the person asking.
--
-- This replaces DEC-0017 v1.2's `address_hidden`, which did not work. That
-- flag was read only by `explore-map.tsx`, which declined to render the
-- street line; the repository selected `v.address` unconditionally and
-- returned it, along with the exact coordinates, to any caller including an
-- anonymous one. The address of every "hidden" event was one HTTP request
-- away. Everything below exists so the guarantee is made by the database
-- rather than by the interface that happens to draw it.

-- Two modes, not a boolean, because "hidden" never said hidden *from whom*.
-- 'on_approval' names the only thing that can lift it.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS address_disclosure text NOT NULL DEFAULT 'public'
    CHECK (address_disclosure IN ('public', 'on_approval'));

-- Every event that used the old flag becomes an 'on_approval' event. There
-- is no data loss and no behaviour change for its organizer: what changes is
-- that the promise is now kept.
UPDATE events SET address_disclosure = 'on_approval' WHERE address_hidden;

ALTER TABLE events DROP COLUMN IF EXISTS address_hidden;

-- An ingested event cannot withhold its address: it came from a public
-- source that already published it, and pretending otherwise would hide a
-- venue Pulso does not control from a directory it does. DEC-0022 §6 scopes
-- the mode to created events, and this is where that holds.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_address_disclosure_origin_check;
ALTER TABLE events
  ADD CONSTRAINT events_address_disclosure_origin_check
  CHECK (address_disclosure = 'public' OR origin <> 'directory');

CREATE INDEX IF NOT EXISTS events_address_disclosure_idx
  ON events (address_disclosure)
  WHERE address_disclosure <> 'public';

-- A second leak of the same address, independent of the event row.
--
-- DEC-0017's createEvent inserts a `venues` row for a typed address, leaving
-- category NULL and review_state at its 'published' default. Map pins are
-- safe by accident (findVenuesWithoutUpcomingEvents requires a category),
-- but `searchVenues` filters on neither: it matches name *and address* text
-- against every row in the table. A private after's street address was
-- therefore findable by typing it into Pulso search, whatever the event said
-- about disclosure.
--
-- A venue that exists only to carry one organizer's typed address is not a
-- directory entry. It is marked private and excluded from every venue
-- surface - search, map pins, lookups - rather than being filtered at each
-- one on a condition someone will forget.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

UPDATE venues v
SET is_private = true
WHERE EXISTS (
  SELECT 1 FROM events e
  WHERE e.venue_id = v.id
    AND e.address_disclosure = 'on_approval'
);

CREATE INDEX IF NOT EXISTS venues_is_private_idx ON venues (is_private)
  WHERE is_private;

COMMENT ON COLUMN venues.is_private IS
  'DEC-0022: a private address typed by an organizer, never a directory entry. Excluded from venue search, map pins and lookups.';

-- One row per (event, account), which is what makes a decline permanent:
-- the row stays 'declined' and a second request conflicts with it rather
-- than opening a new one. DEC-0022 §6.
CREATE TABLE IF NOT EXISTS event_access_requests (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  -- Optional note from the requester. An organizer deciding who comes to
  -- their home has a better basis for it than a display name alone.
  message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  -- Kept for the same reason DEC-0021 keeps `decided_by`: an approval that
  -- turns out badly should name who granted it.
  resolved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, user_id)
);

-- The organizer's queue: what is still waiting on me, oldest first.
CREATE INDEX IF NOT EXISTS event_access_requests_pending_idx
  ON event_access_requests (event_id, requested_at)
  WHERE status = 'pending';

-- The hot path, run once per event row on every read of an 'on_approval'
-- event: is this viewer approved?
CREATE INDEX IF NOT EXISTS event_access_requests_approved_idx
  ON event_access_requests (user_id, event_id)
  WHERE status = 'approved';

-- The offset pin served to everyone who is not approved.
--
-- Deterministic, and that is the whole point. An offset recomputed randomly
-- per request is triangulable: ask for the same event ten times and the true
-- point is the centroid of the answers. Derived from the event id, the
-- offset is the same on every call forever, so repetition yields nothing.
--
-- Derived from the *event* id rather than the venue's, so two events at one
-- address do not disclose it by intersecting.
--
-- Between 250 m and 349 m, in a direction that is uniform over the circle.
-- The neighbourhood stays legible - which is what keeps the event usable on
-- the map at all - while the building does not.
CREATE OR REPLACE FUNCTION pulso_approximate_point(
  p_location geometry,
  p_event_id uuid
) RETURNS geometry
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT ST_SetSRID(
    ST_Translate(
      p_location,
      -- A degree of longitude shortens with latitude; at Montréal's 45.5° it
      -- is about 0.7 of a degree of latitude. Without this the offset would
      -- be noticeably elliptical.
      (cos(jitter.angle) * jitter.radius)
        / (111320.0 * cos(radians(ST_Y(p_location)))),
      (sin(jitter.angle) * jitter.radius) / 111320.0
    ),
    4326
  )
  FROM (
    SELECT
      radians(
        ((('x' || substr(md5(p_event_id::text), 1, 8))::bit(32)::int % 360)
          + 360) % 360
      )::double precision AS angle,
      250.0 + ((( ('x' || substr(md5(p_event_id::text), 9, 8))::bit(32)::int
        % 100) + 100) % 100)::double precision AS radius
  ) AS jitter;
$$;

COMMENT ON FUNCTION pulso_approximate_point(geometry, uuid) IS
  'DEC-0022 §6: the ~300 m offset point served for an on_approval event to a viewer who is not approved. Deterministic in the event id so repeated requests cannot triangulate the true location.';

-- DEC-0016 gains the three kinds DEC-0022 §6 requires. A request reaching
-- the organizer, and both outcomes reaching the requester - a decline that
-- notified nobody would leave someone waiting on an answer that already
-- exists.
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
      'organizer_request_resolved',
      'group_verification_received',
      'group_verification_resolved',
      'group_join_request_received',
      'group_join_request_accepted',
      'event_access_requested',
      'event_access_approved',
      'event_access_declined'
    )
  );
