# UX-0001 — MVP Screens and Flows

**Identifier:** UX-0001
**Version:** 1.2
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0014, UJ-0001, UJ-0002, DATA-0001

## Purpose

Translate the Accepted product decisions and User Journeys into the smallest coherent set of MVP screens, overlays, components, states, and transitions required for the responsive website and mobile application.

This document defines functional UX structure, not visual branding, high-fidelity design, technical architecture, or implementation choices. DATA-0001 is a Draft dependency: its product-level requirements inform this document, while its proposed labels, thresholds, and ingestion details remain subject to PRD and RFC validation.

## Validation note

The six-screen MVP structure is approved. Filters, intelligent search, event previews, explanations, and system feedback remain overlays or states rather than additional primary screens. DEC-0014 adds Lieux and Venue Details without displacing Explore / Map as the primary experience. Prototype usability testing may refine presentation and copy but must not change the Accepted MVP scope without a new documented decision.

## 1. Information architecture

### Minimum product structure

Pulso has six primary screens:

1. **Explore / Map** — default entry and center of the product.
2. **Event Details** — complete view of one event selected from the map.
3. **Lieux** — list of venues with qualifying programming in the fourteen-day venue window.
4. **Venue Details** — enlarged sheet with venue information and its scheduled events.
5. **Favorites** — saved events on the current device, with optional authenticated synchronization.
6. **Authentication** — contextual account creation or sign-in when an account-dependent action is chosen.

The Explore / Map screen owns these supporting overlays, components, and states:

- traditional filters;
- optional intelligent-search entry and query state;
- event preview;
- result explanations;
- loading, empty, error, stale-data, and uncertain-data feedback.

Filters and intelligent search are not separate catalogues or mandatory steps. They operate on the same event base, update the same map, and remain mutually accessible.

### Primary navigation relationships

- Product entry → Explore / Map.
- Explore / Map marker → Event Preview → Event Details.
- Explore / Map venue marker → Venue Details → Event Details when programming exists.
- Lieux → Venue Details → Event Details.
- Explore / Map intelligent-search entry → query state → results on Explore / Map.
- Explore / Map filter control → filter overlay → filtered Explore / Map.
- Favorite action → saved local state without authentication.
- Voluntary account creation or connection → merge local and account favorites, then return to the preserved context.
- Favorites → Event Details → return to Favorites or Explore / Map.
- External ticketing or event-source action → clearly identified external destination.

No account gate may precede Explore / Map, filters, intelligent search, event previews, or Event Details.

## 2. MVP screen inventory

| Screen | Purpose | Required elements | Account requirement |
| --- | --- | --- | --- |
| Explore / Map | Discover Montréal events through the primary map experience | Montréal map, event markers, previews, filters, optional intelligent search, data and system states | None |
| Event Details | Support an informed event choice | Event information, source, freshness or confidence, status, external action, favorite action | None |
| Lieux | Browse venues that have qualifying programming within fourteen Montréal calendar dates | Searchable venue cards, address, type, event count, empty and error states | None |
| Venue Details | Understand a venue and inspect its near-term programming | Enlarged hero, factual summary, address, Aujourd'hui block, fourteen-day block, Event Details links | None |
| Favorites | Reopen and remove saved events | Local or authenticated saved-event collection, event status and essential information, removal action, empty state | None for local favorites |
| Authentication | Enable a voluntarily chosen account connection | Account creation or sign-in, local-favorite merge context, cancellation back to prior screen | Required only after the user chooses account connection or cross-device synchronization |

Filters, intelligent search, event previews, trust notices, and system feedback are overlays or states of these screens. They do not create additional MVP destinations.

## 3. Explore / Map

### Initial Montréal state

- Explore / Map opens directly without a questionnaire, account prompt, or intelligent-search requirement.
- The initial map presents Montréal and the qualifying scheduled MVP events available in the current result set.
- The initial time range, geographic framing, and marker density rules must be finalized in PRD-0001.
- Qualifying events remain the primary map content. Verified recurring nightlife and cultural venues may also remain visible as orientation markers without current programming under DEC-0014; they do not enter the Lieux list until they have an eligible event.

