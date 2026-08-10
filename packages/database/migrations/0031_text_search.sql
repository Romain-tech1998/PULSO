-- Intelligent search can now match what a visitor actually typed against
-- event titles, organizers and venue names. Until this migration the query
-- text never touched the data at all: it was only ever mined for date,
-- category and price filters, so naming a real event or venue ("Centre Bell",
-- "Lion King") returned nothing.
--
-- Montréal's directory is full of accents - "Théâtre", "Métropolis", "Café
-- Cléopâtre" - and someone typing "theatre" or "cafe cleopatre" has to find
-- them. Folding is done with translate() rather than the unaccent extension
-- on purpose: unaccent installs into a different schema on some managed
-- providers (Supabase puts extensions in `extensions`), which would leave
-- this function resolvable locally and missing in production. translate() is
-- core PostgreSQL and behaves identically everywhere.
--
-- IMMUTABLE so it can back an expression index later. None is created now:
-- the directory holds a few thousand events and a sequential scan answers in
-- under a millisecond. Add one when that stops being true.
CREATE OR REPLACE FUNCTION pulso_fold(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT translate(
    lower(value),
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  )
$$;
