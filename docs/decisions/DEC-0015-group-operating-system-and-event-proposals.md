# DEC-0015 — Group Operating System and Event Proposals

**Identifier:** DEC-0015  
**Version:** 1.1  
**Status:** Accepted  
**Dependencies:** PDR-0001, PDR-0002, DEC-0010, DEC-0011, DEC-0012, DEC-0013, PRD-0001, RFC-0001

## Problem

Groups are intended to become the main connected-product surface in Pulso. A group must do more than host a conversation: it must help a community decide which events to attend and organize the people, timing, meeting point, attendance and preparation around those outings.

DEC-0013 v1.2 currently authorizes permanent and event-linked groups, open or restricted membership, a creator-moderator limited to join-request approval, and four operational modules: meetup point, schedule, attendance and checklist. It does not authorize configurable modules, multiple staff roles, private/invite-only groups, event proposals, paid targeting, group editing or extended moderation.

This decision officially authorizes these future capabilities and makes them part of the active product implementation, superseding the relevant DEC-0013 boundaries.

## Product model proposed

### Group types

1. **Community group** — permanent and topic-led, for example “Français à Montréal”, “Techno Montréal” or “Sorties queer Montréal”.
2. **Event group** — attached to one Pulso event and optimized for a single outing.
3. **Private crew** — invite-only spontaneous group for friends or a small circle. It appears only in “Mes groupes” for its members and never in public discovery.

The type is explicit at creation and controls the recommended starter layout, not a separate content model.

### Visibility and entry

- `public_open`: visible in discovery; immediate membership.
- `public_approval`: visible in discovery; membership requires approval.
- `private_invite`: absent from discovery; entry by invitation only.

Restricted visibility and membership approval must remain distinct concepts. A group may be publicly understandable without exposing its operational content.

### Roles

- **Creator/owner:** controls the group lifecycle and can assign staff roles.
- **Administrator:** configures access, roles, modules and event proposals.
- **Organizer:** manages the programme, polls, checklist, meeting point and selected events.
- **Moderator:** manages membership and reported group content.
- **Member:** reads, participates, votes and proposes events when the group permits it.

Permissions must be capability-based rather than inferred from labels. Every administrative action requires a server-side authorization check and an audit record.

## Modular group workspace

The group home becomes an ordered module registry. Discussion remains a core surface; the following modules can be enabled, disabled and reordered by authorized staff:

- featured or next event;
- candidate event proposals;
- shared programme;
- attendance poll;
- meetup point;
- checklist;
- members;
- group discussion;
- join-request queue;
- announcements reserved for staff;
- ride coordination (carpool/transit for distant venues);
- expense split (lightweight bill tracker for group tickets/pre-drinks);
- static check-ins (temporary "where are you" manual location sharing);
- pre/after party meetup points;
- shared photo gallery (post-event memories);
- vibe and dress code inspiration.

Each group type receives a sensible template. A community group starts with proposed events, next event, announcements, members and discussion. An event group starts with attendance, programme, meetup point, checklist and discussion. A private crew starts with proposals, attendance, checklist and discussion.

Module configuration must be stored as ordered group configuration, not as browser-only preferences. Removing a module from the layout hides it but does not silently destroy its data.

## Event proposal lifecycle

An event proposal is a first-class link between a group and an existing Pulso event.

1. A member, staff member or Pulso partner proposes an existing event.
2. The proposal records its source: `member`, `staff`, `pulso_recommendation` or `sponsored`.
3. Group staff can approve, decline, schedule for later review or pin it as the group’s next event.
4. Members can express `interested`, `going` or `not_interested` and discuss the proposal.
5. An approved proposal can populate the programme, attendance and meetup modules without duplicating the event record.
6. Ticket access remains an external redirect in the MVP-compatible architecture; Pulso never handles payment or tickets directly.

An event can be proposed to several groups without creating duplicate events. The relationship stores group-specific state while the canonical event information continues to come from the event directory.

## Future monetization principles

Paid event distribution targets eligible groups, but must preserve group trust:

- sponsored proposals are always labelled explicitly;
- group owners opt in to receiving commercial proposals;
- sponsored events enter a proposal inbox and are not automatically pinned or presented as a staff recommendation;
- staff can reject a proposal without penalty;
- targeting uses declared group topic, location and event-category fit, not private messages;
- frequency caps prevent a group from becoming an advertising feed;
- reporting separates delivery, staff approval, member interest, external ticket clicks and affiliate conversion when available;
- organic and sponsored ranking remain distinguishable.

The proposed commercial unit is therefore an **event proposal to a relevant community**, not a banner advertisement and not an automatic post in the group conversation.

## Proposed management interface

The management workspace contains:

1. **Overview:** membership, pending requests, module health and next planned event.
2. **Access:** visibility, join method and invitations.
3. **Team:** role assignment and capability matrix.
4. **Modules:** enable, disable and reorder the group workspace.
5. **Event inbox:** organic, Pulso-recommended and sponsored proposals with approve/decline actions.
6. **Safety:** reports and moderation actions, if separately approved.
7. **Commercial settings:** sponsorship opt-in and reporting, when monetization is approved.

## Required data and API work if accepted

- group type and `private_invite` visibility;
- group-role and capability tables;
- ordered group-module configuration;
- event-proposal records, source, moderation state and member responses;
- staff audit log;
- invitation lifecycle;
- group update and lifecycle routes;
- sponsored-proposal disclosure and measurement fields;
- privacy tests ensuring private groups never enter discovery.

## Delivery sequence proposed

