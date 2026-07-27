# DEC-0010 — User Accounts Phase 1: Account, Favorites Sync, and Trends

**Identifier:** DEC-0010
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0007, UX-0001, PRD-0001, RFC-0001

## Decision

An optional account exists, created and authenticated via Google OAuth 2.0. Creating or connecting an account remains optional: every browsing, search, and Event Details surface continues to work identically with no account, per MVP-0001 and DEC-0007. Signing in stores only what the account itself provides (email, display name, avatar) plus favorites and session state — no separate profile form, no additional personal data collection.

Favorites synchronize with the account exactly as DEC-0007 already anticipated: on first sign-in, local and account favorites are merged as a union by stable ID (event or venue), so neither collection is silently lost. After that merge, favoriting or un-favoriting while signed in writes directly to the account; the local copy stops being the source of truth for that device once merged.

The account surfaces one new derived view: a trends summary showing which event and venue categories the user has favorited most. This is a plain frequency count computed on demand from the account's own favorites — never an inferred, predicted, or machine-learning-based recommendation. It is informational only in this phase: it does not filter, re-rank, or otherwise alter what Explore / Map, search, or any other browsing surface shows.

## Relationship to PRD-0001

PRD-0001 §4 excludes "stored preferences" and "recommendation history or account-history personalization" from the MVP. This decision narrowly authorizes one instance of each, bounded as described above: the "stored preference" is exactly the favorites list DEC-0007 already authorized, now persisted server-side instead of only in local storage, and the "personalization" is a transparent, literal count of that same data with no inference step. PRD-0001's broader exclusions continue to apply in full: this decision does not authorize profiles, a social graph, a forum, direct messaging, friends, follows, participation visibility, notifications, or any promoter-monetization surface. Those remain explicitly out of scope and require their own future decision(s) before any implementation.

## Boundaries

- Account creation is Google OAuth only in this phase; no password storage or email-based auth is introduced.
- Session state is an opaque bearer token, not a cookie; it authenticates API requests and carries no other data.
- Favorites sync applies only to the same two collections DEC-0007 already covers (favorite events, favorite venues) — no new favoritable entity is introduced.
- The trends view reads only the signed-in user's own favorites; it never aggregates or exposes another user's data.
- No feed, browsing surface, or search ranking is altered by trends data in this phase.

## Non-goals

Does not authorize a forum or any per-event discussion space, direct messaging, friends or following, participation visibility, push or email notifications, promoter monetization or event boosting, or any ML-based or inferred recommendation. Each remains a distinct future decision.

## Supersession

DEC-0010 narrows PRD-0001 §4's exclusion of "stored preferences" and "recommendation history or account-history personalization" only to the extent described above. It does not alter DEC-0007's favorites rules, which it implements rather than replaces, and it does not alter any other Accepted MVP scope or boundary.
