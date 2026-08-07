# PRD-0001 — Pulso Montréal MVP

**Identifier:** PRD-0001
**Version:** 1.2
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0014, DATA-0001, UJ-0001, UJ-0002, UX-0001

## Purpose

Translate the complete Accepted product and UX baseline into an implementation-ready MVP product specification. DATA-0001 remains Draft: its product-level requirements apply here, while source-specific collection constraints, permissions, availability, and ingestion mechanisms remain unresolved.

## 1. Executive summary

Pulso is a map-first platform launching in Montréal. It aims to aggregate the largest practical number of correctly referenced festive, musical, nightlife, show, and comedy events into one geolocated directory. Anyone can explore the map, filter events, inspect details, and follow an external event or ticketing link without an account. Intelligent search is optional and complementary: it interprets a request, explains matches, and displays them on the same map. Pulso does not sell, book, pay for, route to, or store tickets in the MVP.

## 2. Problem statement

Information about Montréal events is fragmented across organizers, venues, ticketing services, social platforms, and other sources. A newcomer, visitor, or resident may struggle to see what is happening, compare relevant options, judge whether information is current, and reach the correct external destination quickly. Pulso addresses this with a trustworthy map directory that is useful before any query is entered. Intelligent search assists users who choose to describe a request; it does not replace free exploration, filters, or user control.

## 3. MVP goals

| Goal | MVP success indicator |
| --- | --- |
| Fast discovery | In prototype and product validation, users can identify or choose a relevant event within 60 seconds from opening Pulso. |
| Montréal coverage | Coverage is measured across the Accepted MVP event categories and eligible scheduled events in Montréal; no unsupported market-share target is asserted. |
| Trustworthy data | Visible events expose source, freshness, and uncertainty information; geolocation errors, duplicates, cancellations, and postponements are measured and reviewable. |
| Useful external access | Valid outbound actions reach the clearly identified external event or ticketing destination; failures are measured and explained. |
| Anonymous utility | Map exploration, filters, intelligent search, previews, Event Details, and external redirects complete without an account. |
| Optional favorites | A user can save, view, reopen, and remove local favorites without an account; a voluntarily connected account merges them for cross-device synchronization. |

Coverage, freshness, data quality, redirect success, and usability remain binding launch-measurement dimensions. Numeric launch gates must be established from a documented Montréal ingestion sample and usability-prototype baseline and approved before production launch. They do not block PRD acceptance, RFC-0001 drafting, or initial implementation.

## 4. Non-goals

The MVP excludes native booking or payment; ticket or title storage; native routing, navigation, transportation planning, or itinerary; identity or age verification; multiple cities; general restaurant, retail, accommodation, or business directories; mandatory accounts; mandatory AI or chat; social features; profiles; stored preferences; recommendation history or account-history personalization; and all other Roadmap or Vision functionality. DEC-0014 permits only a narrow, verified map exception for recurring nightlife and cultural venues.

## 5. Target users and primary situations

- A newcomer or visitor in Montréal who does not know where to look for an event.
- A Montréal resident looking for a festive, musical, nightlife, show, or comedy event.
- A user who wants to browse the map and filters without first expressing an intention.
- A user who voluntarily describes a specific request and expects explained results.

These are situations, not demographic personas. This PRD makes no market-size or demographic claim.

## 6. Product structure

The Accepted MVP has six primary screens:

1. **Explore / Map** — default entry and primary experience.
2. **Event Details** — complete view of a selected event.
3. **Lieux** — event-led venue list limited to the fourteen-day venue window.
4. **Venue Details** — enlarged venue sheet with practical information and scheduled events.
5. **Favorites** — saved events on the current device, with optional authenticated synchronization.
6. **Authentication** — contextual entry when the user voluntarily chooses account connection or cross-device synchronization.

Filters, intelligent search, event previews, match explanations, trust notices, and system feedback are overlays or states, not additional primary screens.

## 7. Functional requirement model

Requirements are implementation-neutral and stable within their domain. **P0** means required for MVP launch; **P1** means required before launch unless a documented acceptance decision explicitly defers it. Each acceptance criterion is externally verifiable. Final decisions and delegated details are recorded in section 22.