### Lieux and Venue Details

- Lieux contains only venues with at least one qualifying event from today through the end of the fourteenth Montréal calendar date.
- Selecting a venue opens an enlarged sheet without requiring an account.
- The sheet prioritizes identity, concise factual description, address, today's events, then later events in the fourteen-day window.
- A verified map-only venue may open the same sheet with an explicit no-programming state.
- Missing descriptive or practical information remains unavailable rather than inferred.

### Event markers and map movement

- Each event with usable geographic coordinates can be represented by a marker.
- Dense markers may be grouped to preserve map readability; the grouping behavior and thresholds require prototype and PRD validation.
- Moving or zooming the map updates the geographic area used for the visible event result set.
- Active filters and interpreted intelligent-search criteria remain applied when the map moves or zooms until the user changes or clears them.
- An event without exploitable geographic coordinates must not be presented as correctly positioned.

### Event preview

Selecting a marker opens a preview within the map experience. At minimum, the preview exposes:

- event name;
- date and start time;
- venue;
- price or free status when known;
- category;
- visible warning when critical information is stale, uncertain, cancelled, or postponed;
- action to open Event Details.

The preview does not replace Event Details and must not hide material trust or event-status warnings.

### Map controls

- Filters remain directly accessible before and after intelligent search.
- The intelligent-search entry remains visible and optional.
- Manual map movement, zoom, marker selection, filters, and Event Details remain usable without intelligent search.
- The exact control placement and overlay presentation differ responsively but preserve the same functions.

### Explore states

- **Loading:** keep the map context visible when available and indicate that events are loading.
- **Empty:** explain that no qualifying events match the current area and criteria; allow criteria to be changed or cleared without leaving the map.
- **Error:** distinguish inability to load event results from a valid empty result and provide a retry action.
- **Stale data:** show freshness information or a clear warning without presenting stale information as current.
- **Uncertain data:** disclose uncertainty before the user relies on the affected information.
- **Partial data:** show known information, label missing fields, and avoid unsupported assumptions.

### Behavior without an account

A signed-out user can open Explore / Map, move and zoom the map, use filters, use intelligent search, inspect previews, open Event Details, follow an external link, and add, remove, or consult local favorites. Authentication appears only if the user voluntarily chooses to create or connect an account for cross-device synchronization, in accordance with DEC-0007.

## 4. Filters

### Functional experience

Filters operate within Explore / Map and update the events displayed on that same map. Users can inspect, apply, change, and clear filters without an account.

The required filter families are limited to MVP event information already present in DATA-0001 or the Accepted journeys:

- date and time;
- event category;
- price or free status;
- geographic area or distance;
- event availability or status where relevant to active discovery.

The final category values, time presets, price bands, distance controls, and treatment of event statuses require PRD-0001 validation. No additional taxonomy is established here.

### Relationship with intelligent search

- Filters remain visible and modifiable before a natural-language query.
- Criteria interpreted from a query must be represented in a form the user can understand and manually adjust.
- Manual filter changes update the same result set after intelligent search.
- Clearing intelligent-search criteria must not remove unrelated manual filters without making that effect explicit.
- The final rules for combining, replacing, and clearing query-derived and manually selected criteria require PRD-0001 validation.

## 5. Intelligent search

### Optional map interaction

Intelligent search is an optional entry within Explore / Map. It does not create a separate AI catalogue, mandatory conversation, or independent event details experience.

### Query flow

1. The user chooses the visible query entry and enters a natural-language request.
2. Pulso displays a processing state while preserving the map and access to manual controls.
3. Pulso identifies explicit criteria without presenting unexpressed preferences as certain.
4. Results appear on the same map and remain filterable.
5. Matching events include concrete explanations based on known event information and the expressed request.

### Result conditions

