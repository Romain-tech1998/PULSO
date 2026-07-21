# DATA-0003 — Ingestion API Landscape

**Identifier:** DATA-0003
**Version:** 0.1
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

Public, well-documented API at `developer.ticketmaster.com`. Free registration issues a Consumer Key used as the `apikey` query parameter. Covers concerts, comedy, and other ticketed events, including many Montréal venues. Free-tier rate limits apply (verify current limits in the developer portal before relying on this for production volume; they change over time).

**Status:** connector implemented (`createTicketmasterConnector`), requires `TICKETMASTER_API_KEY` to run — no key was available in this session.

### Shotgun

No public/self-serve developer API was found. Shotgun's documented API access is organizer-side (an Organizer ID and API token an event organizer generates to export their *own* events to another tool), not a public search/discovery API a third party can query for arbitrary Montréal events. Using Shotgun data without either an organizer partnership or a documented public endpoint would mean scraping their site, which requires a Terms of Service review before any implementation.

**Status:** not implemented. Requires either a partner/API conversation with Shotgun directly, or an explicit decision to accept scraping risk after ToS review — this is a decision for Romain, not something to build unilaterally.

### Eventbrite

Eventbrite permanently removed public event-search API access in February 2020. The remaining API only returns events you already know the ID of, or events belonging to a venue/organization you control. There is no way to discover unknown Montréal events on Eventbrite through their API as a third party, short of applying to their distribution partner program.

**Status:** not implemented; not a viable discovery source without a distribution-partner agreement.

### Facebook/Instagram (Meta)

Meta's Graph API for Page-level content (posts, and by extension venue-run event pages) requires the **Page Public Content Access** feature, which requires Meta App Review — a multi-week process with production access starting at zero and requiring renewal. There is no general "search all public Facebook events" API available to ordinary third-party apps; the closest thing (Meta Content Library API) is a research-access product with its own separate approval process, not a casual integration path.

Instagram's **Business Discovery** endpoint (Graph API) is different and directly useful for Pulso Scout (DEC-0006): from an app with your *own* linked Instagram Business/Creator account, it can read public profile metadata and recent media of *other* named public Business/Creator accounts by username. This matches DEC-0006's model exactly — a fixed, known watchlist (the handles already in `docs/data/research/montreal-source-registry.csv`), not open-ended scraping. Development-mode access works for a small number of test accounts; checking the full registry at production scale requires Meta App Review (Business Verification).

**Status:** connector implemented (`fetchInstagramScoutSignals`) against the documented Business Discovery endpoint, returning raw post signals (caption, media type, permalink, timestamp) for human review — not structured events. It requires your own Meta app, linked Instagram professional account, and an access token; none of that was available in this session. This connector must never be pointed at handles outside the DATA-0002 registry without updating the registry first.

### Other researched options (not pursued further)

- **Bandsintown API**: partner-only access, requires a direct conversation with Bandsintown; not self-serve.
- **PredictHQ**: broad global events API (20M+ events, 30,000+ cities) with real Montréal coverage, but it's a paid commercial product; pricing was not published in what's publicly searchable and needs a direct quote.
- **Venue ICS calendars**: several venues in the DATA-0002 pilot (Newspeak, Théâtre Fairmount, and others) already expose a Google Calendar ICS link on their own event pages. A generic ICS connector was built (`createIcsCalendarConnector`) since this is zero-risk (venues publish these deliberately for calendar subscription) and reusable per venue once its specific ICS URL is confirmed.

## What was built (`packages/ingestion`)

A new workspace package normalizes source data into a `RawIngestedEvent` shape that is deliberately *not* a `PublicEvent`: connectors fetch and normalize what a source published; they do not assign an id, compute trust/freshness labels, or deduplicate. That mapping step depends on DATA-0001 (still Draft) and is separate future work.

- `createMontrealOpenDataConnector()` — fetches and parses the City's CSV, no credentials needed.
- `createTicketmasterConnector({ apiKey })` — Discovery API v2, paginated, needs `TICKETMASTER_API_KEY`.
- `createIcsCalendarConnector({ icsUrl, ... })` — generic per-venue ICS feed reader (no RRULE/recurrence support).
- `fetchInstagramScoutSignals(targets, ...)` — Business Discovery signals for a fixed watchlist, needs a Meta app and linked account; output is raw signals for review, not events.
- `extractInstagramWatchlist(csvText)` — reads the DATA-0002 registry to produce the fixed handle list, so the watchlist boundary is enforced by code, not just convention.

## Verification

Unit tests (`src/index.test.ts`) cover the pure mapping/parsing functions (CSV parsing, Montréal open-data row mapping, Ticketmaster event mapping, ICS parsing, watchlist extraction) with representative fixtures. These were not executed in this session: the sandbox used for this research has no general outbound network access from its shell (only specific fetch/search tools), so the Montréal CSV endpoint and Ticketmaster API could not be hit live, and `pnpm`/`vitest` could not be run end-to-end here. Running `pnpm --filter @pulso/ingestion test` in a real development environment is required before treating this package as verified, per AGENTS.md.

## Open items

- Confirm current Ticketmaster free-tier rate limits before scheduling any production polling frequency.
- Decide Shotgun's path: partner outreach, or an explicit scraping-risk decision after ToS review.
- Obtain a Meta developer app, linked Instagram professional account, and access token to actually exercise the Instagram Scout connector; run it first against a small subset of the registry in Development mode before considering App Review.
- Confirm per-venue ICS URLs beyond the ones already observed in the DATA-0002 pilot notes.
- The mapping from `RawIngestedEvent` to `PublicEvent` (id assignment, trust/freshness computation, deduplication across sources) is not designed yet and depends on DATA-0001 reaching Accepted.
