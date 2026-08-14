# DATA-0003 — Ingestion API Landscape

**Identifier:** DATA-0003
**Version:** 0.5
**Status:** Draft
**Dependencies:** PDR-0001, MVP-0001, DATA-0001, DATA-0002, DEC-0006

## Purpose

Records the real-world API/access landscape researched for Pulso's Montréal event ingestion, so source and connector choices are traceable, and documents the first working connector code built against this research (`packages/ingestion`). This satisfies the "recherche préalable à l'ingestion" step required by PROJECT_INDEX before production ingestion, for the sources covered here. It does not itself authorize production ingestion: DATA-0001's trust model is still Draft, and no source below is Accepted for production use until reviewed against it.

## Researched sources

### Ville de Montréal — Événements publics (open data)

Official City of Montréal open dataset at `donnees.montreal.ca/dataset/evenements-publics`. No API key, no authentication, no rate limit beyond fair use; published under the City's open-data license (`donnees.montreal.ca/pages/licence-d-utilisation`), updated daily, available as CSV/GeoJSON/SHP. Fields include title, description, start/end datetime, event type, cost, borough, address, and lat/long.

This is the lowest-risk, zero-cost source available, but its coverage skews toward city-organized civic/cultural programming (markets, exhibitions, public sessions) rather than nightlife, concerts, or ticketed club events. Treat it as a supplementary source, not the primary one for MVP-0001's nightlife scope.

**Status:** connector implemented (`createMontrealOpenDataConnector`), not yet run against live data in this session — see Verification below.

### Ticketmaster Discovery API v2

