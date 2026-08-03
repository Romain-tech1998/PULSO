-- Phase 4.17: internal-only venue quality signal - any signed-in user can
-- rate a venue 1-5 stars (comment optional), one rating per user per venue
-- (re-rating replaces the previous value/timestamp rather than stacking
-- rows). The average is used server-side to influence venue ranking; it is
-- never exposed in a public API response - no review system is shown to
-- visitors yet, this is purely an internal curation signal for now.
CREATE TABLE IF NOT EXISTS venue_ratings (
  user_id uuid NOT NULL REFERENCES users(id),
  venue_id uuid NOT NULL REFERENCES venues(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS venue_ratings_venue_idx ON venue_ratings (venue_id);
