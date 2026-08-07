# DEC-0015 — Group Operating System and Event Proposals

**Identifier:** DEC-0015  
**Version:** 0.1  
**Status:** Proposed  
**Dependencies:** PDR-0001, PDR-0002, DEC-0010, DEC-0011, DEC-0012, DEC-0013, PRD-0001, RFC-0001

## Problem

Groups are intended to become the main connected-product surface in Pulso. A group must do more than host a conversation: it must help a community decide which events to attend and organize the people, timing, meeting point, attendance and preparation around those outings.

DEC-0013 v1.2 currently authorizes permanent and event-linked groups, open or restricted membership, a creator-moderator limited to join-request approval, and four operational modules: meetup point, schedule, attendance and checklist. It does not authorize configurable modules, multiple staff roles, private/invite-only groups, event proposals, paid targeting, group editing or extended moderation.

This proposal defines those future capabilities for product review. It does not make them Accepted and no production implementation may rely on them until a later accepted version supersedes the relevant DEC-0013 boundaries.

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
- announcements reserved for staff.

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

## Current implementation boundary

Until this proposal is accepted, Pulso continues to enforce DEC-0013 v1.2: open or public-restricted groups, creator-only approval of join requests, no role assignment, no private discovery exclusion, no module configuration, no group editing/deletion, no extended content moderation and no sponsored/event-proposal workflow.
