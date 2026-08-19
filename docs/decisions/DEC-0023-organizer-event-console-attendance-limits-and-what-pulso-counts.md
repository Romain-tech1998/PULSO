# DEC-0023 — The Organizer's Own Event: a Console, an Attendance Limit, and What Pulso Counts

**Identifier:** DEC-0023
**Version:** 1.0
**Status:** Accepted
**Date:** 2026-08-18
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0010, DEC-0011, DEC-0017, DEC-0018, DEC-0020, DEC-0022, UX-0001, PRD-0001, RFC-0001
**Supersedes:** nothing. It extends DEC-0017's event creation and DEC-0022's ticketing with the surface their author looks at afterwards.

## Context

Pulso lets an account create an event, withhold its address until it approves
a reader, and sell tickets for it. It gives that account no way to look at the
result. An organizer opening their own event today gets the visitor's page:
the same card, the same buttons, and — until the fix that prompted this
document — an invitation to request the address they themselves chose to
withhold, which the API then refused as absurd.

That refusal was a symptom of a missing header, and it is fixed. The absence
behind it is not: **there is no organizer-facing view of an event.** Everything
the organizer needs is either scattered (the access queue and the ticketing
panel live in a list row in Organisateur) or missing (how many people said they
were coming, how many opened the page, whether the room is full).

Three requests from the product owner, recorded here before any of them is
built:

1. An event you own should look and behave like an event you own, not like
   someone else's with the controls hidden.
2. Some numbers: how many want to come, how many looked, how many are
   interested.
3. A cap on attendance, and a "complet" badge once it is reached.

Two of those are cheap and one is not, and the difference is the reason this
document exists rather than a branch. `event_attendance` has recorded who said
they were coming since migration 0011, so that count is a `count(*)`. Tickets
already carry issued, valid and used counts (DEC-0022 §2). **Nothing anywhere
records that anyone ever looked at anything.** Adding that is not a feature,
it is the decision to start logging reader behaviour in a product whose account
model (DEC-0020) is deliberately built so that nobody can browse anybody.

## Decision

### 1. An owned event opens into a console, not into the public page

An event whose `created_by_user_id` is the reader opens a distinct surface. It
is not the public record with sections removed, and not a modal on top of it:
the organizer's questions ("is anyone coming, is anyone stuck at the door, is
it full") are not the visitor's questions, and answering both on one page is
what produced a page that answered neither.

The console gathers what already exists and is scattered today — the access
request queue (DEC-0022 §6), the ticket types and the door scanner (§2, §3),
edit and delete — and adds the counts of §2 below. It carries the event's own
identity, so that it reads as *this* event's back office rather than as a
settings screen.

The public page remains reachable from it, unchanged, so an organizer can see
exactly what a visitor sees. That is a link, never the default: the two views
disagree on purpose, and the one you land on should be the one that knows who
you are.

### 2. What Pulso counts for an organizer

Three numbers, and each is defined by what it is allowed to be built from.

**Coming.** `count(*)` over `event_attendance` for the event. The row's
`visibility` (`private` | `friends`, DEC-0011) governs **who may be named**,
never whether they are counted: an aggregate discloses nobody, and an organizer
who cannot see a total cannot plan a room. Names are shown only where DEC-0011
already allows them.

**Ticketed.** Issued, still valid, and admitted, straight from DEC-0022's
tables. These already exist and are already shown at the door; the console is
where they belong the rest of the time.

**Opened.** A count of how many times the event's record was opened. This is
new, and it is the one that has to be built carefully — see §3.

### 3. "How many looked" is a counter, not a log

Pulso counts openings of an event record. It stores, per event and per day, a
number. It stores **no account id, no IP address, no session identifier, no
user agent, and no per-open row**. The increment is a write to a counter; there
is nothing to join it against, and nothing to subpoena.

The price of that is honesty about the number: without an identifier there is
no deduplication, so the same phone opening a record three times counts three
times. The number is therefore labelled **"vues"** (fr) / **"views"** (en) —
a word that counts events, not persons — and never "personnes", "visiteurs"
or "visiteurs uniques". An organizer told "142 personnes ont regardé" when the
truth is "142 ouvertures, some of them the same phone twice" has been handed a
number that flatters. Pulso does not do that.

The alternative — a row per view carrying who and when — would give a truer
number and a behavioural log of every reader in the product. DEC-0020 chose an
account model where profiles are visible to friends only and nobody can browse
anybody; building a per-reader record of what everyone looked at contradicts
the reasoning of that decision, and it would be built for a vanity metric.
Refused.

Counting is server-side, on the record read, and never from the client: a
counter a page can increment is a counter anyone can inflate.

### 4. An attendance limit, for events Pulso hosts

An event created in Pulso may carry an optional attendance limit. Reaching it
closes the "I'm coming" action and shows the event as full, on the record and
on its card.

Three boundaries:

- **Optional, and absent by default.** Most events have no door count, and a
  required limit would make every organizer invent one.
- **Never retroactive.** Lowering the limit below the number already committed
  removes nobody. The event shows as full and stays as it is; the alternative
  is a product that uninvites people, which is not something an interface
  should be able to do by accident.
- **Ticketed events keep counting tickets.** Where DEC-0022 ticket types exist,
  their `quantity` already governs availability and already produces a sold-out
  state. Two caps on one event is two answers to "is there room". The ticket
  quantity wins, and the attendance limit does not apply.

Ingested (`directory`) events never carry a limit: Pulso does not know their
capacity and inventing one would be a claim about somebody else's room.

### 5. An owned event is never withheld from its owner

The address, the exact pin, and every disclosure-gated field are always visible
to `created_by_user_id`, on every surface, and the access-request affordance is
never rendered to them. This is already true in SQL (DEC-0022 §6) and was
already true of the API; it is written here because the one client call that
forgot to say who was asking made it false in the interface for weeks, and a
guarantee that only holds where someone remembered a header is not a guarantee.

## Not authorized

- Any per-reader record of what an account looked at, in any table, for any
  retention period.
- Deduplicated "unique visitors", which cannot be produced without the log
  above.
- Referrer, user-agent, IP or location capture on a record open.
- Showing an organizer the names of attendees beyond what DEC-0011's visibility
  already permits.
- Exporting, selling or sharing any of these counts outside the organizer's own
  console.
- Attendance limits on ingested (`directory`) events.
- Waiting lists, overbooking, or automatic promotion when someone withdraws —
  each is its own decision about what happens to a person who is told no.
- Counting from the client.

## Acceptance criteria

1. An organizer opening an event they created lands on the console, and a
   visitor opening the same event lands on the public record.
2. The console shows the address and the exact pin of an `on_approval` event
   the organizer owns, and renders no access-request affordance.
3. The "coming" count equals the number of `event_attendance` rows, regardless
   of each row's visibility, and no name is shown that DEC-0011 would not show.
4. Opening a record increments the day's counter by one; the stored row carries
   no account, address, session or agent.
5. The interface labels that number "vues" / "views", never "personnes",
   "visiteurs" or "visiteurs uniques".
6. An event at its attendance limit refuses a new "I'm coming" and shows as
   full on both the record and its card.
7. Lowering the limit below the current count evicts nobody and produces no
   notification.
8. An event with ticket types ignores the attendance limit entirely; its
   availability comes from ticket quantity.
9. No `directory` event exposes a console, a limit, or a full state.
10. The counter cannot be moved by a request originating from the browser.