## 8. Explore / Map requirements

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| MAP-001 | Open directly on an explorable Montréal map without account, location permission, questionnaire, or query. | P0 | A new signed-out session reaches a populated or explicit system state without an auth, location-permission, or search gate. | PDR-0001, PDR-0002, UJ-0001, UX-0001 |
| MAP-002 | Use Montréal as the only launch geography. | P0 | MVP map results contain only qualifying Montréal events; no city switcher exists. | MVP-0001 |
| MAP-003 | Initial results cover events starting from the current time through the end of the next seven Montréal calendar days. | P0 | Opening Explore applies and exposes this window; users can change it through filters. | Product-owner decision; UX-0001; PDR-0001 simplicity |
| MAP-004 | Display correctly geolocated events and eligible verified recurring venues as markers, and group markers whenever density makes individual markers unreadable, without prescribing an algorithm. | P0 | Users can distinguish dense areas, expand a group through map interaction, and never see an event or venue with unusable coordinates represented as precisely located. | Product-owner decision; DEC-0014, UJ-0001, DATA-0001, UX-0001 |
| MAP-005 | Refresh visible results for the current map area after movement or zoom while retaining active criteria. | P0 | A map-area change can update results; manual and query-derived criteria remain active until changed or cleared. | PDR-0002, UX-0001 |
| MAP-006 | Open an event preview from a marker with name, date/time, venue, price/free when known, category, material status warning, and Event Details action. | P0 | Every selectable marker exposes the required known fields and does not conceal stale, uncertain, cancelled, or postponed status. | UJ-0001, UX-0001 |
| MAP-007 | Represent loading, empty, error, stale, uncertain, cancelled, and postponed conditions without making the map unusable. | P0 | Each condition renders distinct user feedback and an applicable recovery or continuation path. | PDR-0001, UJ-0001, UX-0001 |
| MAP-008 | Keep all exploration actions available without an account. | P0 | Signed-out tests can move/zoom, filter, search, preview, open details, and redirect externally. | DEC-0001, UX-0001 |

Montréal is the initial framing. Exact bounds, zoom, density thresholds, and marker-grouping presentation require prototype testing; technical implementation belongs to RFC-0001. No map provider or clustering technique is selected.

## 9. Filter requirements

### Approved minimum values and semantics

- **Date/time:** Tonight means the current time through 05:00 the following morning. Tomorrow means the next Montréal calendar day, including events continuing until 05:00 the following morning. This weekend means Friday at 17:00 through Monday at 05:00. Next 7 days uses the approved rolling initial window. Selected dates and ranges use the Montréal timezone. An event crossing midnight appears once, not once per calendar day.
- **Category:** Music / concerts; Nightlife / DJ / club / qualifying bar events; Festivals / festive events; Shows; Comedy; Other qualifying scheduled events.
- **Price:** All, Free, Paid. Unknown price is neither Free nor Paid and remains visible under All.
- **Geography/distance:** Manual exploration uses the visible map area. Distance applies only from a location explicitly supplied or selected by the user and means direct geographic distance. Pulso makes no implicit location assumption. If no usable reference exists, Pulso may ask one clarification or omit the constraint while explaining why.
- **Availability/status:** Active upcoming events appear in ordinary discovery. Postponed events may remain visible with a prominent warning and updated information when known. Cancelled events are excluded from ordinary discovery. A cancelled event reached through Favorites or another retained valid reference shows prominent cancellation status and no misleading active ticket action.

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| FILTER-001 | Provide the five minimum filter families and approved semantics above within Explore / Map. | P0 | Each family can be inspected and used without leaving the map or signing in; date/time tests use Montréal semantics and a cross-midnight event appears only once. | PDR-0001, MVP-0001, UX-0001; product-owner decision |
| FILTER-002 | Combine different families with AND; allow multiple selected categories with OR. | P0 | Result tests match all active families and any selected category within the category family. | Product-owner decision; PDR-0001 simplicity |
| FILTER-003 | Show active manual and query-derived criteria in understandable, editable form. | P0 | A user can identify why results are constrained and modify each exposed criterion. | PDR-0002, UJ-0002, UX-0001 |
| FILTER-004 | Clear one criterion independently or clear all criteria, returning to the approved default window and current map area. | P0 | Single-clear preserves other criteria; clear-all restores the documented default and states the effect. | UX-0001; product-owner decision |
| FILTER-005 | Preserve filters during the current session across map movement, previews, Event Details, and return navigation. | P0 | Returning to Explore restores the prior current-session map and filter context. | UX-0001 |
| FILTER-006 | Keep filters available before, during, and after intelligent search. | P0 | Search processing and results never remove manual-filter access. | PDR-0001, PDR-0002, UJ-0002 |

