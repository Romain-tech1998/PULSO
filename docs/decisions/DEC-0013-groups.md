# DEC-0013 — Groups

**Identifier:** DEC-0013
**Version:** 1.2
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0007, DEC-0010, DEC-0011, DEC-0012, UX-0001, PRD-0001, RFC-0001

## Decision

Pulso authorizes groups: a named space with a creator, a member list, and its own discussion feed, independent of any single event. Any signed-in user can create a group (name, optional description) and becomes its first member; anyone can join or leave a group freely — there is no invitation, approval, or ownership-transfer mechanic. A group's feed reuses the same content model already authorized by DEC-0012 v1.1 for the event forum (posts, one level of nested replies, one like per user per post, author-only delete, no editing), applied to a group instead of an event, in a dedicated table rather than a shared abstraction — consistent with the project's existing pattern of one repository per concept (`FriendsRepository`, `ForumRepository`, now `GroupsRepository`) rather than a premature generalization across two otherwise-unrelated content types.

**v1.1 addendum:** a public group directory ("Découvrir" tab listing all groups, not just the ones a user already knows about or has joined) is now authorized in principle, reversing v1.0's Boundary against one — the product owner confirmed this while reviewing new reference mockups for the connected experience. This is a principle decision only: the directory itself (a `GET /groups` listing endpoint, its UI, and whatever minimal sort/search it needs) is not built yet and is scoped to a future Groups-advanced phase alongside other net-new group mechanics (a meetup point, a schedule/programme, an attendance poll, a checklist) seen in the same mockups. Until that phase ships, group discovery in practice is unchanged from v1.0 (a group shared outside Pulso or found via "Mes groupes").

**v1.2 addendum (Phase 4.10, "Groupes avancés"):** ships the Groups-advanced phase v1.1 flagged as future work, and authorizes two further reversals of v1.0 driven by a new reference mockup and an explicit product goal (large permanent groups as a real advertising surface for clubs/organizers, e.g. a big "Techno Montréal"-style community):

- **Restricted groups**, reversing v1.0's Boundary that membership is always open and self-service. A group now has a `visibility` of `open` (unchanged behavior) or `restricted`. Joining a restricted group creates a pending request instead of immediate membership — same request/approve shape already used for friend requests (DEC-0011), applied to group membership. A restricted group still appears in the "Découvrir" directory (built this phase) with its real member count; only the interactive modules (feed, schedule, attendance, checklist) stay gated until the request is approved.
- **A moderator role**, reversing v1.0's Non-goal against group roles beyond plain membership. Scoped deliberately narrowly: a group's creator (`groups.created_by`, already existing — no new account concept) is its moderator, and the *only* moderator power authorized is accepting or declining join requests for a restricted group. Everything else from v1.0 is unchanged: no content moderation power over other members' posts, no kicking/removing a member, no ownership transfer, no group renaming or deletion.
- **The Groups-advanced modules named in v1.1**: a real meetup point (derived from the linked event's actual venue for event-linked groups — never entered by hand, and simply absent for permanent groups with no event to derive one from), a member-added schedule/programme, a real attendance poll (`yes`/`maybe`/`no`, counted from real member votes, never simulated), and a checklist where each item's `checkedCount`/`totalMembers` reflects real, individual members checking it off for themselves.
- The public directory itself now ships: `GET /groups/discover?scope=permanent|event` — permanent (non-event) groups not yet joined, or every event-linked group regardless of membership, each with real member counts. No group is hidden from discovery for being restricted; restriction only gates participation, not visibility.

Still explicitly excluded, same as v1.0/v1.1: fake online-presence indicators (no realtime infrastructure exists anywhere in Pulso), group renaming/deletion, and any moderation power beyond the one narrow approval action above.

Reading and posting in a group both require a signed-in account, same rationale as DEC-0012: user-generated content has no trust framework comparable to sourced event data, and stays out of anonymous browsing entirely.

## Relationship to prior decisions

DEC-0012 v1.0 explicitly listed group conversations as a non-goal, deferred to its own decision. This is that decision. It follows DEC-0012's UGC posture (account-gated, no moderation queue, no rate limiting, plain text with a length cap) rather than restating it — see Boundaries for anything specific to groups.

## Boundaries

- (Superseded by the v1.2 addendum above for restricted groups.) Membership was open and self-service in v1.0/v1.1: joining or leaving an `open` group is still a single action with no approval step. A `restricted` group now requires the creator's approval, via the same request/approve shape as friend requests. No capacity limit either way.
- (Superseded by the v1.2 addendum for the one narrow moderator power.) A group still has no owner role beyond authorship of the group record itself, except: the creator alone can approve/decline join requests for a restricted group. The creator still has no special moderation power over other members' posts (deletion of a group post follows the same author-only rule as the event forum), and no power to remove a member.
- (Superseded by the v1.2 addendum — the directory is now built, not just approved in principle.) `GET /groups/discover` lists permanent groups not yet joined and every event-linked group, real member counts, no fabricated data.
- No moderation queue, content filtering, or enforcement action exists for group posts, same limit as DEC-0012. The existing reporting mechanism (`content_reports`) is extended to accept group posts as a reportable target type. The public directory (v1.2) makes this more, not less, important now that it's live: unlike "Mes groupes" (already-joined groups only), the directory surfaces group names/descriptions to people who haven't joined yet.
- No rate limiting on group creation or posting, same rationale and same explicit deferral as DEC-0012.
- A group cannot be renamed, described differently, deleted, or transferred after creation in this phase — only created, joined, left, and posted in. Lifecycle management (delete a group, edit its name) is deferred as a distinct, smaller follow-up rather than blocking this decision on it.

## Non-goals

Does not authorize group-specific notifications, group deletion/editing, kicking/removing a member, or any content-moderation power beyond the author-only post delete already established. Each remains a distinct future decision if needed. (Private/invite-only-style restricted groups and a narrow moderator role were non-goals through v1.1; v1.2 authorizes both — see the addendum. A public group directory was a non-goal in v1.0; v1.1 authorized it in principle and v1.2 ships it.)

## Supersession

DEC-0013 narrows PRD-0001 §4's exclusion of social features further, extending the UGC posture already established by DEC-0012 to a new, event-independent content space. It supersedes DEC-0012 v1.0's listing of "group conversations" as a non-goal; DEC-0012 itself is otherwise unchanged. v1.1 superseded its own v1.0 Boundary/Non-goal against a public group directory, in principle only. v1.2 ships that directory, and further supersedes v1.0's Boundary/Non-goal against restricted (non-open) groups and against any group role beyond plain membership — the latter authorized only as narrowly as described above (join-request approval, nothing else). None of this alters DEC-0007, DEC-0010, or DEC-0011's behavior, or any other Accepted MVP scope or boundary.
