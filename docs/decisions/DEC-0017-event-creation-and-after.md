# DEC-0017 — Event creation and the After filter

**Version:** 1.1  
**Status:** Accepted  
**Date:** 2026-08-06  
**Depends on:** PDR-0001, DATA-0001, PRD-0001, MVP-0001, DEC-0010, DEC-0012  
**Extends:** PRD-0001 §Publishable event fields, which already anticipates that "a manually verified organizer or authorized correction may provide source traceability when no public booking URL exists"

## Context

Every event in Pulso today comes from ingestion and carries a source URL, an observation timestamp and a trust label (DATA-0001). Two real gaps follow from that.

A Montréal bar or club cannot list its own night unless a ticketing platform happens to carry it. And Montréal's nightlife ends early by ordinance, so a large share of the actual activity — afters — is organized privately and appears on no ticketing feed at all. Neither is reachable by ingestion, and the second is the more distinctive of the two.

## Decision

Pulso allows a signed-in account to create an event, and adds an **After** filter.

### Provenance, not trust

Created events do not receive a `trust_label`. That vocabulary describes how well Pulso has corroborated a *sourced* record and would be meaningless applied to a form submission.

Instead every event carries an orthogonal `origin`:

- `directory` — ingested. Unchanged, and the only origin that keeps the DATA-0001 trust framework.
- `verified_organizer` — created by an account attached to a verified venue.
- `community` — created by any other signed-in account.

The three are always visually distinguishable. An interface must never present a `community` event with the same authority as a `directory` one.

### Verified organizers

A `venue_organizers` row links an account to a venue. It is created by a Pulso operator after an out-of-band check, not by a self-service flow — there is no automated venue-ownership verification, and claiming one would be a fabricated guarantee.

An account with such a row publishes as `verified_organizer` for that venue only. Everyone else publishes as `community`, including for a venue they claim to represent.

### Visibility

Created events appear **only in the connected experience**.

This follows DEC-0012's existing position: sourced event data carries an explicit trust framework, user-generated content has none, and mixing the two into anonymous browsing blurs that distinction for a visitor who never chose to engage with the account layer. The anonymous map, list, calendar and search remain the sourced directory exactly as before.

### The After filter

"After" is an **attribute plus a time window**, not a seventh event category.

An after is a nightlife event, so it keeps its real category and colour rather than being moved out of `nightlife` into a parallel taxonomy. Two things make an event match the After filter:

1. its creator marked it as an after (`is_after`), or
2. it starts between 02:00 and 06:00 Montréal time — which is what an after *is*, and which also catches the ingested late-night events already in the directory.

Modelling it as a category instead would have made the filter return only app-created content, since no ingestion source will ever emit an "after" category.

The After filter is available in the connected experience only, alongside the created events it is designed to surface.

## Required fields

A created event requires: title, category, start date/time, venue (an existing Pulso venue or a new one with a usable Montréal address and coordinates), and access information. Optional: end time, description, price, image.

The creating account is recorded. Missing optional information stays absent rather than being invented, exactly as EVENT-002 requires of ingested events.

## v1.1 addendum — the organizer workspace

v1.0 shipped creation as a single modal on the Événements page. That is not
enough to actually run an event, so v1.1 authorizes a dedicated **Organisateur**
destination in the connected rail, with:

- a list of the account's own created events, upcoming and past;
- **editing** an event the account created, not only deleting it;
- a **cover photo**, uploaded to the API's own local disk exactly like
  DEC-0012 v1.2's event photos — same pre-deployment constraint, no cloud
  object store introduced;
- a **precise address** typed by the organizer and resolved to coordinates
  server-side. When resolution fails the event cannot be published: a pin
  Pulso cannot place is worse than no pin, and guessing the coordinates is
  the fabrication EVENT-002 forbids;
- an optional **external ticketing link**, which reuses the existing
  `externalDestination` redirect and its "clearly identified external
  destination" rules (UX-0001 §Open an external ticketing link).

The external link is the only money-adjacent capability authorized. It sends
the user to someone else's checkout, exactly as an ingested Ticketmaster
event already does.

### Native ticketing remains out of scope

Selling tickets inside Pulso is excluded here as firmly as in v1.0, and the
reason is not only documentary. It requires a payment processor and its PCI
scope, GST/QST collection and remittance, Québec's consumer-protection rules
on ticket sales, organizer payouts with the KYC/AML that implies, and
liability for refunds, chargebacks and cancellations. It is a separate
business line with legal and accounting prerequisites, and Pulso is not yet
deployed. It requires its own decision, taken with an accountant and a
lawyer, not an extension of this one.

## Not authorized

- Ticketing, payment, or any money flow inside Pulso. External redirect
  only, unchanged.
- Editing or deleting someone else's event. An author may edit and delete
  their own (v1.1 widens v1.0's delete-only rule to the author's own events).
- Recurring or series events.
- Self-service venue-ownership verification.
- Promotion, boosting, or paid placement of a created event.
- Any created event on the anonymous surface.
- Notifications for created events beyond what DEC-0016 already authorizes (a followed venue gaining an event applies here too, since a created event at a followed venue is still that venue gaining programming).

## Acceptance criteria

1. A signed-in account can create an event and see it in the connected map, list and search.
2. An anonymous visitor never sees a created event on any surface.
3. An account with a `venue_organizers` row for the chosen venue publishes as `verified_organizer`; any other account publishes as `community`.
4. Origin is visible wherever a created event is shown.
5. The After filter returns events marked as afters and events starting between 02:00 and 06:00 Montréal, including ingested ones.
6. The After filter is absent from the anonymous experience.
7. A created event never receives a DATA-0001 trust label.
8. An author can delete their own created event and no one else's.