## 10. Intelligent-search requirements

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| SEARCH-001 | Offer optional natural-language query entry within Explore / Map. | P0 | The entry is visible but no query is required for any anonymous discovery flow. | PDR-0001, PDR-0002, UJ-0002 |
| SEARCH-002 | Interpret explicit event type, time, geography/distance, price, and ambiance criteria without asserting unexpressed preferences. | P0 | Test queries expose interpreted criteria; absent preferences are not labelled as user facts. | UJ-0002, UX-0001 |
| SEARCH-003 | Distinguish hard constraints from ranking signals. Explicit exclusions, maximum price, date/time, and geographic bounds are hard constraints; descriptive or subjective terms rank remaining results unless the user explicitly makes them mandatory. | P0 | Results do not violate interpreted hard constraints; ranking explanations identify applied signals. | Product-owner decision; PDR-0001 trust/explanation |
| SEARCH-004 | Show processing feedback while preserving the map and manual controls. | P0 | Submitting a query produces a visible processing state without navigating to a separate catalogue or mandatory chat. | PDR-0002, UX-0001 |
| SEARCH-005 | Display results on the same map and explain each highlighted match using known data. | P0 | Result markers remain map-manipulable and explanations cite concrete matching attributes. | PDR-0001, PDR-0002, UJ-0002 |
| SEARCH-006 | Separate exact matches, nearby alternatives, and no reliable result. | P0 | Each result condition is labelled; alternatives state the material difference; empty reliability never fabricates events. | UJ-0002, UX-0001 |
| SEARCH-007 | Ask at most one follow-up at a time and only when it materially affects useful results. | P1 | In incomplete-query tests, Pulso either returns useful results or asks one targeted question; no mandatory conversation chain occurs. | UJ-0002 |
| SEARCH-008 | Allow manual edits to interpreted criteria and preserve unrelated manual filters. | P0 | Editing or clearing query criteria produces predictable results without silently discarding unrelated manual choices. | PDR-0002, UX-0001 |
| SEARCH-009 | Use no account-history personalization. | P0 | Equivalent anonymous and authenticated sessions with the same current criteria receive results unaffected by favorite or account history. | PDR-0002 exclusions, UX-0001 |

No AI model, provider, prompt architecture, or ranking implementation is selected here.

## 11. Event information requirements

### Field classification

Required for a publishable event: internal identifier; name; qualifying category; scheduled start date/time; venue; address; usable coordinates; city; reliable known access information; source traceability; last verification date; appropriate trust status; and event status. A manually verified organizer or authorized correction may provide source traceability when no public booking URL exists.

Conditionally required when applicable: price/free indication and currency; external event or ticketing URL; link type (standard or affiliate); cancellation or postponement information. An external ticketing URL is not required for publication. Events that are free, require no reservation, accept payment at the venue, or otherwise have reliable known access information may be published.

Optional when known and usable: end date/time; short description; image; organizer.

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| EVENT-001 | Present event identity, date/time, venue/address, price/free, category, description, organizer when known, source, freshness/trust, status, known access information, applicable external action, and favorite action in the UX-0001 hierarchy. | P0 | Event Details exposes every known applicable field in the required hierarchy and remains usable when no external URL is required. | DATA-0001, UX-0001; product-owner decision |
| EVENT-002 | Label missing optional or conditionally unknown information instead of inferring it. | P0 | Partial-data fixtures never display invented price, end time, organizer, image, or description. | PDR-0001 trust, DATA-0001 |
| EVENT-003 | Exclude an event from correctly positioned map results when coordinates are unusable. | P0 | Invalid-coordinate fixtures produce no precise marker. | DATA-0001 |
| EVENT-004 | Show cancellation or postponement prominently in previews, details, and favorites. | P0 | Status fixtures cannot be mistaken for ordinary active events; old schedule is not presented as current after postponement. | DATA-0001, UX-0001 |
| EVENT-005 | Preserve source and last-verification traceability on Event Details. | P0 | Every published event exposes a source identity/link and last verification date. | DATA-0001 |
| EVENT-006 | Merge product duplicates into one event while retaining multiple source records and applicable external links internally. | P0 | Duplicate fixtures produce one discoverable event and retain traceable contributing sources. | DATA-0001 |
| EVENT-007 | Keep the Lieux list tied to a qualifying scheduled event in the fourteen-day venue window while allowing the verified recurring-venue map exception. | P0 | A venue without an eligible event is absent from Lieux; a verified recurring nightlife or cultural venue may remain on the map without creating a synthetic event. | MVP-0001, DEC-0014 |

## 11A. Venue discovery and details requirements

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| VENUE-001 | Show in Lieux only venues with at least one qualifying event from the current Montréal calendar date through the end of the fourteenth Montréal calendar date, inclusive. | P0 | Boundary fixtures inside the window appear; fixtures outside it and venues without events do not. | DEC-0014 |
| VENUE-002 | Permit verified recurring nightlife and cultural venues without current programming to remain visible as venue markers on the map. | P0 | An eligible verified venue is map-visible but does not affect event results or event counts. | DEC-0014 |
| VENUE-003 | Open an enlarged venue sheet from a venue list card or venue marker. | P0 | Selection reveals the venue without an account and preserves a return path to the prior context. | DEC-0014 |
| VENUE-004 | Present known venue identity, type, address, image, concise factual description, and external map-orientation action without inventing missing information. | P0 | Partial venue fixtures remain usable and disclose unavailable information. | DEC-0014, PDR-0001 |
| VENUE-005 | Separate venue programming into Aujourd'hui and Dans les 14 prochains jours blocks and open the existing Event Details surface from each event row. | P0 | Montréal date-boundary tests place each event once in the correct block. | DEC-0014 |
| VENUE-006 | Clearly state when no official programming is recorded for a map-only venue. | P0 | A map-only venue never displays a fabricated event or an implied active programme. | DEC-0014, DATA-0001 |
| EVENT-008 | Remove ended events from active exploration while permitting retained records outside active discovery. | P0 | Ended fixtures do not appear in ordinary active map results. | DATA-0001 |
| EVENT-009 | Show an image only when usage is allowed; otherwise preserve a complete non-image information flow. | P0 | Missing or disallowed-image fixtures remain usable and show no unauthorized placeholder content. | DATA-0001 |

