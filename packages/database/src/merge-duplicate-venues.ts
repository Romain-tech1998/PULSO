import { matchVenues } from '@pulso/ingestion';

import { createPool } from './client.js';

/**
 * One-time cleanup for duplicate venue rows: the same real-world point
 * (identical `location`) ended up with more than one `venues` row, almost
 * certainly the accumulated side effect of iterative geocoding/naming
 * improvements across ingestion passes (see PROJECT_INDEX entries 45/49 for
 * the same root cause already documented for events) - each improvement to
 * how a venue's name/address gets resolved changed the deterministic id fed
 * into the upsert, so a "better" row got inserted alongside the old one
 * instead of replacing it, and nothing has ever merged them back together.
 *
 * Found by direct inspection: grouping venues by `location` turned up 285
 * groups (852 of the 980 total rows) sharing exact coordinates with another
 * row - i.e. most of the venues table is duplicates of a smaller set of
 * real places. This is prerequisite cleanup for the "vraies pages de lieu"
 * effort: naming/categorizing every row individually first would have
 * produced several different pages for the same real place.
 *
 * Within each group, the "best" existing row survives (see scoreVenue
 * below) rather than an arbitrary pick - real names/categories already
 * researched by categorize-known-venues.ts or seed-curated-venues.ts must
 * never be thrown away in favour of a bare-address duplicate. Every
 * reference (events, favorites, ratings) is repointed to the survivor
 * before the losers are deleted; favorites/ratings use the same
 * NOT EXISTS-guarded UPDATE + DELETE idiom as cleanup-vdm-duplicates.ts to
 * avoid a primary-key conflict if a user somehow interacted with two
 * duplicate rows of the same place.
 *
 * Two ways of deciding that two rows are one place:
 *
 * - **Exact coordinates** (the default). Catches the duplicates this script
 *   was written for, where the same point was inserted twice.
 * - **`--similar`**, which weighs name, address and distance together (see
 *   matchVenues in @pulso/ingestion). Exact matching misses the majority of
 *   real duplicates because a duplicate rarely lands on the identical point:
 *   measured against the live directory, "Le Belmont" and "Belmont" sit 7 m
 *   apart, the two Escogriffe rows 30 m apart, and the two O Patro Výš rows
 *   111 m apart with different addresses. None of those group by `location`.
 *
 * Defaults to a dry run (reports what it would do, changes nothing).
 * Pass --apply to actually perform the merge, inside one transaction.
 *
 *   pnpm --filter @pulso/database run db:merge-duplicate-venues
 *   pnpm --filter @pulso/database run db:merge-duplicate-venues -- --similar
 *   pnpm --filter @pulso/database run db:merge-duplicate-venues -- --similar --apply
 */

interface VenueRow {
  id: string;
  name: string;
  address: string;
  category: string | null;
  secondary_categories: string[];
  image_url: string | null;
  image_source: string | null;
  image_attribution: string | null;
  image_page_url: string | null;
  longitude: number;
  latitude: number;
  event_count: number;
}

const BARE_STREET_NAME_PATTERN =
  /^(\d+[a-z]?\s+)?(rue|avenue|boulevard|chemin|montee|côte|cote|impasse|carré|carre|place)\s/i;
const KNOWN_PROPER_NOUN_VENUE_NAMES = new Set(['Place Bell', 'Place des Arts']);

function looksLikeBareName(venue: VenueRow): boolean {
  if (venue.name === 'Unknown venue') return true;
  if (venue.name === venue.address) return true;
  if (KNOWN_PROPER_NOUN_VENUE_NAMES.has(venue.name)) return false;
  return !venue.name.includes(',') && BARE_STREET_NAME_PATTERN.test(venue.name);
}