- **Exact matches:** identify events that satisfy the interpreted criteria.
- **Alternatives:** distinguish near matches from exact matches and explain the relevant difference.
- **No reliable result:** state that no reliable matching event is available; do not fabricate an event or conceal uncertainty.
- **Incomplete request:** return a useful first result set when possible; ask a follow-up question only when it materially changes result quality.

### Explanations

Explanations may use known category, distance, start time, price, availability, or correspondence with query terms. They must be concrete, readable, and based on available data. The final explanation format and ranking rules require PRD-0001 validation.

### Transition to manual filters

Interpreted criteria are exposed so the user can modify them with manual filters. The map, filters, previews, Event Details, trust information, and external links remain the same as in free exploration.

## 6. Event Details

### Minimum information hierarchy

Event Details presents, in functional priority:

1. event identity and current event status;
2. date and start time, plus end time when known;
3. venue and address;
4. price or free status and currency when applicable;
5. category;
6. short description;
7. organizer when known;
8. source and date of last verification;
9. freshness or confidence information, including uncertainty disclosure;
10. cancellation or postponement information when applicable;
11. clearly labelled external ticketing or event-source action;
12. favorite action.

An image may be shown only when it can be used. Missing optional information remains visibly unknown rather than inferred.

### Trust and event status

- Stale or uncertain critical information is disclosed before the external action.
- Cancelled or postponed status is prominent and cannot be presented as an ordinary active event.
- Source and last-verification information remain accessible.
- The final confidence labels, thresholds, visual priority, and freshness policy require PRD-0001 validation because DATA-0001 remains Draft.

### External action

- The action names or otherwise clearly identifies the external ticketing service or event source before departure from Pulso.
- One action from Pulso opens that external destination when available.
- An affiliate link may be used when available; lack of an affiliate programme must not block a standard external redirect.
- Pulso performs no native booking, native payment, or ticket storage.
- Pulso provides no native routing, navigation, transportation, or itinerary functionality.
- If the destination is unavailable, Pulso keeps the user on Event Details and explains that the external destination cannot currently be opened.

## 7. Account and favorites

### Browsing and authentication boundary

- Browsing, filtering, intelligent search, previews, Event Details, external redirects, and local favorite actions require no account.
- Authentication begins only when a user voluntarily chooses account creation or connection for cross-device synchronization.
- The authentication experience states that local favorites will be merged by stable event ID, allows cancellation back to the prior context, and must not delete local favorites.

### Account connection and favorite continuity

1. A signed-out user adds, removes, or consults favorites locally without interruption.
2. If the user voluntarily chooses account creation or connection, Pulso retains the local favorite collection and the current screen context.
3. After successful connection, Pulso merges local and account favorites as a union by stable event ID, without duplicates or silent deletions, then returns to the preserved context.
4. If authentication is cancelled or fails, local favorites and the prior browsing context remain available.

The exact account creation, sign-in, session, failure, recovery, provider, and merge presentation rules require a future authentication implementation task. DEC-0007 supersedes the prior account-only favorite rule.

### Favorites screen

- Displays the current device's local saved events and, after authentication, the merged account collection.
- Provides enough event identity, date, venue, and current status to distinguish saved events.
- Opens the same Event Details screen used from Explore / Map.
- Allows removal of a favorite.
- Provides an empty state when no favorites have been saved.
- Preserves cancellation, postponement, stale-data, and uncertainty notices for affected saved events.

### Signed-out behavior

A signed-out user can access and manage local Favorites without authentication. Authentication remains optional for a later account connection and cross-device synchronization; it does not block any account-free product function.

Profiles, social features, account-derived recommendations, stored preferences, and ticket storage are outside the MVP.

## 8. Responsive behavior

All surfaces use the same product rules, event data, trust information, filters, search behavior, favorites, and external actions. Differences are limited to functional presentation appropriate to available space.

No application-only product capability is approved for the MVP. The mobile application therefore has the same functional behavior as responsive mobile web; only its surface-specific presentation conventions may differ and must be finalized without changing product scope.