## 12. Trust model

### Approved user-facing labels

- **Confirmed:** verified by an official source or consistent across reliable sources.
- **Probable:** credible but not fully confirmed.
- **To verify:** insufficiently confirmed; critical uncertainty is explicitly shown.
- **Conflicting:** sources disagree; the conflict is explicitly shown.

These labels are Accepted product semantics. User-facing wording and prominence may be refined through prototype testing without changing the four meanings. Exact source hierarchy, evidence thresholds, refresh cadence, and automated/manual assignment rules require pre-ingestion research and RFC-0001 and do not block PRD acceptance.

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| TRUST-001 | Give every published event a user-visible trust label and source attribution. | P0 | Event Details for every fixture exposes both; previews show material warnings. | PDR-0001, DATA-0001 |
| TRUST-002 | Show the last verification date in understandable form. | P0 | Users can determine when information was last checked without inspecting technical metadata. | DATA-0001 |
| TRUST-003 | Describe information as fresh or stale only against an approved source/event-type policy; until a policy is approved, do not claim freshness. | P0 | Fixtures beyond an approved policy show stale; absent policy cannot display a fresh claim. | Product-owner decision; DATA-0001 |
| TRUST-004 | Disclose uncertainty or conflict before an affected external action. | P0 | To verify/Conflicting fixtures show the warning before the outbound control. | PDR-0001, UJ-0001, UJ-0002 |
| TRUST-005 | Provide a product capability for authorized manual correction with source and verification traceability; no administration screen is added by this PRD. | P1 | A corrected fixture can update user-visible data while retaining correction/source audit information. | DATA-0001 binding target; UX-0001 exclusion |
| TRUST-006 | Propagate known cancellation, postponement, venue, or time changes to user-visible surfaces. | P0 | Updated fixtures show consistently on map state, preview, details, and favorites. | DATA-0001 |

This PRD makes no claim that any named source permits a collection method or offers an API/feed.

## 13. Authentication and favorites

### Authentication

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| AUTH-001 | Permit complete anonymous discovery and external redirects. | P0 | All account-free flows pass in a signed-out session. | DEC-0001, UX-0001 |
| AUTH-002 | Trigger authentication only when a user voluntarily chooses account creation or connection for cross-device favorite synchronization. | P0 | No favorite add, removal, or consultation presents a required auth gate. | DEC-0007 |
| AUTH-003 | Preserve local favorites and current context through a voluntary account connection, then merge local and account collections by stable event ID. | P0 | Successful connection produces the union without duplicate or silent deletion and returns to the preserved context. | DEC-0007 |
| AUTH-004 | Allow cancellation and recoverable failure without losing browsing context or local favorites. | P0 | Cancel/failure returns to the prior context with local favorites unchanged and displays actionable feedback. | DEC-0007 |
| AUTH-005 | Use email as the MVP account identifier; verification, sessions, recovery, retention, and deletion remain RFC-0001 decisions. | P0 | A user can create or access one account using an email identifier; no profile or additional account capability is introduced. | Product-owner decision; DEC-0001 simplicity |

### Favorites

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| FAV-001 | Save an event from Event Details locally without authentication. | P0 | Save changes the event state and adds its stable event ID once to local Favorites. | DEC-0007 |
| FAV-002 | Display local saved events, and the merged collection after authentication, with identity, date/time, venue, and current event/trust warnings. | P0 | Favorites entries expose required known fields and current warnings without requiring an account. | DEC-0007, UX-0001 |
| FAV-003 | Order active favorites by soonest upcoming event; place inactive retained favorites afterward with status clearly displayed. | P1 | Ordering fixtures follow this rule and never conceal status. | Product-owner decision; PDR-0001 simplicity/trust |
| FAV-004 | Open Event Details from Favorites and remove a favorite. | P0 | Open uses the same Event Details; remove deletes the local or account saved association without deleting the event. | DEC-0007, UX-0001 |
| FAV-005 | Show a useful empty state with a return to Explore / Map. | P0 | A local or authenticated collection with no favorites shows no error and can return to exploration. | DEC-0007, UX-0001 |

