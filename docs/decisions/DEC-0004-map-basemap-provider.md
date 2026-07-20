# DEC-0004 — Map Basemap Provider

**Identifier:** DEC-0004
**Version:** 0.2
**Status:** Draft
**Dependencies:** PRD-0001, RFC-0001, DEC-0002, UI-0001

## Context

MapLibre is a renderer. The previous local style contained only a dark background layer and no tile source, so it could render markers but could not render streets, labels, water, parks, or other geography. Event coordinates and PostGIS bounded queries were unaffected.

## Development candidate and visual direction

OpenFreeMap Liberty at `https://tiles.openfreemap.org/styles/liberty` successfully proves that real Montréal geography can render through MapLibre. It is a development basemap candidate only. Its light visual appearance is not accepted as Pulso's final map design.

The production map must use a genuine MapLibre-compatible dark style aligned with UI-0001. It must not be implemented by applying a CSS filter to the map canvas. The future style must preserve:

- road and neighbourhood readability;
- water, parks, and geographic boundaries;
- sufficient label contrast;
- visible event markers;
- accessible controls; and
- required geographic attribution.

The logo gradient must not become a general geographic or trust scale. Style customization must remain provider-neutral where practical, so a future provider can be substituted without changing product contracts. The public environment variables (`NEXT_PUBLIC_MAP_STYLE_URL` and `EXPO_PUBLIC_MAP_STYLE_URL`) support this boundary; they do not select a production provider.

## Open production questions

No production provider is approved. Exact dark-style colors, layer rules, provider hosting, and caching remain Draft questions. Reliability, availability, SLA, privacy, Canadian and Montréal data quality, costs, self-hosting, and fallback strategy require separate product and technical review.

## Checkpoint validation evidence

The reversible development spike has the following completed evidence:

- the web basemap visibly rendered real Montréal geography and six fictional event markers, with required attribution, in a fresh browser context;
- actual desktop Playwright passed 5/5 and actual Pixel 7 responsive Playwright passed 5/5;
- live PostGIS/API integration passed 12/12; and
- the full repository verification, including native MapLibre compilation/export, passed.

OpenFreeMap Liberty remains development-only. This evidence neither approves a production provider nor approves a final visual style.

## Deferred Android visible-validation evidence

Visible Android basemap validation is deferred. `com.android.systemui` produced ANRs on two local AVDs, preventing a reliable visible-map review. No Pulso exception or MapLibre application failure was observed. The native MapLibre compilation/export remains successful.

This environmental exception does not block the reversible development checkpoint. It remains required evidence before DEC-0004 can become Accepted and before any production-provider approval.

## Acceptance gate

A dark-style visual spike, accessibility review, and deferred visible Android basemap validation are required before DEC-0004 can become Accepted. They must verify real geographic context, readable labels and controls, visible event markers, and required attribution without introducing a provider, routing, geocoding, or tracking decision.
