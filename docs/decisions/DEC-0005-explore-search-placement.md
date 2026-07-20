# DEC-0005 — Explore Search Placement

**Identifier:** DEC-0005
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, UJ-0002, UX-0001, PRD-0001, UI-0001

## Decision

Intelligent search remains optional and complementary. It remains part of Explore / Map, and manual filters remain permanently available.

The primary intelligent-search entry is a persistent search field integrated at the top of the Explore interface. The current detached or floating **« Recherche intelligente »** button is not the target presentation. The field must appear visually connected to the map and the main application frame.

- On desktop, it uses the available horizontal header or top-map space.
- On mobile, it becomes a compact full-width field within the safe top area.
- Focusing or activating it opens the existing intelligent-search interaction without navigating to a separate catalogue or primary screen.

Existing deterministic interpretation, explanations, alternatives, clarification, and no-reliable-result behavior remain unchanged. Search-derived and manual-filter behavior remains unchanged. Search, filters, preview, Event Details, and map context must remain preserved.

The field supports French and English. It must have an accessible label, keyboard support, visible focus, and a suitable touch size. It must not materially obscure map geography or controls. No account or AI provider is required.

## Rationale

The placement makes the optional natural-language entry discoverable while preserving Explore / Map as the map-first primary experience. It implements the Accepted requirement that the intelligent-search bar remain visible but non-obligatory, without creating a parallel catalogue or reducing access to manual filters.

## Reference-board boundary

The supplied dashboard image is non-binding visual inspiration only for:

- the integrated top search-field placement; and
- the visual relationship between the dark interface and map.

It does not approve list or calendar primary navigation, community features, social profiles, event imagery, generalized recommendation cards, native booking, an account requirement, routing or itinerary, additional filters not already Accepted, or any other Roadmap or Vision feature.

## Consequences and exclusions

This decision changes presentation only. It does not change deterministic search semantics, manual-filter semantics, product screens, data sources, account behavior, external-redirect boundaries, or the bilingual MVP policy.

It does not authorize a separate AI catalogue, mandatory chat flow, external AI provider, personalization, or visual features beyond the specified placement.
