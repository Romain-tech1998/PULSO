-- DEC-0022 §6, extended: a line the organizer writes for the people who have
-- to ask before they get the address.
--
-- The mode already lets an organizer withhold the door until they approve a
-- request, but it gave them nothing to approve *on*: a request arrives with a
-- free-text message and no basis for deciding whether its author is somebody
-- the organizer wants in their flat. This is where the organizer says how to
-- identify yourself - "envoie-moi un MP sur Insta @exemple" - so the decision
-- rests on something they can check.
--
-- Deliberately plain text and deliberately public: it is shown to every
-- reader who sees the withheld address, so it is a contact line the organizer
-- publishes, not a private channel. The interface says so where it is typed.
--
-- Only meaningful with address_disclosure = 'on_approval'; the projection and
-- the write path both treat it that way, so a note left over from a mode
-- change is never served.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS address_request_note text;
