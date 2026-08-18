# DEC-0022 — Native Ticketing, Wallet Passes, and Address Disclosure on Approval

**Identifier:** DEC-0022
**Version:** 1.1
**Status:** Accepted
**Date:** 2026-08-15
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0010, DEC-0011, DEC-0016, DEC-0017, DEC-0018, DEC-0020, DEC-0021, UX-0001, PRD-0001, RFC-0001
**Supersedes:** DEC-0001's exclusion of direct booking and ticket storage, and DEC-0017 v1.1's "Not authorized: Ticketing, payment, or any money flow inside Pulso" — to the exact extent described below and no further

## Context

DEC-0001 placed direct booking and a ticket wallet on the Roadmap, not in the
MVP. DEC-0017 v1.1 went further and refused native ticketing outright, for
reasons that were never documentary: a payment processor and its PCI scope,
GST/QST collection and remittance, Québec's consumer-protection rules on
ticket sales, organizer payouts with the KYC/AML that implies, and liability
for refunds, chargebacks and cancellations. It closed by saying the subject
"requires its own decision, taken with an accountant and a lawyer, not an
extension of this one."

This is that decision, and it does not pretend the accountant and the lawyer
have spoken. It authorizes the *construction* of native ticketing in Stripe
**test mode only**, and makes the switch to live keys a separate gate that
this document explicitly does not open (§8).

Two other things make now the right moment.

First, DEC-0017 was extended in code by an addendum the document never
recorded. Migration `0029_event_creation_and_after.sql` carries columns
annotated "DEC-0017 v1.2" — `address_hidden` and `pinned` — while the accepted
document stops at v1.1. The behaviour exists, the decision does not.

Second, that behaviour does not work. `address_hidden` was meant to let an
organizer withhold the street line of a private after. The repository selects
`v.address` and returns it unconditionally (the `address: row.address` in
`toPublicEvent`); only `explore-map.tsx` declines to render it. The exact
address of every "hidden" event is one unauthenticated HTTP request away, and
the exact pin is returned alongside it. A guarantee enforced only by the
interface that draws it is not a guarantee — the same mistake DEC-0020
corrected for the friends-only gallery by pushing the check into SQL and
passing the viewer as an explicit argument.

## Decision

Pulso sells tickets for events created on Pulso, issues them as scannable
passes, and lets an organizer withhold the exact location of their event until
they have approved the person asking.

### 1. Stripe Connect Express — Pulso is not the merchant of record

Money flows through **Stripe Connect Express** with **direct charges** on the
connected account and an `application_fee_amount` for Pulso.

This is the structural choice of the whole document. On direct charges the
connected account — the organizer — is the merchant of record: it is named on
the cardholder's statement, it owes the refund, it carries the chargeback, and
Stripe performs its KYC/AML during onboarding. Pulso is a platform that takes a
fee. The alternative (destination charges) would make Pulso the merchant of
record for every ticket sold by every organizer in Montréal, which is the
business DEC-0017 declined to enter.

Consequences accepted deliberately:

- **An organizer cannot publish a paid event until their Connect account
  reports `charges_enabled`.** Refusal, not a broken checkout — the same
  principle as DEC-0017 v1.1's geocoder, where an event Pulso cannot place is
  not published rather than published with a guessed pin.
- **Pulso never handles card data.** Checkout is a Stripe-hosted Checkout
  Session, on web and on mobile alike. No PAN, no CVC, no cardholder field ever
  reaches a Pulso process, a Pulso log, or a Pulso table.
- **Pulso does not compute, collect or remit sales tax on a ticket.** The
  organizer sets the price and answers for its tax treatment. Pulso's own
  commission is Pulso's revenue and its treatment belongs to the accountant,
  before live mode and not after.
- **Refunds are the organizer's action** on their own connected account. Pulso
  exposes the control to the organizer and records the outcome. Pulso staff
  cannot refund on an organizer's behalf.

Amounts are integer minor units in CAD. No float ever represents money.

### 2. Ticket types, orders and tickets

Three concepts, deliberately distinct:

