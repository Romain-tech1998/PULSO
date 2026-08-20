# DEC-0026 — Shipping: the Closed Beta, and Opening the Live Gate

**Identifier:** DEC-0026
**Version:** 1.0
**Status:** Accepted
**Date:** 2026-08-20
**Dependencies:** PDR-0001, MVP-0001, DATA-0001, PRD-0001, RFC-0001, DEC-0018, DEC-0020, DEC-0021, DEC-0022, DEC-0025
**Supersedes:** nothing. It satisfies the deployment gate RFC-0001 left open, and opens the gate DEC-0022 §8 deliberately left closed — to the exact extent described below and no further.

## Context

Nothing in the accepted record authorizes a deployment. RFC-0001 makes it a
gate; DATA-0001 requires a freshness policy and a post-launch correction
procedure "avant tout déploiement de production"; DEC-0022 §8 makes live-mode
Stripe wait on, among other things, "Pulso actually being deployed, which no
accepted document authorizes yet". Every chantier since DEC-0021 has been
written before it was built. This one is written before Pulso is public.

The trigger is not a feature. The product owner set **2026-08-26** and a
reason: shipping something imperfect to real people beats continuing to build
unobserved. That is a product judgement, and this document records it rather
than re-litigating it. What it does litigate is the shape of the thing that
ships — because "deployed" and "launched" are not the same act, and conflating
them is how a first production database meets an audience nobody chose.

## Decision

### 1. A closed beta is a deployment, not a launch

Pulso goes online at a real domain, over HTTPS, against a real database, and
stays **unindexed and invitation-only**. `robots.ts` keeps serving `noindex`
and the `robots` meta tag in `layout.tsx` keeps mirroring it; the audience is
a list the product owner writes.

This is not timidity, it is blast radius. Three things become real on the same
day — a production database holding user-authored content, image uploads on a
persistent volume, and money — and each of them has failed silently at least
once already in this project's history. A list of testers is a set of people
who can be called back, told what changed, and asked what broke. Anonymous
traffic is none of those things and produces the one kind of feedback that
cannot be followed up.

**Search-engine work is deliberately deferred, and this is why.** Indexation
takes weeks; nothing done before the 26th could return a visitor by the 26th.
Worse, the first thing a crawler recorded would be a product changing daily.
The minimum honest fix ships anyway because it is not SEO — a real 1200×630
Open Graph image, since `layout.tsx` currently declares those dimensions for a
192-pixel favicon and every shared link renders broken. A link pasted into a
message is how invitations will actually travel.

### 2. The web is the product on the 26th

`apps/mobile` has the map, the filters, the deterministic search and local
favourites. It has none of accounts, community, groups, notifications,
organizer surfaces or ticketing. The mobile web is what a phone gets, and this
document says so out loud rather than letting the native app be quietly
presented as imminent. Its scope is a separate chantier, to be cut with the
beta's feedback in hand rather than before it.

Responsive quality on a phone is therefore a launch condition, not a polish
item — for the beta, the phone *is* the native app.

### 3. Live mode: the four conditions, and where they are recorded

DEC-0022 §8 requires four things before a live key exists. Three of them are
not code and cannot be produced by writing any. They are recorded here, with
dates, and this is the only place that records them:

| Condition (DEC-0022 §8) | Status | Date |
| --- | --- | --- |
| 1. Accountant's review of Pulso's commission and the organizer's tax position | **Waived by the product owner** | 2026-08-20 |
| 2. Lawyer's review of ticket terms, refund policy and Québec consumer-protection obligations | **Waived by the product owner** | 2026-08-20 |
| 3. Pulso's commission rate as a decided number | **Decided: 1000 bps** | 2026-08-20 |
| 4. Pulso deployed | **Satisfied by this document** | 2026-08-20 |

A live key is authorized when, and only when, all four lines above carry a
date. They now do.