No profile, social graph, preference store, personalized history, or ticket store is included.

## 14. External redirects and affiliation

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| REDIRECT-001 | Open a clearly identified external ticketing or event source in one user action from Event Details. | P0 | Before activation, the destination identity is visible; activation leaves Pulso for that URL. | DEC-0001, UJ-0001, UX-0001 |
| REDIRECT-002 | Prefer an approved affiliate link when available and fall back to the standard external link when not. | P0 | Fixtures with/without affiliate links reach the correct valid destination. | DEC-0001 |
| REDIRECT-003 | Perform no native booking, payment, ticket storage, routing, or itinerary. | P0 | No in-product transaction, stored ticket, route, or itinerary control exists. | MVP-0001, DEC-0001, UX-0001 |
| REDIRECT-004 | Keep the user on Event Details and explain an unavailable or invalid destination. | P0 | Failure fixtures do not open a broken destination or offer native transaction fallback. | UX-0001 |
| REDIRECT-005 | Record privacy-minimized outbound attempt and result, destination type, and affiliate-versus-standard link type without selecting an analytics technology. | P1 | Measurement records those purposes without collecting ticket, payment, or transaction data. | Product-owner decision; DEC-0001 |

## 15. Responsive requirements

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| RESPONSIVE-001 | Provide functional parity across responsive desktop web, responsive mobile web, and mobile application. | P0 | The same four screens, rules, event data, trust states, filters, search, favorites, and redirects pass on all surfaces. | PDR-0001, MVP-0001, DEC-0001 |
| RESPONSIVE-002 | Keep the map primary while adapting overlays and information density to available space. | P0 | Each viewport preserves map access and functional controls without creating another primary screen. | PDR-0001, UX-0001 |
| RESPONSIVE-003 | Preserve map/filter context when opening and returning from preview or Event Details. | P0 | Return restores the current-session area and criteria on all surfaces. | UX-0001 |
| RESPONSIVE-004 | Add no mobile-application-only MVP product capability. | P0 | Cross-surface comparison finds no app-exclusive module or feature. | UX-0001 |

No framework, design system, breakpoint library, or application architecture is selected.

## 16. Complete state matrix

| State | Explore / Map | Event Details | Favorites / Authentication | Required behavior |
| --- | --- | --- | --- | --- |
| Loading | Map context when available; event loading indicator | Details loading indicator | Collection/auth loading indicator | Resolve to success, empty, partial, or error; prevent duplicate actions |
| Success | Qualifying markers and active criteria | Known information and valid actions | Saved collection or authenticated return | Continue the selected flow |
| Empty | No events match area/criteria | Not a normal loaded-event state | No saved events | Explain and offer clear/change criteria or return to Explore |
| Error | Event results failed, distinct from empty | Details failed | Favorites/auth failed | Explain, retry where safe, preserve context |
| Partial | Show known event data only | Label unknown fields | Preserve known saved-event data | Never infer missing facts |
| Stale | Mark affected event | Show last verification and warning | Preserve warning | Do not claim current information |
| Uncertain | Mark affected event | Show trust label and affected information | Preserve warning | Disclose before outbound action |
| Cancelled | Excluded from ordinary discovery; identifiable from a retained valid reference | Prominent cancelled status with no misleading active ticket action | Preserve status | Never present as active |
| Postponed | Visible with warning | Show status and known revised information | Preserve status | Never present old schedule as current |
| Search processing | Preserve map and filters | Not applicable | Not applicable | Show progress without separate catalogue |
| No exact search result | Show labelled alternatives or no reliable result | Normal if alternative selected | Not applicable | Do not fabricate exact matches |
| Optional account connection | Browsing and local favorites remain available | Retain event and local-favorite context | Contextual auth only when chosen | Merge on success; keep local favorites on cancel/failure |
| Favorite empty | Not applicable | Not applicable | Empty collection | Provide return to Explore |
| External destination unavailable | Event remains discoverable | Explain failure | Preserve favorite | Remain in Pulso; no native fallback |

| ID | State requirement | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| STATE-001 | Distinguish loading, empty, and error states. | P0 | Tests can identify each state by text/semantics, not color alone. | UX-0001 |
| STATE-002 | Preserve user context through recoverable errors and authentication transitions. | P0 | Map/filter/event context survives documented retry/cancel/return flows. | UX-0001 |
| STATE-003 | Expose partial, stale, uncertain, cancelled, and postponed states consistently. | P0 | State fixtures agree across preview, details, and favorites where applicable. | DATA-0001, UX-0001 |
| STATE-004 | Prevent duplicate user-visible outcomes during repeated loading actions. | P1 | Repeated save/search/redirect activation while processing does not create duplicate favorites, queries, or outbound measurements. | Product-quality requirement |

