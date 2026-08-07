# DEC-0014 — Venue discovery and details

**Version:** 1.0  
**Status:** Accepted  
**Date:** 2026-08-04  
**Supersedes:** The venue-eligibility restrictions in MVP-0001 v1.1, UX-0001 v1.1, PRD-0001 v1.1, and RFC-0001 v1.1

## Decision

Pulso adds a first-class **Lieux** destination and a venue-details surface while preserving Explore / Map as the primary MVP experience.

Two distinct eligibility rules apply:

1. **Lieux list:** a venue appears only when Pulso has at least one qualifying scheduled event at that venue between the current Montréal calendar date and the end of the fourteenth Montréal calendar date, inclusive.
2. **Map:** in addition to venues represented by qualifying events, Pulso may display a verified recurring nightlife or cultural venue even when no official event is currently recorded. This exception exists to support spatial orientation and spontaneous nightlife navigation.

The map exception is narrow. It covers verified Montréal bars, nightclubs, concert halls, theatres, cultural spaces, and comparable recurring outing destinations. It does not create a general restaurant, retail, accommodation, or business directory.

## Venue details

Selecting a venue from the Lieux list or a venue marker opens an enlarged venue sheet. The sheet provides, when known and verified:

- venue name, type, address, image, and a concise factual description;
- an external map action for orientation;
- a distinct **Aujourd’hui** event block;
- a distinct **Dans les 14 prochains jours** event block;
- access to the existing Event Details surface for every listed event;
- an explicit empty state when no event is currently known.

An editorial description may be shown when sourced. When none exists, Pulso may compose a neutral summary from verified structured facts such as venue type, location, and the number of scheduled events. It must not invent atmosphere, opening hours, popularity, prices, amenities, or programming.

## Data and trust rules

A recurring venue without a current event is eligible for the map only when its identity, Montréal address, usable coordinates, venue category, and verification evidence are known. It must remain distinguishable in the data model from a venue surfaced through an active event.

The map may state that no official programming is currently recorded. It must not create a synthetic event to keep a venue visible.

## Scope boundaries

- Explore / Map remains the default and primary experience.
- The Lieux list is event-led and limited to the fourteen-day window.
- The map exception supports orientation; it does not change event-search results or event counts.
- Venue details remain usable without an account.
- Native booking, payment, ticket storage, routing, social communities, public reviews, and unverified opening-status claims are not introduced by this decision.

## Acceptance criteria

1. A venue with an event within the fourteen-day window appears in Lieux.
2. A venue whose only event falls outside that window does not appear in Lieux.
3. A verified recurring venue with no recorded event may appear as a venue marker on the map.
4. Such a venue does not appear in the Lieux list until it has an eligible event.
5. Venue details separate today's events from later events in the fourteen-day window.
6. Missing descriptions or event programming are disclosed without fabrication.