**Two of them are waived, and waived is not satisfied.** Pulso operates as a
Québec sole proprietorship with neither an accountant nor a lawyer engaged,
and the owner has decided those two reviews will not happen before the beta.
The word in the table is therefore *waived*: this table exists to record what
is true, not to make the record look complete. What the reviews were for does
not disappear with them, and two of the things they would have covered become
the owner's own standing obligations:

- **The tax threshold is a counter, not a checkbox.** A sole proprietorship
  below the small-supplier threshold charges no tax on its commission; above
  it, registering and taxing the commission become obligations, and the
  threshold is measured over a rolling twelve months rather than settled once.
  Ticketing revenue counts toward it from the first live sale, so it is a
  number to watch from the day this gate opens.
- **The refund position is already architectural.** DEC-0022 §1 makes the
  organizer the merchant of record, the name on the cardholder's statement,
  and the one who owes the refund. A lawyer would have sharpened the wording;
  the substance was decided by the charge model and is already built. What is
  left is for §4's ticket terms to state it plainly to the buyer *before*
  payment — the part a document has to do, not the code.

Pulso being a sole proprietorship, there is no separation between the
business's liabilities and the owner's. That is recorded, not argued: it is a
consequence of the entity, it applies from the first live sale, and
incorporation is the ordinary answer whenever it stops being theoretical.

**The commission is 1000 basis points — 10%, added on top of the organizer's
price** and therefore paid by the buyer, visibly, at checkout. Flat rather
than tiered: a tiered scale inverts at its boundaries, where a ticket priced
two cents higher crosses into a lower band and costs the buyer less than the
cheaper one, which rewards pricing around the boundary rather than pricing
honestly. Ten percent is what Montréal buyers already pay on the platforms
they use for these same nights, so it is neither a surprise nor a discount
that teaches nothing. A **per-ticket cap** is the correct shape for the
concern that a percentage on an expensive ticket becomes absurd — it is
monotone where tiers are not — and it is deliberately not built now: at
nightlife prices it would never bind, and a rate observed against no revenue
at all is not a rate anybody has learned anything about. Both the number and
the absence of a cap are to be revisited against the beta's real orders.

**The guard changes shape; it does not disappear.** `config.ts` today refuses
any Stripe key containing `_live_` in every environment, which was correct
while no path to live existed. Deleting it would leave nothing between a
developer's `.env` and real money. It is replaced by a narrower refusal: a
live key is accepted only when `PULSO_ENV=production`, `PULSO_APPLICATION_FEE_BPS`
carries the decided non-zero rate, and an explicit authorization variable
naming this decision is set. Any live key without all three still refuses to
boot, with the same loud failure. A developer's machine still cannot move real
money, which was the whole point of the original rule.

**The fallback is an environment variable, not a rework.** One dependency
remains outside Pulso's control: Stripe's own verification of the platform
account and of each organizer's connected account, which DEC-0022 §1 already
refuses to bet on — a paid event cannot be published while Stripe answers
`charges_enabled: false`. If that verification, or the ticket terms of §4, is
not complete on 2026-08-25, the beta ships on test keys with paid event
creation disabled and the flip to live is a configuration change on an
already-deployed system. The launch date does not depend on it.

### 4. What must exist before the first invitation is sent

Not a wish list — the conditions of this decision:

- **Legal surfaces**, which do not exist today: a privacy policy meeting Law 25
  (purposes, retention, rights, and the transfers outside Québec that Google,
  Stripe, OpenAI and Apify each represent), terms of use, **ticket terms and a
  refund policy** (DEC-0022 makes the organizer the merchant of record and the
  one who owes the refund — a buyer must be able to read that before paying),
  and a legal notice. Google's consent screen requires the privacy policy URL,
  so this is also what lets anybody sign in at all.
- **Rate limiting** on user-authored content — messages, forum posts, uploads,
  reports. DEC-0012 accepted its absence "while the user base is small", which
  was a statement about a user base of zero.
