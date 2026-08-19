# DEC-0025 — Group Conversations in Messaging

**Identifier:** DEC-0025
**Version:** 1.1
**Status:** Accepted
**Date:** 2026-08-19
**Dependencies:** PDR-0001, PDR-0002, DEC-0011, DEC-0012, DEC-0013, DEC-0020, DEC-0024, PRD-0001, RFC-0001
**Supersedes:** nothing. It replaces the one-to-one shape of DEC-0012's `messages` with a model that contains it.

## Context

Pulso's messaging has been strictly one-to-one since DEC-0012: `messages`
carries a sender and a recipient and nothing else. DEC-0020 opened it to
non-friends behind a request gate, for a reason worth repeating here, because
it is the same reason as this document's — *"a user who met someone at an
event could not say one thing to them inside Pulso, so they exchanged
Instagram handles and every future conversation left the product."*

Four friends going to the same night out are in exactly that position today.
They can each message the others one by one, or they can open a group chat
somewhere else. They open it somewhere else.

The product owner's framing, recorded because it decides the scope: this is
**not a central axis and will not be promoted**. It exists so that the codes
people already use every day — Instagram, Facebook — carry over, and so the
app feels intuitive because it behaves the way they expect. Getting people to
come is the easy part; the challenge is having them stay and use Pulso daily.
A coordination need that Pulso cannot serve is a reason to open another app,
and an app that gets opened for the group chat gets opened for the rest too.

DEC-0024 settled where event talk lives: the forum. Groups (DEC-0013) stay for
friend circles and durable organisation. This document is the third thing, and
it must not become a fourth place to discuss an event: it is a private room
between people, about whatever they like, that happens to be inside Pulso.

## Decision

### 1. One model, not two

A conversation is a room with participants. A one-to-one exchange is a room
with two of them, and it is the *same* room type, the same table, the same
read path.

The alternative — group chat added beside the existing one-to-one — forks
every read, every unread count, every notification and every inbox query in
the product, permanently, so that the second participant of a pair and the
fifth participant of a room can be told apart for no reason a user would ever
notice. Existing messages are migrated into the new shape rather than left in
the old one.

### 2. Read state belongs to the participant, not to the message

`messages.read_at` cannot describe a room: in a group, "read" is true of some
people and false of others at the same instant. Each participant carries their
own `last_read_at`, and what is unread is what arrived after it.

This also makes the unread count a comparison rather than a write per message,
which is what lets an inbox of many rooms be answered in one query.

### 3. Who may be added

Only accounts the person adding could already message without a request — a
friend, or someone who accepted their request (DEC-0020).

Without that rule a group invitation is a way to put a message in a stranger's
inbox while stepping around the gate DEC-0020 built, and the gate exists
precisely so the inbox is not a broadcast target. Anyone may add someone they
could already write to; nobody may use a room to reach someone they could not.

### 4. Flat, with no hierarchy

No owner, no administrator, no permissions. Anyone in a room may add someone
they could message, and anyone may leave.

This is the model people already know, and it is the one that needs no
moderation design. An owner role would immediately raise what happens when the
owner leaves, who inherits, and who can remove whom — a set of questions worth
answering for a durable Group (DEC-0013) and not for four people deciding where
to meet.

### 5. Leaving, and what stays

Leaving stops delivery and removes the room from that account's inbox. The
messages they wrote stay: they belong to the conversation everyone else is
still reading, not to a membership. A room whose participants fall below two is
closed and reachable by nobody.

Somebody who left is not re-added silently: adding them back is an invitation
like any other, and it is subject to §3.

### 6. A cap, and what it is for

Twenty participants. Not a technical limit — a statement about what this is.
Coordination among people who know each other is what the model is designed
for; past a certain size a room becomes an audience, and an audience needs
moderation, roles and reporting rules that DEC-0013 already spent a document
on. Anyone who needs more than twenty needs a Group.

### 7. Reporting

DEC-0012's reporting targets a message and its author, which works unchanged in
a room. A report never removes the room for the other participants, and never
tells the room a report was made.

### 8. One notification per room, not one per message

A room notifies a participant when something arrives in it, and stays quiet
until they have read it. Eight people talking on a Friday would otherwise
produce seven notifications a sentence, and the first thing anybody does about
an avalanche is silence the source — which, for a feature whose entire purpose
is that people stay, would be the exact opposite of the point.

Muting is the participant's own switch on top of that, and it is theirs alone:
nobody is told a room was muted, and muting changes nothing about what the
others receive.

### 9. What a conversation carries

Four things beyond its messages, decided together because they are one thing —
a messaging surface people can live in rather than tolerate — and buildable
once each because §1 made a pair and a room the same object.

- **Search**, inside the rooms the reader is in and never across the product.
  It uses the same accent-flattening as the rest of Pulso, so *soiree* finds
  *soirée*.
- **Attachments**, screened by DEC-0021 before they are readable by anyone. A
  file that fails screening is never stored, so an attachment that exists is
  an attachment that passed. Messaging gets no exemption: DEC-0021's whole
  premise is that Pulso does not serve an unscreened image from its own domain,
  and a private room is still Pulso's domain.
- **Mute** and **pin**, both belonging to the participant rather than the room.
  Muting is a choice about one's own attention and pinning is an ordering of
  one's own inbox; neither is visible to anyone else, and neither changes what
  anybody receives.

## Not authorized

- Adding an account the adder could not already message directly.
- Read receipts shown to other participants. Read state exists to count what is
  unread for its owner, not to tell anyone else when they were seen.
- Owner, admin or moderator roles inside a conversation.
- Removing another participant. Anyone may leave; nobody may be ejected.
- Creating a conversation from an event page, or any surface that would make
  this a second place to discuss an event — the forum owns that (DEC-0024).
- Promoting the feature in onboarding, navigation or empty states. It is
  present for whoever needs it, not advertised.
- More than twenty participants.
- Any notification a rename or an add can generate beyond the ordinary one for
  a new message.
- Telling anyone that a room was muted, pinned, or searched.
- Search across conversations the reader is not in, under any circumstance.
- An attachment served before DEC-0021 has screened it.

## Acceptance criteria

1. Every existing one-to-one exchange is readable, unchanged, as a two-person
   conversation after the migration, with its history and its order intact.
2. A message sent to a room reaches every participant and nobody else.
3. Unread counts are per participant: reading a room clears it for the reader
   and for nobody else.
4. Adding an account the adder could not message directly is refused.
5. Someone who leaves stops receiving messages, keeps their sent messages
   visible to the others, and no longer sees the room.
6. A room that falls below two participants is unreachable.
7. A twenty-first participant is refused.
8. A report from inside a room reaches the same queue as any other, and changes
   nothing about the room.
9. A room that already has an unread notification for a participant does not
   produce a second one until they have read it.
10. A muted room still receives and still counts as unread; it notifies nobody.
11. Search returns matches only from rooms the searcher is a participant of.
12. An attachment refused by DEC-0021 is never stored and never served.
