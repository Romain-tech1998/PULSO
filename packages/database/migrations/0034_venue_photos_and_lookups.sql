-- Photo provenance for venues, and a memory of live venue lookups.
--
-- Two things become possible with the OpenStreetMap import, and both need
-- somewhere to record *where a fact came from*.
--
-- 1. Photos. OSM itself almost never carries one: across the 860 named venues
--    within 30 km of Montréal, 4 have an `image` tag, 1 a `wikimedia_commons`
--    tag, and 78 a `wikidata` id of which 49 resolve to a Commons photo. That
--    is 6% coverage. The rest of the coverage comes from the venue's own
--    website (299 of the 860 publish one), read as its Open Graph preview
--    image. Those two sources sit in completely different legal positions -
--    Commons is freely licensed with a named author, an og:image is the
--    business's own copyrighted photo offered for link previews - so the row
--    has to say which one it is. A single `image_url` column cannot express
--    "this is CC BY-SA by Jean Gagnon" versus "this is the bar's own photo,
--    hotlinked, remove it the moment they ask".
--
-- 2. Suppression. Because the second kind is removable on request, removal has
--    to outlive the next import. Clearing `venues.image_url` alone would be
--    undone by the following run, which would cheerfully re-fetch the very
--    photo somebody asked Pulso to take down.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_source text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_attribution text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS image_page_url text;

COMMENT ON COLUMN venues.image_source IS
  'Provenance of image_url: wikimedia_commons (freely licensed, attribution required), website_og (the venue''s own Open Graph preview image, hotlinked and removable on request), osm_image_tag (an image=* tag pointing at an arbitrary host under an unstated licence, treated as removable), or pulso (curated). NULL for rows predating this column.';
COMMENT ON COLUMN venues.image_attribution IS
  'Credit line the licence requires, e.g. "Photo: Jean Gagnon (CC BY-SA 4.0)". NULL when the source imposes none.';
COMMENT ON COLUMN venues.image_page_url IS
  'Human-readable page the photo came from - the Commons file page, or the website the og:image was read from. This is what an operator opens when handling a takedown request.';

-- A removed photo stays removed. NULL image_url blocks *every* future photo
-- for that venue, which is what a "stop using my pictures" request actually
-- means; a specific URL blocks only that one, for the narrower case of a
-- wrong or unflattering image that a better one should replace.
CREATE TABLE IF NOT EXISTS venue_photo_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  image_url text,
  reason text,
  suppressed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_photo_suppressions_venue_url_key
  ON venue_photo_suppressions (venue_id, coalesce(image_url, ''));

-- Every text search that found nothing locally and went out to look. Kept so
-- the same miss is asked of Nominatim once rather than once per visitor: a
-- misspelling that will never match anything would otherwise generate an
-- unbounded stream of requests to a volunteer-run service. `found_count`
-- distinguishes "we looked and there is nothing" from "we have not looked".
CREATE TABLE IF NOT EXISTS venue_lookup_attempts (
  folded_query text PRIMARY KEY,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  found_count integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE venue_lookup_attempts IS
  'Rate-limiting memory for the live venue lookup behind search. Not a cache of results - the venues themselves are persisted in `venues`.';
