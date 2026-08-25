# DEC-0027 — Discovery First: Cutting the Primary Navigation to the Path

**Identifier:** DEC-0027
**Version:** 1.1
**Status:** Accepted
**Date:** 2026-08-24
**Dependencies:** PDR-0001, MVP-0001, PRD-0001, UX-0001, DEC-0003, DEC-0013, DEC-0020, DEC-0025, DEC-0026
**Supersedes:** the primary-navigation shape of DEC-0020 — its "Communauté" rail entry and the four-then-five phone tabs — to the exact extent described below and no further. Every surface DEC-0020 built stays built, stays routed, and stays reachable.

## Context

A second round of user testing said the product was good on a desktop and
hard on a phone. Not slow, not broken: hard. Too many tabs, too many peers,
several screens that looked like each other, and a navigation that got wider
the moment you signed in.

The audit found why, and it was not a design problem. It was the navigation
publishing internal state as destinations.

`section` has two discovery values, `evenement` and `lieu`. Each carries a
`viewMode` of `map | list | calendar`. The signed-out phone showed five
tabs — Carte, Événements, Lieux, Calendrier, Favoris — and **three of those
five were the same section under a different `viewMode`**. The control that
switches between them already existed (`.view-toggles`), as did the
Événements/Lieux switch drawn on the map itself. The product was offering
the same two things five ways and calling each one a destination.

Signed in it got wider rather than narrower: eight rail entries, and a phone
bar where Groupes and Messages sat as peers of the map.

Two defects surfaced while auditing, both consequences of the same crowding:

- Below 1024px the floating header drops the language selector and the
  About button to make room. Below 768px the rail that also held them is
  `display: none`. So on a phone, signed out, **there was no way to change
  language and no way to open About** — and About is the only route to the
  four legal documents DEC-0026 §4 requires to be reachable without an
  account, on the surface DEC-0026 §2 calls the launch product.
- An empty Favoris page rendered a hero, a title, a description, two
  counters both reading zero, a call to action and two tabs, all stacked
  above the sentence saying it was empty.

## Decision

**1. The primary navigation carries the path, and nothing else.**

The path is: open Pulso → see what is on around you → find something →
read it → go. Anything not on that path may exist, may be one tap away, and
may not hold a primary slot.

**2. Phone: three destinations signed out, four signed in.** *(amended v1.1)*

Signed out: `Carte` · `Événements` · `Vous`.
Signed in: `Carte` · `Événements` · `Communauté` · `Vous`.

Carte owns every map, and keeps the Événements/Lieux switch drawn on it.
Événements owns the list and the calendar. Vous owns everything that
belongs to this person. Communauté appears only where it has content — see
§5 — and is one entry, never three.

**3. Calendrier and Lieux stop being destinations and become views.**

Événements gains one segmented control, `Liste | Calendrier`, at the top of
the surface it switches. It has to live there rather than in the filters
sidebar, because that sidebar is `display: none` on the anonymous shell at
every width except the mobile drawer — with Calendrier gone from the rail
there would otherwise be no way to reach it at all.

Lieux keeps its desktop rail entry, where there is room and the venue
directory is a genuinely different reading of the data. On a phone it is
reached through the map's own Événements/Lieux switch.

**4. Favoris leaves the primary navigation.**

It is already a tab of the account space. Signed out it is a list this
browser happens to hold — `useFavorites` has always kept it in
`localStorage` and merged it into the account on first sign-in, and that is
unchanged. The heart on every card is what fills it; a rail entry never was.

**5. The relationship space stays primary — signed in only.** *(v1.1)*

v1.0 moved it out on a "discovery first" reading. The product owner reversed
that: the group space is a deliberate differentiator, not an accessory, and
the signed-in half of Pulso is where it lives.

The distinction that survives is between the two halves of the product
rather than between discovery and everything else. Signed out there is no
relationship space to show, so the anonymous phone keeps three destinations.
Signed in, Communauté is one of four — and it opens on Groupes
(`DEFAULT_COMMUNITY_SECTION`), which is the part worth pushing.

What v1.0 got right and v1.1 keeps: Groupes, Messages and Amis were *three*
peers of the map on the signed-in phone, which is what made it feel wider
than the signed-out one. They are one hub entry now, the one DEC-0020 built.
`COMMUNITY_IN_PRIMARY_NAV` remains as the single visible switch, now `true`.

**6. A signed-out account surface exists.**

`AnonymousYouPanel`, on `section === 'compte'`, carrying the sign-in
invitation, the favourites count, the language selector, About, and the
four legal links. This is what makes the phone compliant with DEC-0026 §4
again. The blanket phone rule that hid every `.lang-selector` is scoped to
the header, where it was always meant to apply.

**7. The default discovery window returns to `next7`.** *(v1.1)*

The default had moved to `today` on the reasoning that seven days was "too
dense to browse" once real ingestion arrived. Measured against the catalogue
as it stands, the opposite holds: on identical map bounds, `today` returns 4
events and `next7` returns 104, while the calendar for the same month shows
days carrying 31, 36 and 60. Four pins on the opening screen does not read
as curation, it reads as an empty city — and free map exploration is the
primary experience (MVP-0001). `today` and `tonight` are unchanged and still
selectable; only the unconfigured default moved back to what MAP-003
originally specified.

**8. Four density defects on the phone, fixed.** *(v1.1)*

- The event date was `display: none` on mobile list cards. It is the fact a
  reader cannot choose without; it is back.
- Cards showed the category *definition* ("Autres événements programmés
  admissibles") rather than the short label that already existed and that
  the filters and calendar have always used.
- The two actions that finish the journey sat at y=823 and y=885 on an
  844px screen. They are sticky to the bottom of the detail panel now.
- Venue addresses rendered the reverse geocoder's full output — nine lines
  naming Montréal three times, on 220 of 1420 venues. `shortenMontrealAddress`
  keeps the civic number, the street and the neighbourhood.

**9. Empty states explain, and stop there.**

An empty Favoris renders one card: what the feature is, why it is useful,
and the one action that follows. No hero, no zero counters, no tabs over a
blank grid.

## Not authorized

- Removing, unrouting or feature-flagging any **backend** capability. This
  decision moves entries in a navigation; it touches no repository, no
  endpoint and no schema.
- Deleting `MessagesPage`, `GroupsPage`, `AmisPage`, `CalendarView`,
  `LieuxPage` or `FavorisSection`. All six stay built and reachable.
- Turning the map into a feed. The geographic, visual reading of what is on
  around you is the differentiator (PDR-0001); Carte stays the first
  destination and the default surface.
- Making desktop match the phone. Desktop keeps `Lieux` and keeps
  `Découvrir`; it has the room and the audit found no complaint there.

## Acceptance criteria

1. The signed-out phone shows exactly three primary destinations; the
   signed-in phone shows exactly four, the fourth being Communauté.
2. Calendrier is reachable from Événements at every width, signed in or out.
3. Language can be changed from a phone, signed out.
4. All four legal documents are reachable from a phone, signed out, without
   an account.
5. Favourites set while signed out survive and merge on sign-in, unchanged.
6. An empty Favoris renders one card and no zero counters.
7. `COMMUNITY_IN_PRIMARY_NAV` is the only switch governing the Communauté
   entry, in the rail and on the phone alike.
8. The signed-in phone shows four destinations: Carte, Événements,
   Communauté, Vous — never Groupes, Messages and Amis as three peers.
9. Opening the map with no filters set shows the next seven days.
10. On a phone, an event card states when the event is, and the actions that
    finish the journey are reachable without scrolling.
