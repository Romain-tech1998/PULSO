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
 * Defaults to a dry run (reports what it would do, changes nothing).
 * Pass --apply to actually perform the merge, inside one transaction.
 *
 *   pnpm --filter @pulso/database run db:merge-duplicate-venues
 *   pnpm --filter @pulso/database run db:merge-duplicate-venues -- --apply
 */

interface VenueRow {
  id: string;
  name: string;
  address: string;
  category: string | null;
  secondary_categories: string[];
  image_url: string | null;
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
  const pool = createPool();

  try {
    const { rows: groupedIds } = await pool.query<{ ids: string[] }>(
      `SELECT array_agg(id) AS ids FROM venues GROUP BY location HAVING count(*) > 1`
    );
    console.log(`[merge] ${groupedIds.length} duplicate-location group(s).`);

    const allIds = groupedIds.flatMap((row) => row.ids);
    const { rows: venues } = await pool.query<VenueRow>(
      `SELECT v.id, v.name, v.address, v.category, v.secondary_categories, v.image_url,
              (SELECT count(*) FROM events e WHERE e.venue_id = v.id)::int AS event_count
       FROM venues v WHERE v.id = ANY($1::uuid[])`,
      [allIds]
    );
    const byId = new Map(venues.map((v) => [v.id, v]));

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
      console.log('\n[merge] DRY RUN - sample of the first 10 groups:');
      for (const { survivor, losers } of plans.slice(0, 10)) {
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
        const mergedImage =
          survivor.image_url ??
          losers.find((l) => l.image_url)?.image_url ??
          null;
        await pool.query(
          `UPDATE venues SET secondary_categories = $1, image_url = $2 WHERE id = $3`,
          [mergedSecondary, mergedImage, survivor.id]
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

await main();
