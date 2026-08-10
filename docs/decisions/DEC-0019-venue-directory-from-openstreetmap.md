# DEC-0019 — Venue directory from OpenStreetMap

**Version:** 1.0  
**Status:** Accepted  
**Date:** 2026-08-10  
**Depends on:** DEC-0006, DEC-0014, DEC-0018  
**Amends:** DEC-0006's "no automatic publication" rule, which is retained for events and lifted for third-party reference venues under the gate below; and DEC-0014's prohibition on unverified opening-status claims, under the conditions in *Opening hours* below

## Context

Pulso's venue directory held only what the event pipeline happened to produce. A visitor who typed the name of a real Montréal bar that no ingested event had ever mentioned got an empty screen — which reads, wrongly, as "that place does not exist".

Measured against the live Overpass extract for the 30 km Montréal radius: 878 mapped places matching Pulso's venue vocabulary, 860 of them named. That is the size of the gap.

## Decision

Pulso builds its venue directory from OpenStreetMap, publishes what qualifies directly to the map, and looks up live what it is still missing.

### Why OpenStreetMap and not Google Places

Google Maps Platform's terms forbid retaining Places content beyond 30 days — only a `place_id` may be stored — so a permanent Pulso venue record built from it would breach them. OpenStreetMap is ODbL: storing, deriving and redistributing are permitted with attribution. Attribution therefore travels on the record (`venues.source`), not hard-coded into one component.

### Automatic publication, and its gate

DEC-0006 forbade automatic publication. That rule was written for **event extraction from Instagram**, where a candidate is an inference from a caption and a human has to confirm that an event exists at all. A venue record from OSM is a different kind of claim: it is third-party reference data, already curated by another project, asserting only that a named place exists at a coordinate.

Automatic publication is therefore authorized **for venues from OpenStreetMap only**, and only when the record carries all of:

- a name;
- a real address — from OSM's own `addr:*` tags, or reverse-geocoded from the coordinate OSM supplies;
- usable coordinates;
- a venue category from Pulso's vocabulary, mapped from a known OSM tag and never inferred;
- a position within 30 km of Pulso's Montréal centre.

Anything short of that is written `review_state = 'candidate'`: search offers it as a labelled suggestion, the map never shows it. Nothing invents a fact to clear the gate — a venue whose address cannot be recovered stays a candidate rather than being published with a placeholder.

DEC-0006's rule is unchanged for events. No event is ever published automatically.

### The category list is the scope boundary

Only tags that map cleanly to bars, pubs, nightclubs, theatres, concert halls, arts and community centres, breweries, museums and galleries are imported. DEC-0014 authorizes a map exception for recurring outing destinations, not a general business directory; adding `amenity=restaurant` to that list would quietly create one.

### Live lookup behind a failed search

When a named search returns nothing from Pulso's own directory, Pulso asks Nominatim once, bounded to Montréal, and persists what comes back. Three gates keep this from becoming abuse of a volunteer-run service:

1. it runs only when the local directory returned nothing;
2. `venue_lookup_attempts` records every query already looked up, so one unmatchable spelling is one request rather than one per visitor who repeats it;
3. results outside the 30 km radius are discarded.

Nominatim rather than Overpass because searching by name is what that API is for. The endpoint failing, rate-limiting or timing out degrades to the empty result the search already had — never to an error.

### A refusal is not an empty directory

The AI interpreter may answer that it cannot map a query onto a date, a price or a category. That is a statement about the *query*, not about the directory, and the route used to treat the two as the same thing: it returned immediately, without ever asking whether Pulso held anything by that name.

Observed live: **"clébard" dead-ended while "Clébard" was answered** — the same bar, found or not found on a capital letter, because a model reads a capitalized word as a proper noun and a lowercase one as vocabulary. Nothing downstream was case-sensitive; the interpreter's own normalization lowercases and strips accents. The inconsistency was entirely in what the model chose to call unmappable.

So Pulso now looks before concluding there is nothing: on the **generic** refusal only, the residual term is searched against the directory, and the refusal stands untouched unless something is actually found. Specific refusals — Montréal-only, routing unsupported, no verified price — are never second-guessed: they say something true the visitor needs, and answering them with a silent substring match would replace an explanation with a guess.

### Deduplication

Two records are the same place when **name, address and position agree well enough together**. No single signal decides, because each fails differently: name alone merges the four "Pub Saint-Paul" in the city, address alone merges every tenant of one building, and coordinates alone merge neighbours while missing the node-versus-building-footprint pairs OSM is full of.

Two tiers, both requiring the names to agree:

1. **Same name, within 500 m.** OSM carries "Le Cheval Blanc" at 809 Rue Ontario Est and "Cheval Blanc" one street over — the same brewpub, 200 m and one article apart.
2. **Similar name (≥ 0.75), matching address.** Different spellings of one venue at one street answer.

