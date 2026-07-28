# DEC-0013 — Groups

**Identifier:** DEC-0013
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0007, DEC-0010, DEC-0011, DEC-0012, UX-0001, PRD-0001, RFC-0001

## Decision

Pulso authorizes groups: a named space with a creator, a member list, and its own discussion feed, independent of any single event. Any signed-in user can create a group (name, optional description) and becomes its first member; anyone can join or leave a group freely — there is no invitation, approval, or ownership-transfer mechanic. A group's feed reuses the same content model already authorized by DEC-0012 v1.1 for the event forum (posts, one level of nested replies, one like per user per post, author-only delete, no editing), applied to a group instead of an event, in a dedicated table rather than a shared abstraction — consistent with the project's existing pattern of one repository per concept (`FriendsRepository`, `ForumRepository`, now `GroupsRepository`) rather than a premature generalization across two otherwise-unrelated content types.

Reading and posting in a group both require a signed-in account, same rationale as DEC-0012: user-generated content has no trust framework comparable to sourced event data, and stays out of anonymous browsing entirely.

## Relationship to prior decisions

DEC-0012 v1.0 explicitly listed group conversations as a non-goal, deferred to its own decision. This is that decision. It follows DEC-0012's UGC posture (account-gated, no moderation queue, no rate limiting, plain text with a length cap) rather than restating it — see Boundaries for anything specific to groups.

## Boundaries

- Membership is open and self-service: joining or leaving a group is a single action with no approval step, no invite code, and no capacity limit. A group has no owner role beyond authorship of the group record itself — the creator has no special moderation power over other members' posts (deletion of a group post follows the same author-only rule as the event forum).
- No group discovery/search surface is built. A user finds a group they already know about (e.g. shared outside Pulso, or surfaced in "Mes groupes" once joined); there is no public directory of all groups to browse.
- No moderation queue, content filtering, or enforcement action exists for group posts, same limit as DEC-0012. The existing reporting mechanism (`content_reports`) is extended to accept group posts as a reportable target type.
- No rate limiting on group creation or posting, same rationale and same explicit deferral as DEC-0012.
- A group cannot be renamed, described differently, deleted, or transferred after creation in this phase — only created, joined, left, and posted in. Lifecycle management (delete a group, edit its name) is deferred as a distinct, smaller follow-up rather than blocking this decision on it.

## Non-goals

Does not authorize private/invite-only groups, group roles beyond plain membership (admin, moderator), group-specific notifications, a public group directory, or group deletion/editing. Each remains a distinct future decision if needed.

## Supersession

DEC-0013 narrows PRD-0001 §4's exclusion of social features further, extending the UGC posture already established by DEC-0012 to a new, event-independent content space. It supersedes DEC-0012 v1.0's listing of "group conversations" as a non-goal; DEC-0012 itself is otherwise unchanged. It does not alter DEC-0007, DEC-0010, or DEC-0011's behavior, and does not alter any other Accepted MVP scope or boundary.
