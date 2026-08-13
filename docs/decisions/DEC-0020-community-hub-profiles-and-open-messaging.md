# DEC-0020 — Community Hub, Personal Profiles, and Open Messaging

**Identifier:** DEC-0020
**Version:** 1.0
**Status:** Accepted
**Date:** 2026-08-13
**Dependencies:** PDR-0001, PDR-0002, DEC-0003, DEC-0010, DEC-0011, DEC-0012, DEC-0013, DEC-0016, DEC-0017, UX-0001, PRD-0001, RFC-0001
**Supersedes:** The "no photo upload on a profile" boundary of Phase 4.7 (encoded in `PROFILE_COVER_STYLES`/`PROFILE_AVATAR_STYLES`), and the "amis uniquement" messaging eligibility rule of DEC-0012 — each to the exact extent described below and no further

## Context

The connected experience grew module by module, each one landing as its own
primary navigation entry. The sidebar now carries ten. Four of them —
Forums, Groupes, Messages, Amis — are the same thing from the user's point
of view: other people. Presenting them as four peers makes the product feel
like a list of features rather than a place, and pushes the two entries that
matter most for retention (Messages, Amis) down past two that are browsed
occasionally.

Two further gaps are named by the product owner as direct causes of users
leaving Pulso for Instagram or Snapchat:

1. **The account page is not a person.** It shows presets, derived stats and
   an activity log. There is no face, no friends list, no photo, nothing a
   user would show someone. DEC-0011 built a real friend graph and then gave
   it nowhere to be seen.
2. **Messaging is a destination, not a channel.** It lives on one full-page
   section reachable only from the nav, and it can only ever be used with an
   account already accepted as a friend. A user who wants to say one thing
   to someone they just met at an event cannot, so they exchange Instagram
   handles instead — and the conversation, along with every future one,
   leaves Pulso permanently.

## Decision

### 1. A single "Communauté" section

Forums, Groupes, Messages and Amis stop being four primary navigation
entries and become four sub-sections of one primary entry, **Communauté**.
The sidebar goes from ten entries to seven.

This is a regrouping, not a rewrite: each sub-section keeps its current
behaviour, routes, and unread badges. The unread message count, previously
a badge on the Messages entry, is carried up onto the Communauté entry so
that no signal is lost by the regrouping.

### 2. Profile photos, and photos as content

Pulso may now store user-uploaded images in two new places, both reusing
the existing multipart-to-local-disk mechanism already serving event
covers (DEC-0017), venue photos (DEC-0019), group photos (DEC-0013 v1.3)
and event photos (DEC-0012 v1.2). No cloud object store dependency is
introduced by this decision either.

- **A profile photo.** A user may upload one photo, which overrides the
  Google avatar everywhere their own avatar appears. The gradient/emoji
  presets of Phase 4.7 are *kept*, not removed: they remain the fallback
  and the choice for a user who does not want to upload a face. The
  ordering is explicit — uploaded photo, then chosen preset, then Google
  avatar, then initial.
- **A personal photo gallery.** A user may post photos to their own
  profile, shown as a grid. This is a gallery, not a social feed: photos
  appear on their author's profile and nowhere else. There is no
  chronological fil of other people's posts, no like, no comment, and no
  notification of any kind attached to a gallery photo.

A gallery photo may optionally reference one event or one venue the photo
was taken at, so a photo can be read as "this person, at this place". That
reference is a link, not a publication: it does not make the photo appear
on the event or venue page, which keeps its own separate photo set.

### 3. The profile becomes a person

The profile page gains three sections beyond today's five tabs:

- **Amis** — the user's accepted friends, with their avatars, already
  present in the data model since DEC-0011 and never displayed on a profile.
- **Lieux suivis** — the venues the account has favorited. These already
  live server-side in `user_favorite_venues`, which is what DEC-0016 §1's
  "new event at a followed venue" notification fans out from; no new follow
  concept is introduced, the existing one is simply displayed for the first
  time. Anonymous, browser-local favorites (DEC-0007) are not shown: they
  belong to a device, not to a person.
