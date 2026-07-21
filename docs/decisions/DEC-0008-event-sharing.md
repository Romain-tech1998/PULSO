# DEC-0008 — Event Sharing

**Identifier:** DEC-0008
**Version:** 1.1
**Status:** Accepted
**Dependencies:** PDR-0001, MVP-0001, UX-0001, UI-0001

## Decision

A user may share an event from Event Details on web and mobile. Mobile uses the device's native share sheet; web uses the browser's native share sheet when available (`navigator.share`) and falls back to copying the event link to the clipboard otherwise. Sharing sends a Pulso event link only: event identity and a URL that returns the recipient to that event on Pulso. No personal data, account information, or Pulso-internal data beyond the shared event is included.

This is a lightweight utility action on the existing Event Details screen. It does not create a new screen, a social feed, comments, follower relationships, or any community feature. It does not require an account to use or to receive.

## Rationale

Formalizes an already-implemented mobile capability so it is traceable in the documentation set rather than existing only in application code.

## Boundaries

- Sharing content is limited to the event's public identity and a link back to it on Pulso.
- No social network posting integration, message composition beyond the OS share sheet, or analytics on shared content is authorized by this decision.
- This decision does not authorize profiles, followers, comments, likes, or any other social/community feature excluded by MVP-0001 and UI-0001.
- The web clipboard fallback must confirm the copy action to the user in their active language.

## Non-goals

Does not authorize in-app messaging, invitations, referral tracking, or any account-linked sharing history.
