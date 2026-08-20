# DEC-0024 — Saying Yes in Public, and What Pulso Ranks By

**Identifier:** DEC-0024
**Version:** 1.0
**Status:** Accepted
**Date:** 2026-08-19
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0010, DEC-0011, DEC-0017, DEC-0020, DEC-0022, DEC-0023, UX-0001, PRD-0001, RFC-0001
**Supersedes:** nothing. It adds a third value to DEC-0011's attendance visibility, and answers a question DEC-0023 deliberately left closed.

## Context

Two requests from the product owner, made together and answered together
because the second one is about the first one's data.

The first: "j'y vais" offered two answers — nobody, or my friends — and he
wanted a third, public. That one is small and was built before this document
existed, which is the wrong order; it is recorded here so the reasoning is
somewhere other than a commit message.

The second: he asked to use the DEC-0023 view counter to "mettre en avant
certains best events". That one is not small, and the answer is no — not
because ranking is wrong, but because that number cannot carry it. This
document says what Pulso ranks by instead.

## Decision

### 1. A third answer: public

`event_attendance.visibility` accepts `public` alongside `private` and
`friends`. It means what it says to the person choosing it — *tout le monde
verra que tu participes* — including a reader with no account.

Four boundaries, all of them consequences of not surprising anybody:

- **Per event, never a profile setting.** Saying yes publicly to one night is
  not saying yes to every night, and a switch that applied to all of them
  would be a different, much larger promise.
- **Nothing is migrated.** Every row keeps the visibility it was given under
  the old rules, and `private` remains the default. Widening the set of
  options must never widen anybody's existing exposure.
- **Public is strictly wider than friends, never narrower.** A friend who
  chose public is still named to their friends.
- **The sentence sits where the choice is made.** It is the only one of the
  three that names you to a stranger, and a settings page nobody opens is not
  where that belongs.

### 2. Pulso ranks by attendance, not by views

A discovery surface may order events by how many accounts said they were
going. It may not order them by how many times a record was opened.

The signal is `event_attendance`, which is intentional (somebody pressed a
button), costs an account, and is one row per person. Views are none of those
things.

### 3. Why the view counter cannot rank

DEC-0023 §3 authorised a counter that stores no account, no address, no
session and no row per open. That design is what made counting acceptable, and
it is exactly what disqualifies the result as a ranking input: **with no
identifier there is nothing to deduplicate by, nothing to rate-limit, and no
way to exclude the organizer's own openings.** A loop against `GET /events/:id`
moves the ranking, and nothing in the data can show that it happened.

While the number stays inside the organizer's own console this is harmless —
nobody has an interest in inflating their own dashboard. The moment it decides
who leads a public surface it acquires a commercial value, and something with
a commercial value and no verification will be inflated. The two decisions are
in tension, and the tension resolves in favour of keeping views private.

Two further reasons, independent of anyone acting in bad faith:

- **The loop.** What is featured is seen, and what is seen stays featured.
  Within days the order stops describing the events and describes only what
  was first.
- **Unequal exposure.** Pulso's window slides over seven days, so an event
  tonight and an event in six days have not been listed for the same time. A
  raw total favours whatever has been listed longest — the least urgent thing
  on the page.

None of this makes views useless. It makes them the organizer's feedback,
which is what DEC-0023 scoped them to: *142 ouvertures, 3 personnes viennent*
tells an organizer their listing is seen and does not convince. No ranking
tells them that.

### 4. How the ranking is computed

- **A recent window, not a total.** Attendance recorded in the last 48 hours,
  so the order describes what is being decided now rather than what has been
  listed longest.
- **A floor.** Below **3** attendances in that window an event is not ranked
  at all, and a surface with too few ranked events renders nothing rather than
  a top of noise. Three is a starting value to revisit against real traffic,
  not a law.
- **Deterministic ties.** Equal counts order by start time, then by id, so the
  same data always produces the same page.
- **Never personalised, never inferred.** The order is a count, the way
  `TrendsRepository` is a count. Pulso does not recommend.
- **A full event still ranks**, carrying the Complet state DEC-0023 gave it.
  Hiding what is happening because it is popular would be a stranger answer
  than saying "this is full".

## Not authorized

- Ordering, featuring, boosting or scoring any surface by view counts.
- Exposing view counts outside the organizer's own console (DEC-0023 stands
  unchanged).
- Paid placement, or any ordering an organizer can buy.
- Personalised or inferred ranking of any kind.
- Naming a public attendee anywhere the account did not choose `public` for
  that event.
- A profile-wide attendance visibility setting.

## Acceptance criteria

1. An account can choose private, friends or public per event, and the default
   for a new attendance is private.
2. Existing attendance rows are unchanged by the introduction of `public`.
3. A public attendee is named to a signed-out reader; a private one is named
   to nobody, including the organizer's console.
4. The choice states, at the point of choosing, that public means everyone.
5. The discovery surface orders by attendance recorded in the last 48 hours.
6. An event below the floor does not appear in it, and a surface with too few
   qualifying events renders nothing.
7. Two events with equal counts always appear in the same order.
8. No surface outside the organizer's console reads `event_view_counts`.
