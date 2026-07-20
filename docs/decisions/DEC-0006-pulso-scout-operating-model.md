# DEC-0006 — Pulso Scout Operating Model

**Identifier:** DEC-0006
**Version:** 0.1
**Status:** Draft
**Dependencies:** PDR-0001, MVP-0001, PRD-0001, RFC-0001, DATA-0001, DATA-0002

## Proposal

Pulso Scout is a supervised, experimental research workstream for a curated Montréal account watchlist. It does not authorize production ingestion or automatic publication.

1. Load a curated account watchlist.
2. A human opens an authenticated Pulso-owned Instagram session.
3. Scout visits only configured public accounts.
4. Scout detects new accessible Stories, posts, and Reels.
5. Capture only minimum evidence needed for event extraction.
6. OCR/vision extracts structured candidate facts.
7. Attach source, timestamp, and confidence.
8. Compare the candidate with existing events for deduplication.
9. Route uncertain or secondary-source candidates to human review.
10. Permit only validated candidates to become publishable events.

## Boundaries

Scout does not depend on hashtags or claim global Instagram search. It performs no automatic likes, follows, comments, or messages; no CAPTCHA or anti-bot bypass; and stores no credentials in the repository. Login and 2FA remain manual. A challenge stops the session and requests human intervention.

There is no automatic publication in the initial pilot. Collection frequency is to be tested, not assumed. Personal or unrelated content must not be retained; retained source content is minimized, while extracted facts and provenance are the product data. Account restrictions are a material risk. The pilot must evaluate whether a dedicated Pulso research account or the public brand account is appropriate. Browser automation is experimental and is not an approved production ingestion mechanism.

## Candidate outcomes

accepted, needs_review, duplicate, not_an_event, outside_mvp, insufficient_information, stale, and source_unavailable.

## Pilot evidence

The pilot records eligible events found, events unique to Instagram, extraction completeness, false-positive rate, duplicate rate, human-review time, source yield, Story/post/Reel contribution, and session challenges or account restrictions. Numeric acceptance thresholds remain open until pilot evidence exists.
