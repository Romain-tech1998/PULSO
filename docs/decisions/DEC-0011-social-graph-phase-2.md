# DEC-0011 — Social Graph Phase 2: Friends and Participation Visibility

**Identifier:** DEC-0011
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0007, DEC-0010, UX-0001, PRD-0001, RFC-0001

## Decision

Pulso authorizes a minimal, mutual social graph between accounts. A user can send a friend request to another account, and the other account can accept or decline it; once accepted, both accounts are friends of each other (not a one-directional follow). Friend discovery is by a short, stable code generated once for each account and visible only to its owner — never by searching or browsing other users' emails or names, which would let one account enumerate or probe for another's existence.

A user can mark themselves as attending an event, separately from favoriting it: a favorite means "this interests me," attendance means "I will be there." Each attendance record carries a visibility flag — `private` by default, or `friends` — and nothing about a user's planned attendance is shared with anyone until they explicitly set that flag to `friends` for that specific event. Event Details shows which of the viewer's own friends (never a stranger, regardless of what visibility they chose) are attending with visibility set to `friends`.

## Relationship to PRD-0001

PRD-0001 §4 excludes "social features" from the MVP outright, and §14 states no "social graph" is included. DEC-0010 already flagged that "friends or following, participation visibility" remained out of its own scope and would need a dedicated decision. This is that decision: it is the first to authorize an actual social graph in Pulso, not an extension of DEC-0010's narrower carve-out for stored preferences.

## Boundaries

- Friendship is mutual only; there is no one-directional follow, and no user directory or search surface is introduced.
- The friend code is a discovery mechanism only — it identifies an account to add, and is never used to imply consent to anything beyond a friend request.
- Attendance visibility defaults to `private` and is never inferred, defaulted to `friends`, or changed by anything other than the account holder's own explicit action.
- "Friends attending" is computed only for the signed-in viewer's own confirmed friends; an anonymous or non-friend viewer sees nothing.
- No notification is sent for a friend request, an accepted request, or a friend's attendance — this decision covers the data and its display, not delivery to anyone.

## Non-goals

Does not authorize a public or searchable user directory, one-directional following, group or event-scoped chat, direct messaging between friends, a forum or any per-event discussion space, or any push/email notification triggered by social activity. Each remains a distinct future decision. Following an event or venue (as opposed to a friend) also remains out of scope: without a notification system to attach it to, it would be functionally identical to an existing favorite, so it is deferred until notifications are actually built rather than introduced as a redundant relation now.

## Supersession

DEC-0011 narrows PRD-0001 §4/§14's exclusion of social features and a social graph only to the extent described above. It does not alter DEC-0007's or DEC-0010's favorites/trends behavior, and does not alter any other Accepted MVP scope or boundary.
