-- Provenance for venues, needed before importing any from OpenStreetMap.
--
-- Until now a venue carried no record of where it came from, so a curated
-- entry, one derived from an ingested event, and an imported suggestion were
-- indistinguishable once written. DEC-0006 forbids publishing a candidate
-- without evidence and review, and that rule is unenforceable if the row does
-- not say what it is.
--
-- Existing rows are 'pulso'/'published' because that is what they are: they
-- came from the event pipeline or from hand curation, and they are already
-- live on the map.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pulso';
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'published';

-- The stable OpenStreetMap reference ("node/1234567"), so a re-import updates
-- the same row instead of creating a second copy of the same pub.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS venues_source_external_ref_key
  ON venues (source, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS venues_review_state_idx ON venues (review_state);

COMMENT ON COLUMN venues.source IS
  'Where the record came from: pulso (curated or event-derived) or openstreetmap. ODbL requires attribution to travel with OSM-sourced data.';
COMMENT ON COLUMN venues.review_state IS
  'published = shown as directory data. candidate = imported but unreviewed; surfaced as a labelled suggestion only, never as a map pin (DEC-0006).';
