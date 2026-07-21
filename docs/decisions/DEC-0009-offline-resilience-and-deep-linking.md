# DEC-0009 — Offline Resilience and Deep Linking

**Identifier:** DEC-0009
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, UX-0001, RFC-0001

## Decision

Explore / Map keeps the last successfully loaded event result set in local storage (web `localStorage`, mobile `AsyncStorage`) and displays it immediately on the next load while a fresh request to the server is in flight (stale-while-revalidate). This improves perceived performance and resilience to transient network conditions. It is not an offline mode: the cached set is always superseded by the next successful server response, and existing freshness, trust, cancellation, and postponement disclosures continue to apply once server data returns.

A `?eventId=` URL parameter on the web Explore route opens Event Details directly for that event on load. This supports shareable and bookmarkable links to a specific event (including links produced by DEC-0008 sharing and the `/events/[id]` metadata route) without introducing a new primary screen: it resolves to the existing Event Details presentation defined in UX-0001.

## Rationale

Formalizes already-implemented resilience and linking behavior so it is traceable in the documentation set rather than existing only in application code.

## Boundaries

- The local cache holds only the event list already fetched for MVP browsing; it is not a general offline data store, does not cache account data, favorites merge state, or ticket information, and is not a substitute for DATA-0001 freshness rules.
- The cache is cleared or superseded on the next successful load; it must not be presented as current data without the same trust/freshness treatment as a live result.
- Deep linking opens only Event Details for a known event ID; it does not bypass account boundaries, external-redirect rules, or introduce a new destination.
- No service worker, background sync, or guaranteed offline availability is authorized by this decision.

## Non-goals

Does not authorize a native offline mode, ticket storage, background data sync, push notifications, or any account-linked history of viewed or shared links.
