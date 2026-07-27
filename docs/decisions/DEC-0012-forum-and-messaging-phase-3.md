# DEC-0012 — Forum and Messaging Phase 3: Per-Event Forum, Direct Messages, and Reporting

**Identifier:** DEC-0012
**Version:** 1.0
**Status:** Accepted
**Dependencies:** PDR-0001, PDR-0002, MVP-0001, DEC-0001, DEC-0007, DEC-0010, DEC-0011, UX-0001, PRD-0001, RFC-0001

## Decision

Pulso authorizes user-generated content for the first time: a per-event forum and direct messages between friends. Each event has four fixed sub-discussions — finding partners to attend with, general discussion, ticket resale, and finding someone who was there — as a flat, chronological message board per category. A post cannot be edited after publication, only deleted by its own author. Direct messages are restricted to accounts with an accepted friendship (DEC-0011); there is no open inbox and no way to message a stranger.

Unlike the rest of Pulso, the forum and messaging require a signed-in account even to read, not only to post. Sourced event data carries an explicit trust framework (DATA-0001: freshness, confirmation, location confidence); user-generated content has no equivalent, and mixing it into anonymous browsing would blur that distinction for a visitor who has not chosen to engage with the account layer.

A minimal reporting mechanism is authorized alongside this: any signed-in user can report a forum post or a message, recording the reporter, the target, and an optional reason. This is a safety net, not a moderation system — see Boundaries.

## Relationship to prior decisions

PRD-0001 excludes "social features" from the MVP; DEC-0011 already narrowed that exclusion for a mutual friend graph and participation visibility, and explicitly listed "a forum or any per-event discussion space, direct messaging" as remaining out of scope pending their own decision. This is that decision.

## Boundaries

- No moderation queue, review interface, automated content filtering, or enforcement action (warning, suspension, ban) exists. A report is a database row, nothing more, until a future decision authorizes an actual moderation process.
- No rate limiting exists on posting or messaging. The account requirement (no anonymous posting) and a small, real user base are the only frictions against spam at this stage; rate limiting is deferred, not forgotten, and should be revisited if abuse is observed.
- The ticket resale sub-forum is peer-to-peer discussion only. Pulso is not a party to, and does not facilitate, process, or guarantee any transaction, payment, or ticket transfer discussed there — a disclaimer to this effect is shown directly in that sub-discussion.
- Messaging eligibility is derived entirely from the existing friendship state; there is no separate block list. Removing a friend (already possible per DEC-0011) stops future messages between the two accounts; past message history is not deleted.
- Forum posts and messages are plain text with a length cap; no attachments, images, or rich formatting are supported.

## Non-goals

Does not authorize group conversations, message search, push or email notifications for new posts or messages, a public or searchable forum/message archive, or any moderator tooling. Each remains a distinct future decision.

## Supersession

DEC-0012 narrows PRD-0001 §4's exclusion of social features only to the extent described above (a fixed-category event forum and friend-only direct messages). It does not alter DEC-0007, DEC-0010, or DEC-0011's behavior, and does not alter any other Accepted MVP scope or boundary.