- **Error monitoring** on both services. `DEPLOY.md` states the consequence
  plainly: without it, production is blind.
- **Automated database backups**, on from the first migration rather than after
  the first loss.
- **The DATA-0001 production gate**: the freshness policy and correction
  procedure of §5 below.

### 5. Data freshness and correction during the beta

DATA-0001 requires both before production, and neither has been written.

- **Freshness.** Pulso shows a seven-day sliding window, refreshed by the
  ingestion jobs on their existing schedules — events twice daily, venues
  weekly, Eventbrite and the Instagram pipelines on their own crons. An event
  whose source has not been seen within its cadence keeps the freshness line
  it already displays under DATA-0001; the beta adds no new claim about
  accuracy that the pipeline cannot keep.
- **Correction.** A reader who finds a wrong event uses the existing report
  path, which lands in the moderation queue an administrator already works
  from (DEC-0021). During the beta an incorrect ingested event may be
  corrected or unpublished directly from the administration console, and the
  correction is not silent: what was changed and when is recorded in the
  entry that closes this chantier.
- **Production is never seeded.** `pnpm db:seed` inserts the synthetic
  fixtures the e2e suite asserts on. A seeded production database would show
  invented events to real testers.

### 6. Groups are verified, not extended

DEC-0015's registry is four built modules of the ten its v1.0 imagined. The
beta ships those four. The path that gets walked before the 26th is
create → invite → discuss → organise one outing, driven in the real
application rather than read in the code — the lesson entry 73 recorded when a
console shipped unreachable twice. What that walk breaks gets fixed; nothing
new gets built. The remaining modules and the organic proposal cycle wait for
feedback, which is the entire reason for shipping.

## Not authorized

- Removing `noindex`, publishing a sitemap, or any other move toward public
  indexation, before a decision that says the beta is over.
- A live Stripe key while any line of §3's table is open, or outside the three
  conditions §3 requires.
- Deleting the live-key guard rather than narrowing it.
- Running `pnpm db:seed`, or any fixture insertion, against production.
- App-store submission of `apps/mobile`, or any presentation of the native app
  as imminent.
- Promoting messaging or groups in onboarding, navigation or empty states —
  DEC-0025's "Not authorized" stands unchanged, and shipping does not relax it.
- New features between this document and the 26th that are not named in it.
  Fixes to what exists are the work; anything else is the next chantier.
- Opening the beta beyond the invitation list without a further decision.

## Acceptance criteria

1. `https://<domain>/robots.txt` disallows crawling, and a page fetched
   directly carries a `noindex` meta tag.
2. `https://<api-domain>/health` returns `{"status":"ok"}`, and the map renders
   Pulso's basemap rather than the grey fallback.
3. A visitor can sign in with Google end to end, and an uploaded photo survives
   a redeployment of the API.
4. The privacy policy, terms of use, ticket terms with refund policy, and legal
   notice are each reachable from the interface without an account.
5. The Google consent screen is published and links to the privacy policy.
6. A signed-in account exceeding the rate limit on messages, posts or uploads
   receives a refusal rather than a written row.
7. An unhandled error in either service produces an alert somewhere a human
   reads.
8. The database has automated backups, verified by listing at least one.
9. The API refuses to start with a live Stripe key unless `PULSO_ENV=production`,
   a non-zero commission rate, and the authorization variable are all present;
   it starts with test keys with none of them.
10. One real purchase, at the decided 10% commission, and its refund are
    completed end to end before the first invitation is sent.
11. Production contains no seeded fixture event.
12. The group path create → invite → discuss → one outing completes in the
    deployed application.
13. A shared link renders a 1200×630 image.
14. No legal page still displays an unfilled operator fact. Four of the six
    were supplied on 2026-08-20; the enterprise's registered name and its NEQ
    wait on the Registraire, and the pages say so visibly rather than leaving
    a plausible blank.
