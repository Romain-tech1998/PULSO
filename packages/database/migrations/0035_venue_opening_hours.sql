-- Opening hours for a venue, and when Pulso last saw them.
--
-- Stored as the source's own rule string rather than a parsed table. The
-- OpenStreetMap syntax already expresses everything these venues need
-- ("Mo-Su 16:00-03:00; Tu off"), and normalizing it into rows would mean
-- deciding at write time what the rule means - which is exactly the decision
-- that has to stay reversible while the parser is still learning the
-- vocabulary. @pulso/domain reads the string; a rule it cannot read yields no
-- schedule at all rather than a partial one.
--
-- `observed_at` is not decoration. Pulso now says "open now" from this data,
-- which is a claim about the present moment made from a record of unknown
-- age. A bar that closed for renovations six months ago is still tagged open
-- in OSM, so the timestamp is what lets the interface decline to make the
-- claim once the record is too old to support it.
ALTER TABLE venues ADD COLUMN IF NOT EXISTS opening_hours text;
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS opening_hours_observed_at timestamptz;

COMMENT ON COLUMN venues.opening_hours IS
  'Verbatim opening-hours rule in OpenStreetMap syntax, e.g. "Mo-Su 16:00-03:00; Tu off". Parsed by @pulso/domain, never at write time.';
COMMENT ON COLUMN venues.opening_hours_observed_at IS
  'When this rule was last read from the source. An "open now" claim is only made while it is recent enough to support one.';
