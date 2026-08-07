# DEC-0018 — Organizer accounts and administration

**Version:** 1.0  
**Status:** Accepted  
**Date:** 2026-08-06  
**Depends on:** DEC-0010, DEC-0014, DEC-0016, DEC-0017  
**Extends:** DEC-0017 v1.1, which created `venue_organizers` rows "by a Pulso operator after an out-of-band check" with no product surface at all

## Context

DEC-0017 authorized two publishing tiers — `verified_organizer` and `community` — but gave the verified one no way to exist: a row had to be inserted by hand in the database. A venue that wants to list its own nights has no way to ask, and Pulso has no way to answer.

## Decision

Pulso adds an **organizer request** and an **administration console**.

Any signed-in account may request to become the verified organizer of one existing Pulso venue. A Pulso administrator approves or declines. Approval creates the `venue_organizers` row DEC-0017 already defined; nothing else about the two publishing tiers changes.

### Administrators

An administrator is an account with `users.is_admin`. The flag is set directly in the database, never through the product — an escalation path that can be triggered from the interface is a privilege-escalation surface, and Pulso has exactly one administrator today.

Administrators see an **Administration** destination containing the pending-request queue. Nothing else is granted: no moderation powers, no impersonation, no access to messages or forum content. Those need their own decision.

### Notification, not email

A new request notifies every administrator through the in-app notifications DEC-0016 already ships, and an approval or refusal notifies the requester the same way.

Email is deliberately not used. It requires a sending provider, a verified domain and SPF/DKIM, none of which exist before deployment; and an email cannot approve anything — it can only ask the administrator to open Pulso, which the unread badge already does. Email may later be added as a reminder pointing at this console, not as a replacement for it.

### What a verified organizer gains

- Publishing at that venue as `verified_organizer` rather than `community` (DEC-0017, unchanged).
- **Attaching a created event to their venue** instead of creating a new location for it, so their nights accumulate on the venue's own page rather than scattering across duplicate places.

### Requests

- One pending request per account and venue. A refused request may be resubmitted; an approved one is not a request any more.
- A request carries a free-text justification supplied by the requester. Pulso stores it and shows it to the administrator; it verifies nothing on its own.
- Refusal carries no reason field. A structured reason implies an appeals process that does not exist.

## Not authorized

- Self-service verification, or any automated ownership check. Approval stays a human judgement.
- Granting or revoking `is_admin` from the interface.
- Organizer control over a venue's identity, address, coordinates, or category — those remain sourced data (DEC-0014). Editorial customization of a venue page is a distinct future decision.
- Any moderation, impersonation, or content-access power for administrators.
- Email, SMS or push delivery.
- Transferring an organizer link between accounts.

## Acceptance criteria

1. A signed-in account can request organizer status for exactly one existing venue at a time.
2. A second pending request for the same venue by the same account is refused.
3. Every administrator receives a notification when a request is created.
4. A non-administrator receives 403 on every administration route, and never sees the destination.
5. Approving creates the `venue_organizers` row and notifies the requester.
6. After approval, the account publishes at that venue as `verified_organizer`.
7. A verified organizer can attach a created event to their venue instead of a new one.
8. Declining notifies the requester and leaves no organizer link.
9. Nothing in this decision sends anything outside Pulso.