| Primary surface | Responsive desktop web | Responsive mobile web | Mobile application |
| --- | --- | --- | --- |
| Explore / Map | Map remains primary; controls, previews, and result context may coexist in the wider viewport | Map remains primary; controls and previews use compact overlays without replacing map access | Same mobile map behavior and product rules as mobile web |
| Filters and intelligent search | May remain visible alongside more map area or open as an overlay | Open in compact overlays and return directly to the same map state | Same functional overlay behavior as mobile web |
| Event Details | May use available width while preserving return to map context | Uses a focused mobile layout with a direct return to the prior map state | Same information hierarchy and return behavior as mobile web |
| Favorites | Uses available width for the saved-event collection | Uses a compact saved-event collection | Same favorites rules and event states as mobile web |
| Authentication | Contextual authentication retains the interrupted action | Contextual authentication retains the interrupted action and prior screen | Same account boundary and return behavior as mobile web |

Exact layouts, breakpoints, gestures, and platform-native presentation conventions are not selected in this document.

## 9. End-to-end flows

### UJ-0001 — Free exploration

1. Entry → Explore / Map loading state.
2. Loading success → initial Montréal map with visible event markers.
3. User moves or zooms map and/or opens Filters.
4. Updated Explore / Map → user selects marker.
5. Event Preview → user opens Event Details.
6. Event Details → address, known access information, trust state, and external destination are visible.
7. User may open the clearly identified external link without an account.

### UJ-0002 — Intelligent search

1. Entry → Explore / Map with map, filters, and optional intelligent-search entry.
2. Query entry → user submits natural-language criteria.
3. Query processing → map and manual controls remain available.
4. Results → exact matches and clearly distinguished alternatives appear on the same map.
5. User inspects explanations and may change manual filters.
6. Event Preview → Event Details.
7. Event Details → verified information and clearly identified external link, without an account requirement.

### Save a favorite while signed out

1. Event Details → user chooses favorite.
2. Pulso saves the stable event ID locally and shows the saved state without authentication.
3. The event appears in Favorites on the current browser or device.
4. If the user later chooses account connection, Pulso merges local and account favorites without duplicate or silent deletion.

### Open an external ticketing link

1. Event Details → user sees the destination identity.
2. User activates the external action.
3. Pulso opens the external ticketing or event-source destination in one action.
4. No booking, payment, or ticket storage occurs in Pulso.
5. If the destination is unavailable, remain on Event Details and show the unavailable state.

### Cancelled, postponed, stale, or uncertain event

1. Explore / Map marker or Favorites entry indicates the relevant warning where the affected event appears.
2. Event Preview preserves the warning before selection.
3. Event Details gives the status or trust warning prominence and shows known source and verification information.
4. External action is shown only with its current known destination and status; uncertainty is not concealed.
5. The user returns to the prior map or Favorites context without being forced into authentication.

## 10. State matrix

| State | Explore / Map | Event Details | Favorites / Authentication | Required recovery or transition |
| --- | --- | --- | --- | --- |
| Loading | Show map context when available and event-loading feedback | Show details-loading feedback | Show collection or authentication loading feedback | Resolve to success, empty, partial, or error |
| Success | Show qualifying markers and active criteria | Show known event information and actions | Show saved events or completed authentication | Continue normal flow |
| Empty | No events match area and criteria | Not applicable as a normal loaded event | No saved events | Change or clear criteria; return to Explore from empty Favorites |
| Partial data | Show event without inventing missing information | Label unavailable fields | Preserve known saved-event information | Continue with disclosed limits |
| Stale data | Mark affected event | Show freshness and last-verification warning | Preserve warning on saved event | Allow informed continuation; PRD defines thresholds |
| Uncertain data | Mark affected event | Disclose uncertain fields and confidence | Preserve warning on saved event | Do not present uncertain facts as confirmed |
| Cancelled | Clearly distinguish affected event | Prominent cancelled status | Preserve cancelled status | Do not present as an ordinary active event |
| Postponed | Clearly distinguish affected event | Prominent postponed status and known updated information | Preserve postponed status | Do not present old schedule as current |
| External destination unavailable | Event remains explorable | Explain that the identified external destination cannot be opened | Not applicable | Remain in Pulso; no native booking fallback |
| Optional account connection for synchronization | Map and event remain viewable | Retain event and local-favorite context | Present contextual Authentication only when chosen | Merge by stable event ID after success; keep local favorites after cancel or failure |