### Phase A — Group foundations

Private crews, editable group profile, roles, capability checks and invitations.

### Phase B — Configurable organization

Module registry, templates, enable/disable/reorder controls and persistent layouts.

### Phase C — Event proposals

Organic member/staff proposals, approval workflow, member interest and promotion to the active outing.

### Phase D — Commercial pilot

Opt-in sponsored proposal inbox, explicit labels, relevance controls, frequency caps and measurement. Start with a limited Montréal organizer pilot.

## Open decisions before acceptance

- Whether the creator may transfer ownership or delete the group.
- Whether moderators may remove posts or members, and what appeal/reporting flow applies.
- Whether members may propose events by default or only when enabled.
- Whether one or several events may be “active” simultaneously.
- Commercial eligibility thresholds and the revenue model for group owners, if any.
- Retention and deletion rules for private groups, audit logs and declined proposals.
- Whether to restrict certain advanced modules (e.g. expense split) to private crews rather than large community groups.
- Moderation, privacy, and storage limits for UGC in the shared photo gallery.

## v1.1 addendum — what was actually built, and where it departs from v1.0

v1.0 was a proposal written before any of it existed. This addendum records what shipped, and is explicit about the three places the built product deliberately differs from the plan.

### The module registry is four modules, not sixteen

v1.0 lists sixteen modules. The registry contains **four**: programme, attendance, meetup point, checklist. This is a deliberate narrowing, not an oversight.

A switch that turns nothing on is worse than no switch, because it promises a capability Pulso does not have. Ride coordination, expense splitting, static check-ins, pre/after-party meetups, the shared photo gallery and vibe inspiration were never built — their tables exist from an earlier migration but no code has ever read or written them. They return to the registry when they are real. (Expense splitting in particular is a product of its own; v1.0's own open questions already doubted it belonged here.)

Three of v1.0's names are absent for the opposite reason — they are not optional and so are not configurable: **discussion** is a core surface v1.0 itself keeps out of the configurable set, **members** is what a group *is*, and the **join-request queue** exists only for a restricted group, where it is never unwanted. **Announcements** became a staff-only channel under DEC-0013 v1.3, configured with the other threads rather than as a module. **Event proposals** and **next event** are not built as member-facing modules; see the commercial section below for what shipped instead.

Enabling, disabling and reordering the four is a moderator action, stored as ordered group configuration exactly as v1.0 requires. Disabling hides a module and never destroys its data. Because `modules_config` is jsonb and predates this registry, stored layouts are normalised on read — unknown names dropped, missing modules appended disabled, positions renumbered — so a row written against the old sixteen-name registry can neither reach the interface nor make a group uneditable.

### Operational modules belong to an outing, not to the group

v1.0 says an approved proposal "can populate the programme, attendance and meetup modules" without saying what those modules are attached to. Built naively, they hung off the group, which made them singletons: a community that goes out weekly opened week two on week one's schedule, week one's votes and week one's checklist, with no way to start fresh short of deleting every row by hand. A permanent group became unusable at exactly the moment it proved it was worth keeping.

A group therefore has exactly one **current outing** — enforced by a partial unique index, not assumed — and the programme, attendance and checklist describe it. Starting another archives the previous one, which stays readable rather than being destroyed. Attendance is keyed on `(outing_id, user_id)`: keyed on the group, a member could never answer a second outing at all.

### The commercial pilot shipped before the organic proposal flow

v1.0's delivery sequence puts organic event proposals (Phase C) before the commercial pilot (Phase D). The reverse happened, on the product owner's explicit direction: the paid placement is the reason groups are being built, and the organic proposal flow is a larger piece of work that would have delayed proving the business model.

What exists is a **placement**, narrower than v1.0's proposal lifecycle: a Pulso administrator places a bought event at the top of a chosen group's workspace. There is no member-proposal path, no approve/decline queue, and no `interested`/`going` response on the placement itself — a group that wants to act on one starts an outing from it, which is what connects a banner to something actually organised.

Every trust rule from v1.0's monetization principles is enforced rather than assumed:

- the banner is labelled `Sponsorisé · {payer}` in plain words and is never presented as a staff recommendation;
- the group's own moderator can take it down, and the dismissal is **recorded rather than deleted**, which is what turns "staff can reject a proposal without penalty" into something measurable;
- there is **no self-serve route**. Placements are created by an administrator only, because a path that let a venue place its own banner would be an unpriced way into every community on Pulso. The sale happens outside the product.
- a private crew is never offered as inventory — it is invisible by design;
- a placement with no explicit end date stops showing when its event starts.

The payer's name is typed by the administrator rather than derived from the event's organizer field: the payer and the listed organizer are not always the same name, and a banner has to say who actually paid for it.

Reporting is limited to what is real: which groups received a placement, their member count, and whether the group has since pulled it. No impression or click counting exists, so none is shown. v1.0's fuller measurement (delivery, member interest, external ticket clicks, affiliate conversion) and its frequency caps remain unbuilt, and must not be claimed to a buyer.

### Still not built

Roles beyond the creator-moderator (administrator, organizer, moderator as distinct capabilities), the capability matrix, the staff audit log, invitations, group renaming and deletion, ownership transfer, and the organic event-proposal lifecycle. v1.0's open decisions remain open.

## Current implementation boundary

This proposal is now **Accepted**. The development of the modular group workspace, roles, event proposals, and the additional modules (carpool, expenses, etc.) is authorized for the current implementation phase. See the v1.1 addendum above for what has actually been built and the three points on which it departs from this plan.