A third tier — same address and same point, different name, read as a rebrand — was written, tested against the live directory, and removed. It merged the six halls of Place des Arts into a single row, along with four separate Saint-Laurent bars and a gallery inside the Belgo. A multi-tenant address is ordinary downtown and a rebrand is rare, so the tier destroyed real venues far more often than it cleaned up stale ones. **Two rows for a renamed bar is a cosmetic problem; deleting Maison symphonique is not.** A rebrand is therefore left as two rows for an operator to merge by hand.

Three further guards, each added after a false merge showed up in a dry run against the live directory:

- **The name threshold on tier 2 is high (0.75)**, because Montréal venues are routinely named after the borough they sit in. At 0.6 the rule merged "Bibliothèque de Rivière-des-Prairies" into "Centre Communautaire Rivière-Des-Prairies", two civic buildings whose only common ground is the borough in their names.
- **Tier 1 requires a distinctive name.** "PHI" and "Centre Phi" are 137 m apart and both reduce to `phi` — and they are two different venues of one organisation, the Fondation on Rue Saint-Jean and the Centre on Rue Saint-Pierre. A name must carry two distinct tokens, or one of four characters or more, before proximity alone may merge on it. Neither distance nor address can separate that pair: the true duplicate in the same directory (Centre Bell / Bell Centre) is *closer* at 90 m, and one of its two rows has no address at all.
- **Address vocabulary is stripped before comparison.** Some rows carry a reverse-geocoded address in place of a name, so comparing them compares Nominatim boilerplate — "Rue Fullum, Le Plateau-Mont-Royal, Montréal, Agglomération de Montréal, Québec, Canada" agrees with the same sentence for Rue Chabot on nine tokens out of eleven. The same fix keeps "au coin des rues Duluth et De Bullion", "…et Drolet" and "…et Berri" apart: three different street corners of one festival.

These thresholds are tuned to observed data, not derived. The merge command therefore defaults to a dry run and prints **every** group rather than a sample — reviewing 10 of 25 before an irreversible delete hides exactly the groups worth catching.

The same test is used everywhere a duplicate can appear — within an OSM batch, against the existing directory, on the live lookup path, and in `db:merge-duplicate-venues --similar` — so a place is judged the same way however it arrives.

### Which copy survives a merge

Source authority decides which record is **primary**: whose title, time and source line Pulso stands behind. It is the wrong question for every other field, and treating it as the only question was throwing away real data. The civic listing for a show is authoritative about what and when and routinely carries neither poster nor ticket link, while the ticketing platform's copy of the same show carries both.

The surviving record therefore **absorbs every fact the other copy had and it lacks**, in this order of value:

1. a working ticketing link — the one field a visitor leaves Pulso to act on, so a listing without it has failed at the thing the directory is for;
2. a photo — what makes a result recognizable in a list;
3. description, end time, organizer, a known price, a venue photo with its provenance.

Only *absent* fields are filled. A disagreement between two sources about a fact they both state is not resolved here — the primary's version stands, which is what source authority is for. A structurally broken link counts as absent, so a source that published "à venir" in its ticketing field cannot block a working link from the other copy. Whether a link still resolves is not checked: that would mean an HTTP request per candidate during merging, and a page that is momentarily down is not a page that was never there.

### Photos

Venue photos come from two sources in different legal positions, and the record says which:

| Source | Coverage | Standing |
| --- | --- | --- |
| Wikimedia Commons, via `wikimedia_commons` or a `wikidata` P18 claim | ~6% (54 of 860) | Freely licensed; the credit line is stored and displayed |
| The venue's own website, read as its `og:image` | takes the total to ~40% (299 publish a site) | The business's own copyrighted photo, published for preview. Hotlinked, never copied |

An `image=*` tag is recorded as a third, distinct source: it points at an arbitrary host under an unstated licence, so it is credited to OSM and treated as removable.

Borrowed photos are removable on request, permanently. Removal writes a `venue_photo_suppressions` row that the importer reads — clearing the column alone would be undone by the next import, which would re-fetch the very image somebody asked Pulso to take down.

### Opening hours, and the "open now" claim

204 of the 860 named Montréal venues publish an `opening_hours` rule — 24%. It is stored **verbatim**, in the source's own syntax, and parsed by `@pulso/domain` at read time. Normalizing it into rows at write time would fix the interpretation permanently; keeping the string means a rule the parser learns to read later starts working without a re-import.

The parser reads the subset that actually occurs and **refuses everything else**. A rule carrying public holidays, school holidays, week numbers or `sunrise` yields *no* schedule rather than a partial one — parsing the recognizable half and dropping the exception produces a schedule that looks complete and is wrong exactly where the exception was.

The overnight span is the central case, not an edge case. Montréal bars close at 03:00, so `Mo-Su 16:00-03:00` means Monday evening through Tuesday morning. Read as a same-day range it is an empty interval, and every bar in the city is permanently closed. Everything is evaluated on the venue's clock (`America/Toronto`): a visitor in Paris asking what is open in Montréal means open *there*.

**This amends DEC-0014**, which forbids "unverified opening-status claims". Pulso now makes that claim, under four conditions:

