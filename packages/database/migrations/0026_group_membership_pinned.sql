-- Phase 4.14: lets a member choose which of their groups show in the
-- sidebar's shortcut list, rather than always listing every joined group
-- unfiltered. Defaults to false - pinning is an explicit choice, never
-- assumed.
ALTER TABLE group_memberships
  ADD COLUMN pinned boolean NOT NULL DEFAULT false;
