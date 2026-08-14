# DEC-0016 — In-app notifications

**Version:** 1.0  
**Status:** Accepted  
**Date:** 2026-08-06  
**Depends on:** DEC-0010, DEC-0011, DEC-0012, DEC-0014  
**Supersedes:** The notification exclusions in DEC-0010 §Non-goals, DEC-0011 §Non-goals, and DEC-0012 §Non-goals, to the exact extent described below and no further

## Context

Every account-layer decision so far deferred notifications to "a distinct future decision". DEC-0011 went further and deferred *following a venue* on the grounds that, without notifications, a follow would be indistinguishable from a favorite. Pulso now ships a venue follow control, so that gap is real and user-visible: the control exists, promises nothing, and delivers nothing.

This decision authorizes the smallest notification system that closes that gap.

## Decision

Pulso adds **in-app notifications only**: a bell in the connected top bar, an unread count, and a panel listing recent notifications.

No push notifications. No email. No SMS. Nothing leaves the product surface. A user who never opens Pulso receives nothing, and there is therefore no consent, unsubscribe, sender-reputation, or deliverability question in scope.

## Authorized triggers

A notification may be created only by one of these four real events:

1. **New event at a followed venue** — a venue the user follows gains a qualifying scheduled event that Pulso did not previously have.
2. **Friend request received** — another account sends this user a friend request.
3. **Friend request accepted** — an account this user sent a request to accepts it.
4. **New direct message** — another account sends this user a message.
5. **Reply in a followed forum** — someone posts in an event forum this user follows.

In addition, one **derived** notification kind exists:

6. **Upcoming event reminder** — an event the user marked "j'y vais" starts within the next 24 hours.

Reminders are computed at read time from attendance and event start time. They are not stored rows: a stored reminder would need a scheduler Pulso does not have, and would go stale if the event moved or the user withdrew. Computing them on read means a reminder can never outlive the fact it describes.

## Not authorized

- Group activity of any kind (new member, new post, new event proposal). DEC-0013 excluded group notifications and this decision does not revisit that.
- Notifications for favorites, ratings, profile views, or any aggregate ("3 personnes ont aimé").
- Any digest, batching, or frequency rule beyond "newest first".
- Any per-trigger preference or mute UI. All six kinds are on for every signed-in account; a preference surface requires its own decision.
- Any notification for an anonymous visitor. Notifications require an account, like attendance does.

## Data and trust rules

A notification stores only a reference to something that already exists (event, venue, user, forum post) plus the time it happened. It never stores a fabricated label. Display text is composed at render time from the referenced row, so a renamed venue or a deleted event is reflected — or the notification is dropped — rather than preserved as a stale claim.

Deleting the referenced row must not leave an orphan notification.

Read state is per-notification and per-account. Marking read is not reversible and carries no further meaning.

## Scope boundaries

- The bell is a connected-experience surface only; the anonymous top bar is unchanged.
- Notifications never alter event search, ranking, or counts.
- No real-time transport (no WebSocket, no SSE) — the unread count refreshes on navigation, consistent with DEC-0012's existing no-real-time position on messages.

## Acceptance criteria

1. Following a venue, then that venue gaining a new event, produces exactly one notification for the follower.
2. A user who does not follow that venue receives nothing.
3. Receiving and accepting a friend request each produce one notification, to the correct recipient.
4. A new direct message produces one notification for the recipient only, never the sender.
5. An event starting within 24 hours that the user is attending appears as a reminder, and stops appearing once it has started.
6. The unread count reflects unread stored notifications and drops to zero after marking all read.
7. Deleting a referenced event removes its notifications rather than rendering a dangling entry.
8. No notification is sent outside the product surface.
