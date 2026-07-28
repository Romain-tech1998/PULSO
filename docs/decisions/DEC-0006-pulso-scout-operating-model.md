# DEC-0006 — Pulso Scout Operating Model

**Identifier:** DEC-0006
**Version:** 0.2
**Status:** Draft
**Dependencies:** PDR-0001, MVP-0001, PRD-0001, RFC-0001, DATA-0001, DATA-0002

## Proposal

Pulso Scout is a supervised, experimental research workstream for a curated Montréal account watchlist. It does not authorize production ingestion or automatic publication.

1. Load a curated account watchlist.
2. Use the dedicated `pulso_scout` professional account as the querying identity through the official Meta Graph API.
3. Query only configured public Business or Creator accounts through Instagram Business Discovery.
4. Detect new accessible Feed posts and Reels.
5. Capture only the minimum evidence needed for event extraction: caption, media type, media product type, permalink, source timestamp, and observation timestamp.
6. Extract structured candidate facts for classification.
7. Attach source, timestamp, provenance, and confidence.
8. Compare the candidate with existing events for deduplication.
9. Route uncertain or secondary-source candidates to human review.
10. Permit only validated candidates to become publishable events.

## Boundaries

Scout does not depend on hashtags or claim global Instagram search. It performs no automatic likes, follows, comments, or messages, and stores no credentials in the repository. Meta credentials and tokens belong only in environment variables or managed secret storage.

The official API pilot covers Feed posts and Reels from named public Business or Creator accounts. Third-party Stories and personal accounts are outside this API capability and must remain a separate future workstream if they are ever reconsidered. Browser automation is not part of this pilot and is not an approved production ingestion mechanism.

There is no automatic publication in the initial pilot. Collection frequency is to be tested, not assumed. Personal or unrelated content must not be retained; retained source content is minimized, while extracted facts and provenance are the product data. The dedicated `pulso_scout` identity is used instead of the public `pulso_officiel` brand account.

## Candidate outcomes

accepted, needs_review, duplicate, not_an_event, outside_mvp, insufficient_information, stale, and source_unavailable.

## Pilot evidence

The pilot records eligible events found, events unique to Instagram, extraction completeness, false-positive rate, duplicate rate, human-review time, source yield, and Feed/Reel contribution. Numeric acceptance thresholds remain open until pilot evidence exists.

### Validated technical checkpoint — 2026-07-24

- Meta app `Pulso Scout`, dedicated system user, Facebook Page `Pulso Scout`, and Instagram professional account `pulso_scout` are connected.
- The connector uses Graph API v25 with `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, and `pages_show_list`.
- A live Business Discovery request using a user token against `newcitygas` returned 10 recent media signals: 9 Feed items and 1 Reel.
- All 10 signals included a permalink and source timestamp.
- The sample contained both event announcements and recap content, confirming that human classification remains necessary.
- A separate five-source run using the generated system-user token reached Meta but returned `API access blocked` for every target. The system-user token is therefore not an accepted credential path until its Meta access configuration is corrected and retested.
- The five-source pilot was then rerun with an extended user token and succeeded without target errors: 50 review items were collected, comprising 45 Feed items and 5 Reels. Each of the five sources contributed 10 items, and all 50 retained a permalink and source timestamp.
- Every collected item remains `needs_review`, and the generated queue records `publicationAuthorized: false`.
- A conservative explainable triage pass classified the same sample into 16 likely events, 33 uncertain items, and 1 likely non-event. It used visible caption evidence such as ticketing language, event vocabulary, future-time language, explicit dates, recaps, contests, and generic promotion. It did not accept or publish any event.
- Because 49 of 50 items still require review in this first baseline, the automation currently prioritizes work rather than replacing validation. Its precision and recall must be measured against human decisions before thresholds can be changed.
- A fact-extraction pass now preserves a low-confidence working title, raw date/time/price mentions, ticketing language, mentioned accounts, the possible host/organizer source, missing facts, and an evidence-completeness score. It never assigns an omitted year or treats the source account as a confirmed venue.
- Across all 50 items it found 50 working titles, 12 dates, 11 times, 3 prices, and 15 ticketing signals. Among the 16 likely events, 9 had a date, 8 had a time, and 11 had a ticketing signal; none had a confirmed venue. Six candidates reached 75% caption-evidence completeness, five reached 50%, and five reached 25%.
- A separate visual-evidence pilot now retrieves temporary image or Reel-thumbnail URLs returned by Meta, normalizes each visual locally, and performs local French/English OCR in isolated child processes. Source images are deleted immediately after each attempt; only OCR evidence and provenance remain in the ignored local report.
- On the July 26 rerun, all 50 visuals produced OCR text with no target or OCR errors. Compared with caption-only extraction, visual evidence added 11 date findings, 3 time findings, 1 price finding, and 3 possible venue-name findings. Six caption-ambiguous items moved to `likely_event`.
- The three venue-name findings were two `Place Bell` mentions and one `Centre Bell` mention. They remain candidates requiring confirmation: OCR text and a registry-name match are evidence, but are not by themselves permission to set a publishable event location.
- An automated second-source check now compares each venue candidate with recent Feed/Reel captions from that venue's own Instagram Business/Creator account. Confirmation requires both a shared calendar date and a shared distinctive event term; venue-name similarity alone is insufficient. The first live run checked 25 recent signals from `placebell` and 25 from `centrebell` without API errors. None of the three candidates met both conditions, so all three remained unmatched and routed to review. The crosscheck explicitly retains `publicationAuthorized: false`.
- The remaining cases can be opened through a generated local review page. It exposes caption, OCR evidence, extracted facts, source link, an operator outcome, and notes; decisions are stored only in that browser until exported as a JSON audit artifact. The page has no server endpoint, no production deployment, and no event-publication capability, preserving RFC-0001's requirement that correction remain an internal operator action rather than a public administration product.
- The first exported operator decisions were reconciled through a separate, non-publishing gate. Two items were accepted as real events but both resolved to Place Bell in Laval, outside the Montréal-only MVP, so they were retained as `blocked_outside_mvp`. The remaining Centre Bell poster was classified `not_an_event` because it aggregates many events. The run produced zero database writes and kept `publicationAuthorized: false`.
- A separate mapping-draft gate now exists for future accepted Montréal candidates. It requires an explicit normalized title, category, ISO start time, verified venue address, city, and coordinates before producing a `RawIngestedEvent`. It cannot bypass a review or geographic block, and both database-write and publication authority remain false. This prepares an auditable handoff to the existing deduplication mapper without connecting Scout directly to public-event persistence.
- Official fixed-venue Instagram accounts can now be linked by exact normalized name to an already geocoded venue in the Pulso database. The current real pass considered 177 fixed-location sources against 486 venues and linked 51 without ambiguity; 126 remain unmatched rather than being guessed. Place Bell links to `@placebell`. Rouge Gorge was verified from its official address and an independently named OpenStreetMap point, added as a fixed venue, and now links to `@rougegorge_mtl`.
- Product rule revised by the owner: the geographic boundary is a maximum of 30 km from Pulso's Montréal map centre (`-73.5673, 45.5017`). The earlier monthly-density requirement is removed. Distance is calculated from the venue's verified point; a name, follower count, or unvalidated promotional claim cannot satisfy the geographic gate.

This checkpoint validates technical access and the connector contract. It does not approve production ingestion, automatic publication, the full DATA-0002 watchlist, or numeric pilot thresholds.