// Lower is better. A real, already-researched name+category beats a bare
// address every time, regardless of event count - event count only breaks
// ties between rows that are equally (un)resolved.
function scoreVenue(venue: VenueRow): number {
  const hasRealName = !looksLikeBareName(venue);
  const hasCategory = venue.category !== null;
  if (hasRealName && hasCategory) return 0;
  if (hasRealName) return 1;
  if (hasCategory) return 2;
  return 3;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const similar = process.argv.includes('--similar');
  const pool = createPool();

  try {
    const { rows: allVenues } = await pool.query<VenueRow>(
      `SELECT v.id, v.name, v.address, v.category, v.secondary_categories,
              v.image_url, v.image_source, v.image_attribution, v.image_page_url,
              ST_X(v.location) AS longitude, ST_Y(v.location) AS latitude,
              (SELECT count(*) FROM events e WHERE e.venue_id = v.id)::int AS event_count
       FROM venues v`
    );
    const byId = new Map(allVenues.map((v) => [v.id, v]));

    const groupedIds = similar
      ? groupBySimilarity(allVenues)
      : (
          await pool.query<{ ids: string[] }>(
            `SELECT array_agg(id) AS ids FROM venues GROUP BY location HAVING count(*) > 1`
          )
        ).rows;
    console.log(
      `[merge] ${groupedIds.length} duplicate group(s) by ${similar ? 'name/address/distance' : 'exact location'}.`
    );

    type Plan = { survivor: VenueRow; losers: VenueRow[] };
    const plans: Plan[] = [];
    for (const { ids } of groupedIds) {
      const group = ids.map((id) => byId.get(id)!).filter(Boolean);
      const sorted = [...group].sort(
        (a, b) => scoreVenue(a) - scoreVenue(b) || b.event_count - a.event_count
      );
      const [survivor, ...losers] = sorted;
      if (survivor) plans.push({ survivor, losers });
    }

    let totalEventsRepointed = 0;
    for (const { losers } of plans) {
      totalEventsRepointed += losers.reduce((sum, l) => sum + l.event_count, 0);
    }
    console.log(
      `[merge] ${plans.reduce((s, p) => s + p.losers.length, 0)} row(s) would be removed, ${totalEventsRepointed} event reference(s) repointed.`
    );

    if (!apply) {
      // Every group, not a sample. This is the only review step before an
      // irreversible delete, and showing 10 of 25 hides exactly the groups an
      // operator most needs to catch.
      console.log('\n[merge] DRY RUN - every group:');
      for (const { survivor, losers } of plans) {
        console.log(
          `  KEEP "${survivor.name}" (${survivor.category ?? 'no category'}, ${survivor.event_count} events)`
        );
        for (const loser of losers) {
          console.log(
            `    - remove "${loser.name}" (${loser.category ?? 'no category'}, ${loser.event_count} events)`
          );
        }
      }
      console.log('\n[merge] Re-run with --apply to actually perform this.');
      return;
    }

    await pool.query('BEGIN');
    try {
      for (const { survivor, losers } of plans) {
        const loserIds = losers.map((l) => l.id);
        if (loserIds.length === 0) continue;

        await pool.query(
          `UPDATE events SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [survivor.id, loserIds]
        );
        await pool.query(
          `DELETE FROM user_favorite_venues WHERE venue_id = ANY($1)
           AND user_id IN (SELECT user_id FROM user_favorite_venues WHERE venue_id = $2)`,
          [loserIds, survivor.id]
        );
        await pool.query(
          `UPDATE user_favorite_venues SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [survivor.id, loserIds]
        );
        await pool.query(
          `DELETE FROM venue_ratings WHERE venue_id = ANY($1)
           AND user_id IN (SELECT user_id FROM venue_ratings WHERE venue_id = $2)`,
          [loserIds, survivor.id]
        );
        await pool.query(
          `UPDATE venue_ratings SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [survivor.id, loserIds]
        );

        // Never lose a real image/secondary-category a loser happened to
        // have but the survivor doesn't - the survivor won on name/category
        // quality, not necessarily on every field.
        const mergedSecondary = [
          ...new Set([
            ...survivor.secondary_categories,
            ...losers.flatMap((l) => l.secondary_categories)
          ])
        ];
        // A photo is only usable together with the provenance that says
        // where it came from and what credit it needs, so the whole set moves
        // as one - taking the URL from a loser and leaving the survivor's
        // (empty) attribution behind would publish an uncredited image.
        const donor = survivor.image_url
          ? survivor
          : losers.find((l) => l.image_url);
        await pool.query(
          `UPDATE venues
           SET secondary_categories = $1, image_url = $2, image_source = $3,
               image_attribution = $4, image_page_url = $5
           WHERE id = $6`,
          [
            mergedSecondary,
            donor?.image_url ?? null,
            donor?.image_source ?? null,
            donor?.image_attribution ?? null,
            donor?.image_page_url ?? null,
            survivor.id
          ]
        );

        await pool.query(`DELETE FROM venues WHERE id = ANY($1)`, [loserIds]);
      }
      await pool.query('COMMIT');
      console.log(`[merge] Merged ${plans.length} group(s) successfully.`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } finally {
    await pool.end();
  }
}

/**
 * Groups rows that describe the same place, by the three-signal test.
 *
 * Transitive: if A matches B and B matches C, all three are one group even
 * when A and C do not match each other directly. That is the right reading
 * for a chain of progressively-drifted rows for one venue, which is exactly
 * how these duplicates accumulated - each ingestion pass compared against
 * the previous one, not the original.
 *
 * O(n²) over the whole venues table. At a few thousand rows that is a
 * second of CPU in a tool nobody runs in a loop, and the alternative -
 * blocking on a coarse key first - reintroduces the exact-match blind spot
 * this mode exists to fix.
 */
function groupBySimilarity(venues: VenueRow[]): Array<{ ids: string[] }> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  for (const venue of venues) parent.set(venue.id, venue.id);

  for (let i = 0; i < venues.length; i += 1) {
    for (let j = i + 1; j < venues.length; j += 1) {
      const left = venues[i]!;
      const right = venues[j]!;
      const match = matchVenues(
        {
          name: left.name,
          address: left.address,
          point: {
            longitude: Number(left.longitude),
            latitude: Number(left.latitude)
          }
        },
        {
          name: right.name,
          address: right.address,
          point: {
            longitude: Number(right.longitude),
            latitude: Number(right.latitude)
          }
        }
      );
      if (match.same) parent.set(find(left.id), find(right.id));
    }
  }

  const groups = new Map<string, string[]>();
  for (const venue of venues) {
    const root = find(venue.id);
    groups.set(root, [...(groups.get(root) ?? []), venue.id]);
  }
  return [...groups.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) => ({ ids }));
}

await main();