## 17. End-to-end acceptance scenarios

### Free exploration

**Given** a signed-out user opens Pulso in Montréal, **when** the initial data resolves, moves/zooms the map, applies filters, selects a marker, and opens Event Details, **then** the same map experience remains primary, essential and trust information is visible, and no account or AI step is required within the 60-second target.

### Intelligent search

**Given** Explore / Map is usable, **when** the user voluntarily submits a request, **then** Pulso exposes interpreted criteria, shows processing feedback, displays exact matches or labelled alternatives on the same map, explains matches, and keeps manual filters available.

### Save while signed out

**Given** a signed-out user is on Event Details, **when** they choose Favorite, **then** Pulso saves one local favorite without authentication and retains the current context. If the user later voluntarily connects an account, the local and account collections are merged by stable event ID without duplicate or silent deletion.

### Remove favorite

**Given** a user has a local or authenticated saved event, **when** they remove it, **then** the association disappears from Favorites while the underlying event remains available.

### External destination

**Given** Event Details has a valid identified external destination, **when** the user activates it, **then** Pulso records the privacy-minimized outbound action and opens the external destination without a native transaction.

### Uncertain event

**Given** an event is To verify or Conflicting, **when** it appears in preview and details, **then** uncertainty and source/freshness information are visible before the external action.

### Cancelled or postponed event

**Given** an event becomes cancelled or postponed, **when** the user reaches it through an applicable retained context, **then** the status is prominent, no old schedule is represented as current, and a cancelled event exposes no misleading active ticket action.

### No matching search result

**Given** no event satisfies the hard constraints, **when** search completes, **then** Pulso shows clearly labelled nearby alternatives or no reliable result and does not fabricate a match.

### Unavailable destination

**Given** an external destination is invalid or unavailable, **when** the user activates it, **then** Pulso remains on Event Details, explains the failure, and offers no native booking fallback.

## 18. Measurement plan

### Product events

Measure, without selecting a vendor: Explore opened; initial map resolved; map area changed; filter applied/cleared; query submitted/interpreted/completed; result condition; preview opened; Event Details opened; trust warning displayed; local favorite requested/saved/removed; voluntary account connection and merge outcome; outbound destination attempted/succeeded/failed; and relevant loading/empty/error states. Raw intelligent-search queries are not retained by default.

Collection must use the minimum data necessary, avoid query or account-history profiling beyond operational need, and exclude payment, ticket, identity-document, and age-credential data.

| ID | Measurement requirement | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| MEASURE-001 | Measure the under-60-second path from Explore open to Event Details or outbound-action choice. | P0 | A validation session can calculate elapsed time for both Accepted journeys. | PDR-0001, UJ-0001, UJ-0002 |
| MEASURE-002 | Measure anonymous discovery completion, result conditions, data/trust quality observations, redirect outcomes, and favorite outcomes. | P1 | Each launch indicator below can be calculated without an analytics-vendor dependency. | MVP-0001, DATA-0001, UX-0001 |
| MEASURE-003 | Minimize measurement data and avoid account-history or query-content profiling. | P0 | The measurement specification excludes unnecessary personal identifiers and raw query retention by default. | PDR-0001 trust, UX-0001 exclusions |
| MEASURE-004 | Separate launch evaluation from later aggregate optimization. | P1 | Launch reporting excludes later optimization metrics unless separately enabled and justified. | PDR-0001 MVP-first |

### MVP launch measurements

- Time from Explore opened to Event Details or outbound-action choice, evaluated against the under-60-second objective.
- Anonymous completion rate for free exploration and intelligent-search flows.
- Coverage by Accepted event category and qualifying Montréal source set, without an invented market-share claim.
- Proportion of events with usable geolocation, visible source, last verification, and trust status.
- Duplicate, stale, uncertain, cancellation, postponement, and correction observations.
- External destination attempt, success, and failure rate.
- Local favorite save, reopen, and removal completion; voluntary account-connection and merge completion without raw query or account-history profiling.

### Later optimization measurements

- Filter and query refinement patterns in aggregate.
- Exact-match versus alternative usefulness in validated research.
- Explanation comprehension and prototype usability.
- Cross-surface usability differences.

Later optimization does not authorize user profiling, account-history personalization, or extra personal-data collection.

## 19. Accessibility, privacy, and security requirements

