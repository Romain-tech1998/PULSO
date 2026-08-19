-- A third answer to "who may know I am going": public.
--
-- `private` and `friends` were the only two since migration 0011. The product
-- owner asked for a third, worded to the account choosing it as "tout le monde
-- saura que tu participes" - so it means exactly that, including a reader with
-- no account at all. It is a per-event choice, never a profile setting: saying
-- yes publicly to one night is not saying yes to every night.
--
-- Nothing is migrated. Every existing row keeps the visibility it was given
-- under the old rules, and `private` remains the default - a widened set of
-- options must never widen anyone's existing exposure.
ALTER TABLE event_attendance
  DROP CONSTRAINT IF EXISTS event_attendance_visibility_check;

ALTER TABLE event_attendance
  ADD CONSTRAINT event_attendance_visibility_check
  CHECK (visibility IN ('private', 'friends', 'public'));