- a **ticket type** belongs to an event and carries a name, a unit price
  (possibly zero), a quantity, a sales window and a per-account limit;
- an **order** is one purchase attempt by one account, and holds the Stripe
  Checkout Session and payment intent when there is one;
- a **ticket** is one admittance, held by one account, in exactly one state:
  `valid`, `used`, `refunded` or `cancelled`.

A ticket type priced at zero issues real tickets through the same objects and
the same QR, with no Stripe involvement at all. Free events get the pass, the
scan and the door control without Pulso touching money — and that is what makes
the ticketing system useful before live mode is ever enabled.

Quantity is enforced when the ticket is issued, not when checkout opens.
Overselling is prevented in the database, not by an interface that counted.

### 3. The QR is a signature, not an identifier

A ticket's QR encodes a payload signed server-side (ticket id, event id, issue
time) with a secret that never leaves the API. A ticket id alone would be a
bearer token guessable by enumeration and forgeable by anyone who has seen one.

**Redemption is authoritative server-side.** A scanner may verify a signature
offline and admit on that basis, but only the server can decide that a ticket
has already been used, so a scan made offline is recorded as unconfirmed until
it syncs. Pulso says which of the two happened rather than implying a
double-use check it did not perform.

Scanning lives in the existing **Organisateur** workspace (DEC-0017 v1.1). A
ticket that cannot be checked at the door is not a ticket.

### 4. Wallet passes behind a provider interface

Apple Wallet and Google Wallet sit behind a `WalletPassProvider`, the same
shape DEC-0021 used for `ImageModerationProvider`, with no provider configured
by default.

- The **Pulso in-app ticket and its QR are the ticket.** Wallet is an export,
  never the system of record.
- An "Add to Wallet" affordance appears **only** where a provider is actually
  configured. A control that produces a broken pass is worse than no control.
- A provider outage, a missing certificate or an expired credential never
  invalidates a ticket, never blocks a purchase, and never blocks entry. The QR
  stays valid on its own.

Real Apple passes need an Apple Developer Program membership and a Pass Type ID
certificate; Google Wallet needs a validated issuer account. Neither exists
today, and neither is a prerequisite to any acceptance criterion here.

### 5. Placing the event on the map, at creation

DEC-0017 v1.1 already resolves a typed address to coordinates server-side and
refuses publication when resolution fails. That stays.

What this document adds is an explicit **confirmation step**: the organizer
sees the resolved pin on a map and either accepts it or moves it.

Moving the pin is not the fabrication EVENT-002 forbids. That rule binds
*Pulso* — Pulso may not invent a coordinate it does not have. An organizer
stating where their own event takes place is the most authoritative source that
will ever exist for that event, and a geocoder that lands on the wrong side of
a block is a worse pin than the one the organizer drops.

Publication still requires a resolved point. A confirmed pin is required for a
paid event and for any event using §6.

### 6. Address disclosure on approval

Every created event carries an `address_disclosure` mode, chosen by its
organizer, on paid and free events alike:

- **`public`** — today's behaviour, and the default.
- **`on_approval`** — exact address and exact coordinates are served only to
  the organizer and to approved attendees.

Three rules make it real:

**The approximate point is computed server-side and is deterministic.** A
non-approved viewer receives coordinates offset by roughly 300 m, derived from
the event id so the offset is identical on every request. A random offset
recomputed per call is triangulable: request the same event ten times and the
true point is the centroid. The neighbourhood is legible; the door is not.

**The gate lives in SQL, with the viewer passed as an explicit argument.** Not
in the interface. This is the correction of the `address_hidden` defect
described in Context, and it follows the pattern DEC-0020 established for the
friends-only gallery precisely so that a call site cannot forget it.

**Approval precedes payment.** For a paid event in `on_approval` mode, an
account requests access, the organizer approves, and only then does a
time-limited payment window open with the seat held. Taking money before
deciding whether to admit someone means refunding people you rejected — and on
direct charges the organizer, not Pulso, absorbs the processing fee on every
one of those refunds.