| ID | Requirement and user-visible behavior | Priority | Acceptance criteria | Source |
| --- | --- | --- | --- | --- |
| ACCESS-001 | Make essential web actions—map alternatives, filters, search, previews/details, authentication, favorites, and external actions—keyboard operable and meaningfully exposed to screen readers. | P0 | Each essential action completes in keyboard and screen-reader validation without a pointer-only step. | Product-level MVP requirement |
| ACCESS-002 | Make status, trust, error, cancellation, and postponement information readable without reliance on color alone. | P0 | Every state has text or semantic identification in addition to any color treatment. | PDR-0001 trust, UX-0001 |
| ACCESS-003 | Preserve logical focus order, labels, error association, and return focus through documented flows. | P0 | Focus tests complete overlays, details, authentication return, and error recovery predictably. | UX-0001 flows |
| PRIVSEC-001 | Protect authentication/session data and favorite associations from unauthorized access or disclosure. | P0 | Security verification confirms that one user cannot access or change another user's account or favorites. | DEC-0001 |
| PRIVSEC-002 | Limit personal-data collection to authentication, favorites, security, and privacy-minimized measurement needs. | P0 | The approved data inventory contains no unrelated personal field. | PDR-0001 trust, DEC-0001 |
| PRIVSEC-003 | Collect or store no payment data, tickets, identity documents, or age credentials. | P0 | Data and interface inspection finds none of these excluded records or inputs. | MVP-0001, DEC-0001 |
| PRIVSEC-004 | Avoid unnecessary natural-language query content and personal identifiers in logs and measurement. | P0 | Logging/measurement review demonstrates minimization and documented necessity for any retained field. | PDR-0001 trust |
| PRIVSEC-005 | Define retention and deletion behavior in RFC-0001 before the affected capability is production-ready. | P0 | RFC-0001 or an approved dependent decision specifies the shortest justified retention and deletion behavior for account, favorite, security, query, and measurement data. | Product-owner decision; product-level privacy requirement |

Exact standards, providers, libraries, retention periods, and infrastructure controls require RFC-0001 or an approved dependent decision.

## 20. Delivery boundaries

### Required for MVP launch

All P0 requirements; approved P1 requirements not explicitly deferred; four Accepted screens; Montréal map discovery; filters; optional intelligent search; details/trust states; anonymous access; contextual authentication; favorites; external redirects; responsive parity; state handling; product measurement; and product-level accessibility, privacy, and security.

### Required before production ingestion

Exact source hierarchy; source-specific refresh cadence; API/feed availability; platform terms and collection constraints; image/description usage rights; source-specific import mechanisms; validated schema; tested deduplication; correction procedure; moderation approach; and approved trust/freshness thresholds.

### Deferred to Roadmap

Other cities; native booking subject to separate feasibility and decision; storage of tickets or titles; ticket wallet.

### Deferred to Vision

Digital identity and age proof/certification.

## 21. Definition of done

PRD implementation is product-complete only when:

1. Every P0 requirement and non-deferred P1 requirement has passing acceptance evidence on applicable surfaces.
2. All end-to-end scenarios pass, including signed-out and failure paths.
3. Prototype/product validation demonstrates the under-60-second target for both Accepted journeys.
4. The six-screen structure is preserved and no excluded capability exists.
5. Event source, freshness, trust, geolocation, duplicate, cancellation, postponement, and correction behaviors meet approved thresholds.
6. External actions identify destinations, use standard fallback, and never create a native transaction.
7. Desktop web, mobile web, and mobile application meet functional parity.
8. Essential accessibility, privacy, and security requirements have verification evidence.
9. Product measurements can evaluate launch indicators without unnecessary personal data.
10. All relevant tests, type checks, linting, and builds pass before an implementation task finishes.

Numeric launch gates derived from the documented Montréal ingestion sample and usability-prototype baseline must be approved before production launch. Establishing those numbers is a pre-launch obligation, not a blocker to this PRD's acceptance, RFC-0001 drafting, or initial implementation.

## 22. Final decision record

