# DEC-0021 — Image Moderation

**Identifier:** DEC-0021
**Version:** 1.0
**Status:** Accepted
**Date:** 2026-08-14
**Dependencies:** PDR-0001, DEC-0012, DEC-0013, DEC-0017, DEC-0018, DEC-0019, DEC-0020, PRD-0001, RFC-0001
**Supersedes:** The "no moderation of uploaded profile or gallery photos" boundary of DEC-0020, to the exact extent described below and no further

## Context

DEC-0020 authorized users to upload a profile photo and to post photos to a
personal gallery, and recorded the absence of any moderation as a *knowingly
accepted risk to be revisited before any public launch*. This is that
revisit, taken while Pulso is still pre-deployment and the cost of getting
it wrong is zero.

The gap is not theoretical. Pulso accepts an arbitrary image from any
signed-in account and serves it back from its own domain, on a profile, in a
gallery, on an event and inside a group. Nothing looks at it. The only
existing safety net is DEC-0012's report, which writes a row that **no
interface has ever read** — there is no route to list reports and no screen
to act on one. A report today is indistinguishable from doing nothing.

## Decision

Every image a user uploads is screened automatically before it is published,
and every published image can be reported into a queue an administrator
actually works.

### 1. Three outcomes, decided automatically

An upload resolves to exactly one of:

- **approved** — published immediately. The visitor sees nothing about
  moderation, which is the point.
- **rejected** — clearly disallowed. The upload is refused, the file is not
  kept, and the user is told plainly that the image cannot be published.
- **flagged** — ambiguous. The file is stored but **not published**, and it
  enters the administration queue.

An image that has not reached `approved` is not served to anyone but the
administration console. "Not published" is enforced where the images are
read, not by the interface choosing to be discreet.

### 2. Replacing a photo never destroys the one it replaces

If an account already has a profile photo and the new one comes back
`flagged` or `rejected`, the existing photo stays exactly as it is. A user
must never lose a working photo by attempting to change it, and a rejected
attempt must not be a way to blank someone's profile.

### 3. Failure is not permission

If the moderation provider errors, times out, or is not configured, the
image resolves to **flagged**, never to `approved`. Pulso would rather make
an administrator look at a harmless photo than publish an unscreened one
because a third party was unavailable.

This has a consequence worth stating plainly: with no provider configured,
every upload lands in the queue. That is the correct default for a product
that has not yet decided to pay for screening, and it is why the queue has
to be genuinely workable rather than a formality.

### 4. Reports feed the same queue

Any signed-in account can report a published image with a reason. A report
does not remove anything on its own — one report is not a verdict — it
raises the image into the same administration queue, alongside the
automatic flags. An account cannot report the same image twice; the second
attempt changes nothing rather than inflating a count.

### 5. The administrator decides, and only about the image

The console gains a moderation queue showing the image, why it is there
(automatic categories and scores, or the reports and their reasons), who
owns it, and when. Two actions: **approve**, which publishes it, and
**remove**, which takes it out of circulation permanently.

Enforcement stops at the image. No account is suspended, blocked from
uploading, or sanctioned in any way — Pulso has no notion of a sanctioned
account, and inventing one here would mean designing its whole lifecycle
(what it prevents, how it is lifted, what the user is told) as a side
effect of a photo decision. Deferred deliberately, not forgotten.

### 6. One provider, behind an interface

Screening goes through an `ImageModerationProvider` interface with a single
implementation today, OpenAI's `omni-moderation-latest`. A purpose-built
moderation endpoint rather than a general vision model behind a prompt: the
categories and scores are a defined contract instead of something coaxed out
of free text and re-parsed.

The interface exists so a later decision can add or swap an engine without
touching upload, storage, reporting or the console. No second provider is
built here.

The decision thresholds live in one configuration module, not scattered
across the routes that happen to call it.

## Boundaries

- **Nothing is screened retroactively.** Images already published were
  accepted under DEC-0020's rules and are migrated to `approved`. Screening
  applies from this decision forward.
- **Only user-uploaded images are in scope**: profile photos, gallery
  photos, event photos, group photos and event covers. Venue photos are not
  user content — DEC-0019 borrows them from official sources and gives an
  administrator a separate suppression path, which is unchanged.
- **No pre-publication human approval.** The default path is automatic and
  immediate; a human only sees what the machine could not settle or what a
  user reported.
- **No appeal process.** A user whose image is removed is not given a way to
  contest it, because there is nobody staffed to answer. This is a real
  limitation of a one-administrator product and should be revisited if Pulso
  ever has a moderation team.
- **No text moderation.** Forum posts, messages, captions and group content
  remain unscreened; DEC-0012's report row is still all they have.
- **The image leaves Pulso.** Screening sends the image to OpenAI. That is a
  new external dependency in a product that has deliberately kept user
  content on its own disk, and it must be disclosed wherever Pulso describes
  what it does with uploads before any public launch.

## Acceptance criteria

1. A safe image is published with no moderation message shown.
2. A disallowed image is refused, its file is not retained, and the user is
   told the image cannot be published.
3. An ambiguous image is stored, is not visible to anyone but the console,
   and the user is told it is being checked.
4. A provider error or missing configuration produces a flagged image, never
   a published one.
5. Replacing a photo with one that is flagged or rejected leaves the
   previous photo in place and still published.
6. A non-administrator calling any moderation route is refused server-side.
7. An administrator can see the queue, approve an image into publication,
   and remove one permanently.
8. Reporting a published image raises it into the queue and never removes it
   on its own; the same account reporting it twice changes nothing.
9. Images that existed before this decision remain visible.