- **Photos** — the gallery of §2.

**Visibility: accepted friends only.** A profile's photo, gallery, friends
list, followed venues and followed events are visible to the account itself
and to its accepted friends, and to nobody else. This preserves DEC-0011's
"private by default" principle unchanged. A non-friend viewing a profile
sees the same minimal card DEC-0011 already authorized — display name,
avatar, bio, member-since — and a way to send a friend request or a message.

### 4. Messaging opens, behind a request gate

DEC-0012's rule that a direct message requires an accepted friendship is
replaced by a **message request** model:

- Any signed-in account may send a first message to any other signed-in
  account.
- Until the recipient accepts, the conversation lives in a separate
  **Demandes** list, not the main inbox, and produces **no notification**
  (DEC-0016's "new direct message" trigger fires only for conversations
  already accepted, or between accepted friends).
- The sender may send **one** message to a pending conversation and no more
  until it is accepted. This is the rate limit: without it, "open messaging"
  means an unrestricted broadcast channel to every account in the product.
- Accepting a request moves the conversation to the main inbox. Declining
  it removes it and blocks further messages from that account.
- An accepted friendship (DEC-0011) continues to grant messaging directly,
  with no request step.

Alongside this, messaging becomes reachable from anywhere in the connected
experience rather than only from its own section: a docked panel available
on every connected screen, and a "message" action wherever another account
is already displayed (a profile, a friends list, an event's participants).

## Boundaries

- **No social feed.** §2 authorizes a gallery on a profile. A chronological
  feed aggregating other people's photos was considered and explicitly
  deferred; the data model is expected to allow it later without migration,
  but nothing in this decision builds, ships, or promises it.
- **No likes or comments on gallery photos.** Forum posts carry likes and
  replies (DEC-0012 v1.1); gallery photos deliberately do not. A like on a
  photo of a person is a different product with different moderation needs.
- **No public profile browsing.** There is no directory of accounts and no
  way to browse strangers' profiles. Discovery of another account remains
  what DEC-0011 established: a friend code, a friend suggestion, or a
  co-participant on an event. This is a deliberate consequence of choosing
  friends-only visibility alongside open messaging — the two combine to
  the "private account" model, where anyone may write to you but nobody may
  read you.
- **No moderation of uploaded profile or gallery photos.** DEC-0012's
  reporting mechanism is extended to cover them — a report remains a
  database row and nothing more. No automated image scanning, no review
  queue, no enforcement. This is a real and knowingly accepted risk of
  allowing face photos, and should be revisited before any public launch.
- **No presence, no typing indicator, no read receipts beyond the existing
  `readAt`.** The docked messaging panel displays only data Pulso actually
  has, consistent with the Phase 4 rule already applied to the Messages page.
- **No push, email or SMS.** DEC-0016 is unchanged: everything stays in-app.
- Every surface built under this decision ships bilingual (DEC-0003). None
  of it may add untranslated French, which the web app's i18n ratchet test
  enforces mechanically.

## Acceptance criteria

1. The connected sidebar shows seven primary entries, one of them
   Communauté, and the unread-message badge appears on it.
2. Forums, Groupes, Messages and Amis are all reachable within Communauté,
   and every existing deep link to them (notifications, event forum, group
   invitations) still lands on the right sub-section.
3. A user can upload, replace and remove a profile photo; removing it falls
   back to the preset, then the Google avatar, then the initial.
4. A user can post and delete photos in their own gallery, and sees a
   friend's gallery on that friend's profile but not a non-friend's.
5. A non-friend's profile exposes no photo gallery, friends list, followed
   venue or followed event.
6. An account with no friendship can send exactly one message to another
   account; the second is refused until the request is accepted.
7. A pending message request creates no notification; an accepted
   conversation does.
8. Declining a request prevents further messages from that account.
9. Messaging is reachable from every connected screen without navigating to
   the Communauté section.
10. The i18n ratchet does not rise for any file touched by this work.