The precise visual treatment, copy, thresholds, and whether affected events remain in active map results require PRD-0001 validation.

## 11. MVP exclusions

UX-0001 excludes:

- native reservation, checkout, or payment;
- storage of event tickets, concert tickets, transport tickets, or other titles;
- ticket wallet;
- native routing, navigation, transportation planning, or itinerary functionality;
- digital identity;
- proof or certification of age;
- launch in or switching between multiple cities;
- general directories of restaurants, retail, accommodation, or businesses outside DEC-0014's verified recurring nightlife and cultural venue exception;
- mandatory account creation for browsing, filtering, searching, or opening Event Details;
- mandatory chat or intelligent search;
- a separate AI event catalogue;
- opaque recommendations;
- profiles, social features, stored preferences, or account-history personalization;
- high-fidelity visual design or branding decisions;
- production ingestion administration or a manual-correction interface not separately approved.

Roadmap and Vision items must not influence the MVP screen structure or create anticipatory complexity.

## 12. PRD inputs

### Fully determined by Accepted documents

- Montréal is the only MVP city.
- Explore / Map is the primary entry and free exploration is the primary experience.
- Filters are always available and are not replaced by intelligent search.
- Intelligent search is optional, uses the same map and event catalogue, and explains matches.
- Event browsing, filters, search, previews, and Event Details work without an account.
- Accounts are optional; Favorites work locally without an account, while a later account connection imports and merges them for cross-device synchronization under DEC-0007.
- Responsive web and mobile application expose the same product, rules, and data.
- Event Details exposes essential event, source, trust, and external destination information.
- Booking is an external redirect only, with affiliate links when available.
- Native booking, payment, ticket storage, routing, itinerary, general business directories beyond DEC-0014, multiple cities, and identity features are excluded.
- Accepted UJ-0001 and UJ-0002 define the target exploration and intelligent-search sequences.

### Details PRD-0001 must finalize

- initial Montréal geographic framing and default event time range;
- marker grouping behavior and density thresholds;
- final event category taxonomy;
- final values and controls for date/time, price, geography/distance, and event-status filters;
- rules for combining, replacing, displaying, and clearing query-derived and manual filter criteria;
- intelligent-search interpretation, ranking, explanation format, and follow-up-question rules;
- exact behavior and copy for exact matches, alternatives, and no reliable result;
- Event Preview field priority and responsive presentation;
- final confidence labels, thresholds, and disclosure treatment;
- freshness policy, stale thresholds, and display treatment;
- display and active-result treatment for cancelled, postponed, uncertain, stale, and partially populated events;
- external destination labelling and unavailable-destination behavior;
- authentication methods, session behavior, errors, cancellation, recovery, and interrupted-action completion;
- Favorites ordering, saved-event presentation, and empty-state behavior;
- responsive layout rules, breakpoints, overlays, and platform presentation differences;
- loading, empty, partial, and error copy and recovery behavior;
- measurable usability acceptance criteria for the under-60-second journeys.

### Genuine blockers

No unresolved product decision blocks drafting PRD-0001 after this UX draft is reviewed. PRD-0001 must resolve the open details above before implementation can be specified as approved.

DATA-0001's pre-ingestion research remains a blocker for production ingestion implementation and relevant RFC decisions, but not for the first PRD draft. Implementation remains prohibited until PRD-0001 and RFC-0001 are both approved.