1. the rule is sourced and shown, never inferred, and attributed to its source rather than presented as Pulso's own knowledge;
2. `opening_hours_observed_at` records when the rule was last read;
3. the open/closed pill is withheld once that record is older than 90 days — the hours are still shown, because they remain the best answer available, but a claim about *right now* made from a record that predates a possible closure is the error a visitor standing outside a dark door does not forgive;
4. **`unknown` is a distinct answer from `closed`.** For the 76% of venues that publish nothing, Pulso says nothing. Saying "closed" there would be a claim it cannot support.

A re-import overwrites the rule rather than coalescing it: hours that disappeared from the source have to disappear here too, because a stale schedule is worse than none once a state is stated from it.

### Naming a venue that has no events

Two surfaces need to name a place: claiming one as its verified organizer (DEC-0018), and hosting an event in one (DEC-0017). Both were built on the events already loaded for the fourteen-day window, because no venue-search endpoint existed. That was workable while the directory only held venues an event had put there.

It is not workable now. Of 1412 venues, the large majority have no programming at all — so the Clébard could not be claimed by its own owner, and no event could be attached to it. `GET /venues/search` answers by name across the whole directory, unauthenticated and read-only: it returns exactly what `/search` already returns for the same text.

### An event at somebody else's venue

`createEvent` already accepted an existing venue and already derived the origin server-side — `verified_organizer` when the account holds the `venue_organizers` link for that venue, `community` otherwise. A client cannot claim to be a verified organizer; it can only turn out to be one.

What was missing was the form, which always sent `kind: 'new'`. Every created event therefore minted a fresh venue row: it scattered an organizer's nights across duplicate places instead of accumulating them on the venue's page — the exact gain DEC-0018 promised and never delivered — and it was a steady source of the duplicates `db:merge-duplicate-venues` exists to undo.

Attaching to a known venue is now the default and creating a new one the exception, kept for a place Pulso genuinely does not know.

On the venue sheet the two are **separate blocks**: the venue's own programming (ingested and verified-organizer events) keeps DEC-0014's today / next-fourteen-days structure, and "Événements organisés ici" sits below it, visibly distinct and labelled as members' events rather than the venue's. Folding them into one list would let a member's party read as the bar's own night, which is precisely the confusion the verified-organizer link exists to prevent. The block is absent rather than empty when nobody has organized anything there.

### Category is what a pin shows

Every imported venue carries a category from Pulso's own vocabulary, mapped from the OSM tag table above and never inferred. The map draws one pin colour per category — the same `VENUE_CATEGORY_COLORS` the filter chips already use, so the filter panel doubles as the legend. Before this, every venue shared a single hard-coded pin colour, which made a museum and a nightclub indistinguishable on a map whose whole purpose is telling them apart. A venue whose category was never set draws the `other` pin rather than no pin: a missing icon renders an invisible marker, not a default one.

### Removal is an administrator action

The venue-photo queue lives in the DEC-0018 administration console, behind the same `users.is_admin` gate. Answering "please stop using our picture" has to be doable by the person reading the request, in that minute. A `pnpm db:venue-photos` command exists alongside it for bulk work.

## Not authorized

- Automatic publication of **events** from any source. DEC-0006 stands.
- A restaurant, retail, accommodation or general business directory.
- Copying or re-hosting a borrowed photo. Only the URL is stored.
- Live lookup as a general geocoder, or on any path other than a search that found nothing.
- Overpass or Nominatim calls per visitor request outside that single gated path.
- Inventing an address, a category or a coordinate to make a venue publishable.

## Acceptance criteria

1. A venue imported with name, address, coordinates and a mapped category appears as a map pin.
2. A venue whose address cannot be recovered is search-only and labelled a suggestion.
3. An OSM tag outside the authorized vocabulary imports nothing.
4. A venue beyond 30 km from the Montréal centre is never published.
5. A named search that Pulso cannot answer locally triggers exactly one live lookup, and the result is persisted.
6. Repeating a search that already missed performs no further network call.
7. A live lookup failure returns the ordinary empty result, not an error.
8. ODbL attribution is present on OSM-sourced venues in both search and map responses.
9. A Commons photo displays its required credit line.
10. A photo removed through the console does not return on the next import.
11. Every `/admin/venue-photos` route answers 403 for a non-administrator.
12. Two records of one place are merged when name, address and position agree; two venues sharing a building are not.
13. A merged record keeps the ticketing link, photo and description of whichever copy had them.
14. A venue pin is drawn in its category's colour on every map surface.
15. A venue name is found identically whatever its capitalization or accents.
16. A refusal that carries a specific explanation is returned unchanged.
17. A venue with no events can be found by name, claimed, and hosted in.
18. An event created at a known venue attaches to it instead of creating a second one.
19. A member's event at a venue is shown separately from the venue's own programming.
20. Opening hours are shown as sourced; an open/closed state is stated only from a rule Pulso could fully read and saw recently.
21. A venue that publishes no hours shows no state at all, rather than "closed".
