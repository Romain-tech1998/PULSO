# DEC-0007 — Anonymous Favorites Continuity

**Identifier:** DEC-0007
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, UX-0001, PRD-0001, RFC-0001, DEC-0003

## Decision

Favorites are available without an account. A user can add, remove, and consult favorites locally on the current browser or device. This local behavior does not create an anonymous server profile, use fingerprinting, or create a hidden account.

Browsing, manual filters, intelligent search, event previews, and Event Details remain account-free. Saving or consulting a local favorite must not prompt for authentication.

This decision does not independently authorize a new Favorites page, navigation destination, or account surface. Existing Accepted surface decisions continue to govern their presentation.

## Continuity and later account connection

Local favorites may be lost when the user clears local browser or device data. The eventual UX must disclose that limitation clearly.

If a user later chooses to create or connect an account, Pulso must preserve their local favorites. The local and account collections are merged as a union by stable event ID: duplicates are removed and neither collection is silently deleted. Cross-device synchronization is available only after authentication.

The authentication provider and the final presentation of this merge are delegated to a future authentication implementation task. This decision does not approve profiles, stored preferences, account-history personalization, booking, payment, or ticket storage.

## Rationale

The decision preserves Pulso's account-free map exploration while allowing a lightweight local save action. It also keeps a later optional account connection compatible with the user's existing local collection.

## Supersession

DEC-0007 supersedes only earlier Accepted wording that made saving or consulting favorites conditional on authentication. It does not alter other Accepted MVP scope, account boundaries, or external-redirect-only booking rules.