| Subject | Accepted product decision | Delegated detail | Owner |
| --- | --- | --- | --- |
| Initial event window | Current time through the end of the next seven Montréal calendar days | Capacity and implementation details | RFC-0001 |
| Initial map framing | Montréal appears immediately without account, location permission, or query | Exact bounds, zoom, density, and grouping presentation | Prototype testing; technical implementation in RFC-0001 |
| Date/time values | Tonight: now–05:00; Tomorrow: next Montréal calendar day through 05:00; This weekend: Friday 17:00–Monday 05:00; Next 7 days: rolling initial window; selected dates/ranges use Montréal time; cross-midnight events appear once | Presentation and comprehension | Prototype testing |
| Categories | Music / concerts; Nightlife / DJ / club / qualifying bar events; Festivals / festive events; Shows; Comedy; Other qualifying scheduled events | Source-to-category mapping | RFC-0001 |
| Price | All, Free, Paid; unknown is neither Free nor Paid and remains under All | Presentation copy | Prototype testing |
| Geography/distance | Manual geography uses visible map area; distance uses direct geographic distance from a user-supplied or selected location; no implicit location, routing, travel time, or itinerary | Geospatial implementation | RFC-0001 |
| Active-event status | Active upcoming events appear normally; postponed may remain with warning and known updates; cancelled are excluded from ordinary discovery but remain explicit in retained valid contexts without misleading ticket action | Event lifecycle implementation | RFC-0001 |
| Filter combination | AND across families; OR among selected categories | Implementation | RFC-0001 |
| Search constraints/ranking | Explicit exclusions, maximum price, date/time, and geography are hard; descriptive/subjective terms rank unless explicitly mandatory | Search implementation | RFC-0001 |
| Follow-up questions | At most one at a time, only when materially useful; otherwise return useful results immediately | Presentation and usability | Prototype testing |
| Trust labels | Confirmed, Probable, To verify, Conflicting | Wording/prominence; evidence thresholds | Prototype testing; pre-ingestion research and RFC-0001 |
| Freshness | Fresh/stale claims require an approved policy | Exact policies and thresholds | Pre-ingestion research and RFC-0001 |
| Authentication | Email is the MVP account identifier; no profile or extra account capability | Verification, sessions, recovery, retention, deletion | RFC-0001 |
| Favorites ordering | Active favorites by soonest upcoming event; inactive retained favorites afterward with visible status | Implementation | RFC-0001 |
| Outbound measurement | Measure attempt/result, destination type, affiliate/standard; collect no ticket, payment, or transaction data | Exact fields and retention | RFC-0001 |
| Publishable event fields | No external URL is required when reliable access information exists; every event still requires identity, schedule, usable location, qualifying category, access information, source traceability, and trust status; missing data is never invented; a manually verified organizer or authorized correction may provide traceability | Exact schema enforcement | RFC-0001 |
| Measurement events | Use the minimal section 18 event set; retain no raw intelligent-search query by default | Exact fields and shortest justified retention | RFC-0001 |

## 23. Resolutions, delegations, and pre-launch obligations

### Resolved decisions

- The 17 product decisions in section 22 are Accepted.
- Distance uses explicit-location, direct-geographic-distance semantics only.
- Email is the MVP account identifier.
- Cancelled events follow the status behavior defined in sections 9, 16, and 17.
- Marker grouping is required whenever density makes individual markers unreadable.
- Product measurement purposes are approved with minimized fields and no raw-query retention by default.

### Explicit delegations

- Pre-ingestion research and RFC-0001 own exact freshness policies, trust evidence thresholds, source constraints, and ingestion rules.
- RFC-0001 owns distance implementation; authentication verification/session/recovery/retention/deletion; event lifecycle and schema enforcement; search implementation; and measurement schema/retention.
- Prototype testing owns exact map bounds, zoom, density and grouping presentation; filter and trust-label comprehension; follow-up-question presentation; and usability evidence.

These delegations do not block PRD acceptance. Pre-ingestion obligations still block production ingestion where DATA-0001 specifies them.

### Pre-launch validation obligations

- Produce a documented Montréal ingestion sample.
- Produce a usability-prototype baseline, including the under-60-second journeys.
- Use those artifacts to establish evidence-based numeric launch gates for coverage, usable geolocation, freshness, duplicate rate, redirect success, and usability.
- Obtain approval of the numeric launch gates before production launch.

The Montréal sample, prototype baseline, and numeric launch gates do not block RFC-0001 drafting or initial implementation.

## 24. Traceability matrix

| Requirement group | Primary sources |
| --- | --- |
| MAP | PDR-0001, PDR-0002, MVP-0001, DATA-0001, UJ-0001, UX-0001 |
| FILTER | PDR-0001, PDR-0002, MVP-0001, UJ-0001, UJ-0002, UX-0001 |
| SEARCH | PDR-0001, PDR-0002, UJ-0002, UX-0001 |
| EVENT | MVP-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001 |
| TRUST | PDR-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001 |
| AUTH | DEC-0001, UX-0001 |
| FAV | MVP-0001, DEC-0001, UX-0001 |
| REDIRECT | MVP-0001, DEC-0001, UJ-0001, UJ-0002, UX-0001 |
| RESPONSIVE | PDR-0001, MVP-0001, DEC-0001, UX-0001 |
| STATE | PDR-0001, DATA-0001, UX-0001 |
| MEASURE | PDR-0001, MVP-0001, DATA-0001, UJ-0001, UJ-0002, UX-0001 |
| ACCESS | PDR-0001, UX-0001 |
| PRIVSEC | PDR-0001, MVP-0001, DEC-0001 |

## RFC-0001 inputs

RFC-0001 must implement or specify the delegated data, geospatial distance, search, account verification/session/recovery/retention/deletion, privacy/security, measurement, and cross-surface details in section 22. It also needs pre-ingestion source research as it becomes available; event schema and lifecycle; deduplication/correction behavior; external-link validation; and evidence that no Roadmap or Vision complexity is being anticipated. Numeric launch gates may be incorporated when approved but do not block RFC-0001 drafting.