Public, well-documented API at `developer.ticketmaster.com`. Free registration issues a Consumer Key used as the `apikey` query parameter (confirmed directly against the live docs: `https://app.ticketmaster.com/discovery/v2/events.json?apikey={apikey}`, matching this package's implementation). Covers concerts, comedy, and other ticketed events, including many Montréal venues. Confirmed default free-tier quota: 5000 API calls per day, rate-limited to 5 requests per second — re-check the portal if production volume approaches this.

**Status:** connector implemented (`createTicketmasterConnector`) and verified live against a real API key: 200 Montréal events were fetched successfully.

**Data quality finding:** 26% of that 200-event sample (52 events), including known venues such as the Bell Centre, had `"longitude":"0","latitude":"0"` in Ticketmaster's own response instead of an omitted field. (0, 0) is a real coordinate (Gulf of Guinea) that is never a genuine Montréal venue location; a naive consumer would silently mislocate over a quarter of Ticketmaster events. `mapTicketmasterEvent` now treats `(0, 0)` as "no coordinates" rather than a valid point, consistent with UX-0001's rule that an event without exploitable coordinates must not be presented as correctly positioned.

**Coordinate recovery rule:** a shared `enrichMissingCoordinates` helper (`packages/ingestion/src/lib/geocode-fallback.ts`), usable by any connector, applies a two-tier rule whenever a `RawIngestedEvent` has no point:

1. If the event already has a known address or venue name (Ticketmaster's Bell Centre case: coordinates were `(0, 0)`, but the venue name and street address were present), geocode that address via OpenStreetMap Nominatim - free, no key, but rate-limited to 1 request/second with a required identifying User-Agent per Nominatim's usage policy, so this must run sequentially, not in parallel, and must not be pointed at heavy production volume without self-hosting or a commercial arrangement. Resulting events are marked `pointResolution: 'geocoded'`, distinct from `'source'` (coordinates the provider gave directly), so a future trust/confidence mapping can treat geocoded points as less certain than source-provided ones.
2. If there is no address or venue name at all to geocode, this connector layer does **not** perform an open-ended web search to invent one. Automatically guessing a venue's location from an uncontrolled search result risks silently mislocating an event with no way to verify it - the same "no candidate without evidence and review" boundary DEC-0006 already sets for Instagram Scout. These events are marked `pointResolution: 'needs_research'` instead, so they can be queued for a human (or a separately reviewed, source-specific lookup) rather than trusted outright.

`pointResolution` (`'source' | 'geocoded' | 'unresolved' | 'needs_research'`) is now part of `RawIngestedEvent` precisely so this distinction survives into the future PublicEvent-mapping stage: it must inform `locationConfidence` rather than being discarded.

### Shotgun

No public/self-serve developer API was found. Shotgun's documented API access is organizer-side (an Organizer ID and API token an event organizer generates to export their *own* events to another tool), not a public search/discovery API a third party can query for arbitrary Montréal events. Using Shotgun data without either an organizer partnership or a documented public endpoint would mean scraping their site, which requires a Terms of Service review before any implementation.

**Status:** not implemented. Requires either a partner/API conversation with Shotgun directly, or an explicit decision to accept scraping risk after ToS review — this is a decision for Romain, not something to build unilaterally.

### Eventbrite

Eventbrite permanently removed public event-search API access in February 2020. The remaining API only returns events you already know the ID of, or events belonging to a venue/organization you control. There is no way to discover unknown Montréal events on Eventbrite through their API as a third party, short of applying to their distribution partner program.

**Status:** not implemented; not a viable discovery source without a distribution-partner agreement.

### Facebook/Instagram (Meta)

Meta's Graph API for Page-level content (posts, and by extension venue-run event pages) requires the **Page Public Content Access** feature, which requires Meta App Review — a multi-week process with production access starting at zero and requiring renewal. There is no general "search all public Facebook events" API available to ordinary third-party apps; the closest thing (Meta Content Library API) is a research-access product with its own separate approval process, not a casual integration path.

Instagram's **Business Discovery** endpoint (Graph API) is different and directly useful for Pulso Scout (DEC-0006): from an app with your *own* linked Instagram Business/Creator account, it can read public profile metadata and recent Feed/Reel media of *other* named public Business/Creator accounts by username. This matches DEC-0006's model exactly — a fixed, known watchlist (the handles already in `docs/data/research/montreal-source-registry.csv`), not open-ended scraping. It does not expose third-party Stories or personal accounts. Development access supports the supervised pilot; checking the full registry at production scale remains gated by Meta App Review and Business Verification.

**Status:** connector implemented and validated live (`fetchInstagramScoutSignals`) against Graph API v25, returning raw signals (caption, media type, media product type, temporary media/thumbnail URLs, permalink, timestamp) for human review — not structured events. The dedicated linked account is `pulso_scout` and the required permissions are `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, and `pages_show_list`. A five-source pilot using an extended user token succeeded without target errors: 50 recent items, all with permalinks and timestamps. A visual rerun on July 26 returned 46 Feed items and 4 Reels; all 50 visuals were normalized and read through local French/English OCR, adding 11 date, 3 time, 1 price, and 3 possible venue-name findings beyond the captions. Temporary images are deleted after OCR, venue matches still require confirmation, and publication remains unauthorized. The generated system-user token remains invalid for this path because it returned `API access blocked` for every target. This connector must never be pointed at handles outside the DATA-0002 registry without updating the registry first.

The July 26 venue-evidence follow-up also exercised an automated second-source check. It queried 25 recent signals from `placebell` and 25 from `centrebell`, then required both a shared calendar date and a shared distinctive event term before confirming a candidate. There were no API errors, but none of the three OCR-derived venue candidates met both conditions. All three therefore remain in review and publication remains unauthorized.

### Other researched options (not pursued further)

- **Bandsintown API**: partner-only access, requires a direct conversation with Bandsintown; not self-serve.
- **PredictHQ**: broad global events API (20M+ events, 30,000+ cities) with real Montréal coverage, but it's a paid commercial product; pricing was not published in what's publicly searchable and needs a direct quote.
- **Venue ICS calendars**: several venues in the DATA-0002 pilot (Newspeak, Théâtre Fairmount, and others) already expose a Google Calendar ICS link on their own event pages. A generic ICS connector was built (`createIcsCalendarConnector`) since this is zero-risk (venues publish these deliberately for calendar subscription) and reusable per venue once its specific ICS URL is confirmed.

## What was built (`packages/ingestion`)

A new workspace package normalizes source data into a `RawIngestedEvent` shape that is deliberately *not* a `PublicEvent`: connectors fetch and normalize what a source published; they do not assign an id, compute trust/freshness labels, or deduplicate. That mapping step depends on DATA-0001 (still Draft) and is separate future work.

- `createMontrealOpenDataConnector()` — fetches and parses the City's CSV, no credentials needed.
- `createTicketmasterConnector({ apiKey })` — Discovery API v2, paginated, needs `TICKETMASTER_API_KEY`.
- `createIcsCalendarConnector({ icsUrl, ... })` — generic per-venue ICS feed reader (no RRULE/recurrence support).
- `fetchInstagramScoutSignals(targets, ...)` — Graph API v25 Business Discovery signals for a fixed watchlist, preserving the Feed/Reel product distinction; output is raw signals for review, not events.
- `extractInstagramWatchlist(csvText)` — reads the DATA-0002 registry to produce the fixed handle list, so the watchlist boundary is enforced by code, not just convention.
- `triageInstagramScoutItem(item)` — conservative, deterministic first-pass classification into likely event, uncertain, or likely non-event, with explicit reasons, extracted date mentions, review priority, and no publication authority.
- `extractInstagramScoutFacts(item, triage)` — extracts only caption-visible facts into a low-confidence working title, raw dates, times, prices, account mentions, ticketing signal, source-account provenance, missing-fact list, and evidence-completeness score. It does not infer a year or confirm a venue.
- `instagram:scout:visual` — separate supervised pilot command that reads Meta-provided images and Reel thumbnails through local OCR, deletes temporary media, records visual evidence separately from captions, and measures evidence gains without authorizing publication.
- `instagram:scout:crosscheck` — reads the latest visual report, queries only official venue accounts already present in DATA-0002, and confirms a venue candidate only when an official post shares both its date and a distinctive event term. Unmatched candidates remain in review and the output never authorizes publication.
- `instagram:scout:review` — generates a local, static operator review page from the latest Scout report. It shows only the unresolved evidence, stores draft decisions in browser-local storage, and exports a JSON audit artifact with `publicationAuthorized: false`; it does not expose an API or write to public events.
- `instagram:scout -- --all --media-limit 3` — expands a controlled run to every Instagram handle present in DATA-0002 while retaining a per-account media cap. The first run resolved 248 usable handles from 264 registry rows (rows without a handle are not queried), reached 125 accounts, recorded 123 `Invalid user id` failures without aborting, and collected 365 recent media signals. Caption triage produced 79 likely events, 283 uncertain items, and 3 likely non-events. These are leads, not 365 publishable events.
- The local review page now selects the latest Scout report, not only a crosschecked subset. Its current queue exposes all 283 uncertain items from the expanded run. When post-OCR visual analysis exists, that later classification takes precedence over caption-only triage.
- `instagram:scout:import-verified-pilot` — imports only the first explicitly human-accepted and independently corroborated pilot: one Trivium occurrence and ten Disney on Ice performances at Place Bell. Ticketmaster supplies the verified occurrence date/time and redirect; the originating `@evenko` post remains an additional source. The command is idempotent through deterministic event IDs.
- `instagram:scout:apply-decisions -- --decisions <file>` — reconciles an exported operator-decision artifact with the latest evidence report and applies the Montréal MVP boundary before any mapping stage. Its first real run retained two accepted Place Bell events as `blocked_outside_mvp`, excluded one aggregate poster, wrote no database records, and preserved `publicationAuthorized: false`.
- `prepareInstagramScoutMappingDraft(...)` — converts only a reconciliation already marked `ready_for_mapping` plus separately validated event and venue facts into the common `RawIngestedEvent` shape. Missing/invalid time, address, or coordinates block the draft; this function never writes to the database and never grants publication authority.
- `instagram:scout:link-venues` — compares fixed-location Instagram sources with the geocoded Pulso venue catalogue using exact normalized names only. The current database run linked 51 of 177 eligible accounts across 486 known venues, produced no ambiguous match, left 126 unmatched for later research, and performed no event write or publication. The newly verified pair `Rouge Gorge — @rougegorge_mtl` is included.
- `evaluateInstagramScoutGeographicEligibility(...)` — preserves Montréal eligibility and accepts other verified venues within a maximum radius of 30 km from Pulso's Montréal map centre (`-73.5673, 45.5017`). The earlier monthly-density rule has been removed; distance is calculated from the venue's verified coordinates.

## Verification

Unit tests (`src/index.test.ts`, including regression coverage for the `(0, 0)` coordinate case and Graph API v25 Feed/Reel mapping) cover the pure mapping/parsing functions with representative fixtures, run via the root `pnpm test` — 146 tests pass repository-wide. `packages/ingestion` does not define its own `test` script; it relies on the root Vitest config like every other package, for consistency.

The Ticketmaster connector has additionally been run live against the real API with a valid key, confirming 200 Montréal events fetched successfully (see the data quality finding above). The Instagram Scout connector has also completed its first five-source run: `new-city-gas`, `mtelus`, `club-soda`, `newspeak`, and `evenko` each returned 10 signals, for 50 review items total (45 Feed, 5 Reels), with complete permalinks and source timestamps and no target errors. The Montréal open-data connector has not yet been run live.

The first automated triage of those 50 Instagram signals produced 16 likely-event recommendations, 33 uncertain items, and 1 likely non-event. Twelve captions contained an explicit date mention. The engine left 49 items requiring manual review and placed only the clear non-event into low-priority audit, so this is currently a prioritization baseline rather than an autonomous acceptance system.

Structured caption extraction produced 50 low-confidence working titles, 12 date mentions, 11 time mentions, 3 price mentions, and 15 ticketing signals. Within the 16 likely-event recommendations, 9 had a date, 8 had a time, and 11 had a ticketing signal. Venue confirmation remained missing for all 16, intentionally: the posting account can be a venue, promoter, or organizer and is not sufficient evidence of event location.

The visual-evidence rerun successfully read all 50 available visuals. It added 11 date findings, 3 time findings, 1 price finding, and 3 possible venue-name matches beyond caption-only evidence; six previously uncertain signals became likely-event recommendations. The possible venue matches (two Place Bell, one Centre Bell) remain review candidates, not confirmed locations.

The first live official-account crosscheck inspected 50 additional signals (25 from `placebell`, 25 from `centrebell`) without target errors. Zero of the three candidates shared both a date and a distinctive event term with those recent official posts. The outcome was therefore 0 confirmed and 3 unmatched, demonstrating the intended fail-closed behavior rather than forcing a venue confirmation from a name match.

## RawIngestedEvent → PublicEvent mapping

`packages/ingestion/src/mapping/` implements the pipeline stage previously flagged as not designed: turning normalized `RawIngestedEvent` records into real `PublicEvent` objects (`mapRawEventToPublicEvent`, `mapAndDeduplicateRawEvents`). It is deliberately conservative because DATA-0001's trust model is still Draft, and it is a proposal for review, not an Accepted production pipeline:

- **Id assignment**: a deterministic id is derived by hashing a stable dedupe key (normalized title, venue, minute-precision start time, organizer - the DATA-0001 minimum dedup signal set), formatted as a syntactically valid UUID. The same real event produces the same id across separate runs without a database round-trip. This is a placeholder identity strategy; the authoritative id and dedupe strategy belong to the eventual events table once one exists.
- **Category scope guard**: events whose category could not be confidently mapped (`'unmapped'`) are excluded rather than guessed into `'other'`. This matters concretely for the Montréal open-data connector: accepting every unmapped civic category (workshops, markets) would silently pull events outside MVP-0001's festive/musical/nightlife scope.
- **Missing-point guard**: events with no resolved point (`pointResolution` of `'unresolved'` or `'needs_research'`, or simply no point) are excluded rather than given a fabricated coordinate. This surfaces a real contract gap: `PublicEvent.venue.point` is a required field with no "location unknown, don't show on map" representation today, so Pulso currently can only hide such events, not display them with an honest uncertainty warning as UX-0001's state matrix otherwise expects for uncertain data. Deciding how (or whether) to surface excluded events is a separate product decision, not something this mapper should invent.
- **Trust label**: `'confirmed'` for known official sources (currently just the Montréal open-data connector), `'probable'` for reputable single third-party platforms (currently Ticketmaster), `'to_verify'` for anything else. This is a first proposal, not a validated threshold set - DATA-0001 explicitly leaves exact trust criteria to the future PRD.
- **Freshness**: a placeholder 24-hour threshold (`observedAt` vs. now) distinguishes `'fresh'` from `'stale'`. Explicitly a placeholder pending PRD-0001's freshness policy, not a decision.
- **Location confidence**: `'confirmed'` when the point came from the source directly or was successfully geocoded from a known address; `'uncertain'` otherwise.
- **Deduplication**: events sharing a dedupe key are merged; the highest-authority source becomes the contract's single `source` field, and other sources are preserved as `additionalSources` on the wrapper result rather than discarded. This exposes a real contract limitation: `PublicEvent.source` only supports one source object, while DATA-0001 explicitly allows an event to carry multiple sources. Full multi-source traceability requires a `@pulso/contracts` schema change - tracked as an open item below, not solved by this mapper.

## Open items

- Ticketmaster free-tier rate limits are confirmed (5000/day, 5 req/s); re-verify before scheduling production polling frequency if approaching that volume.
- Decide Shotgun's path: partner outreach, or an explicit scraping-risk decision after ToS review.
- Run a supervised Pulso Scout pilot against a small, explicitly selected subset of the DATA-0002 registry before expanding coverage.
- Decide the durable production credential strategy. The extended user token is validated for the supervised pilot; the generated system-user token is not.
- Complete Meta App Review and Business Verification before attempting full-registry or production-scale access.
- Define polling cadence, review thresholds, and system-token rotation before the current 60-day credential expires.
- Confirm per-venue ICS URLs beyond the ones already observed in the DATA-0002 pilot notes.
- A first `RawIngestedEvent` → `PublicEvent` mapping proposal now exists (above); it needs product review against DATA-0001 once that document is closer to Accepted, not just engineering review.
- `PublicEvent.venue.point` has no representation for "no usable location" - events failing the missing-point guard are currently just excluded. Decide whether/how Pulso should surface an uncertain-location event at all.
- `PublicEvent.source` supports only one source; extending the contract (or a separate multi-source table) is required for genuine multi-source traceability instead of the current "best source wins, rest kept out-of-contract" compromise.
- Trust-label and freshness-threshold values in the mapper are first-draft placeholders and must be revisited once PRD-0001 defines actual thresholds.