A decline is final for that event: the same account cannot request again.
Approval and decline both notify (DEC-0016). `address_hidden` is migrated into
this model and ceases to exist as a separate flag.

### 7. What a ticket does not do

A ticket admits its holder. It is not transferable, not resellable, and not
convertible into anything else. Nominative transfer, a secondary market and
guest lists are all real organizer needs and all out of scope here: each
carries fraud and identity questions this document has not answered.

### 8. Live mode is a separate gate this document does not open

Everything above is built and exercised against **Stripe test mode**. No live
key is configured, and the process refuses to start with one until:

1. the accountant's review of Pulso's commission and of the organizer's tax
   position is recorded;
2. the lawyer's review of the ticket terms, refund policy and Québec
   consumer-protection obligations is recorded;
3. Pulso's commission rate is a decided number rather than a configurable
   default;
4. Pulso is actually deployed, which no accepted document authorizes yet.

Building against test mode is not a rehearsal of the legal question. It is what
makes the legal question answerable with a working system in front of the
people answering it.

### 9. "Mes sorties" is a destination, not a tab

Tickets and attendance were first built inside the profile's "Mes sorties"
tab, to avoid an eighth entry in a rail DEC-0020 had deliberately cut from ten
to seven, and a ninth profile tab in a row that already hides two of its eight
behind a scroll.

Tested on the real product, that was wrong. A ticket reached by avatar → Mon
compte → Mes sorties → scroll is a ticket nobody finds in a queue at a door,
and the same three levels stood between an account and the events it had said
it was going to.

**Mes sorties** therefore becomes a first-class rail destination, next to
Favoris. This widens DEC-0020's rail to eight entries, knowingly: DEC-0020's
reduction served discoverability, and here it was working against it. The
profile tab stays and renders the same components, so there is one
implementation behind two doors rather than two views that drift.

A ticket also appears immediately where it was claimed, QR open. The claim
response already carries the ticket and its signed token; sending the reader
elsewhere to look for it was discarding what the server had just handed over.

## Not authorized

- Live-mode Stripe keys, and any real money movement, before §8 is satisfied.
- Pulso as merchant of record; destination charges; Pulso-operated payouts.
- Storing card data of any kind, anywhere, in any form.
- Tax computation, collection or remittance by Pulso.
- Refunds initiated by Pulso staff on an organizer's behalf.
- Ticketing on ingested (`directory`) events, which keep the external redirect
  of DEC-0001 unchanged.
- Anonymous purchase. A ticket has a holder, so it has an account.
- An "Add to Wallet" affordance with no configured provider.
- Ticket transfer, resale, or any secondary market.
- Discount codes, dynamic pricing, and seat maps.
- Any exemption from DEC-0021 for event cover photos.
- Any created event, ticketed or not, on the anonymous surface — DEC-0017's
  rule is untouched.

## Acceptance criteria

1. An organizer can connect a Stripe Express account and see its status; a paid
   event cannot be published while `charges_enabled` is false.
2. A completed test-mode checkout issues exactly the tickets paid for, and a
   replayed or duplicated webhook issues no extra ticket.
3. A ticket type priced at zero issues tickets with no Stripe object created.
4. Quantity is never exceeded, including under concurrent checkout.
5. A ticket's QR fails verification if its payload is altered by one byte.
6. A ticket already `used` is refused on a second scan, and a scan performed
   offline is reported as unconfirmed rather than as verified.
7. With no wallet provider configured, tickets work end to end and no "Add to
   Wallet" affordance is rendered anywhere.
8. Creating an event shows the resolved pin and lets the organizer move it; the
   confirmed point is what is stored.
9. For an `on_approval` event, an unapproved caller receives neither the street
   line nor the exact coordinates **from the API**, and the offset point it
   receives is identical across repeated requests.
10. An approved attendee receives the exact address and the exact point;
    revoking approval returns them to the offset point.
11. A declined account cannot re-request access to that event.
12. Both approval and decline produce a notification.
13. No `directory` event exposes any ticketing surface.
14. The process refuses to start if a live-mode Stripe key is configured.
