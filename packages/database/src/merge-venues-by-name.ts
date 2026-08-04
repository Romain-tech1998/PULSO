import { createPool } from './client.js';

/**
 * Follow-up to merge-duplicate-venues.ts, run after rename-known-venues.ts.
 * That script intentionally renames several address-fallback rows to a real
 * venue name that's already used by a *different* venues row at slightly
 * different coordinates (two separate geocode passes for the same real
 * place, close but not identical - too far apart for
 * merge-duplicate-venues.ts's exact-location GROUP BY to catch). Once
 * renamed, those rows are exact-name duplicates of a real place and should
 * become one row, same as merge-duplicate-venues.ts does for exact-location
 * duplicates - same reasoning, just grouped by `name` instead of `location`.
 *
 * Only ever touches venues whose name is NOT null (never groups the
 * still-unresolved bare-address rows together - two different addresses
 * are never the same place just because geocoding produced the same
 * string). Survivor picked by category presence, then by event count -
 * every row in a group already carries the same real name by construction,
 * so name quality is never a factor here (unlike merge-duplicate-venues.ts).
 *
 * Defaults to a dry run (reports what it would do, changes nothing).
 * Pass --apply to actually perform the merge, inside one transaction.
 *
 *   pnpm --filter @pulso/database run db:merge-venues-by-name
 *   pnpm --filter @pulso/database run db:merge-venues-by-name -- --apply
 */

interface VenueRow {
  id: string;
  name: string;
  category: string | null;
  secondary_categories: string[];
  image_url: string | null;
  event_count: number;
}

function scoreVenue(venue: VenueRow): number {
  return venue.category !== null ? 0 : 1;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pool = createPool();

  try {
    const { rows: groupedIds } = await pool.query<{ ids: string[] }>(
      `SELECT array_agg(id) AS ids FROM venues WHERE name IS NOT NULL GROUP BY name HAVING count(*) > 1`
    );
    console.log(
      `[merge-by-name] ${groupedIds.length} duplicate-name group(s).`
    );

    const allIds = groupedIds.flatMap((row) => row.ids);
    const { rows: venues } = await pool.query<VenueRow>(
      `SELECT v.id, v.name, v.category, v.secondary_categories, v.image_url,
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
      `[merge-by-name] ${plans.reduce((s, p) => s + p.losers.length, 0)} row(s) would be removed, ${totalEventsRepointed} event reference(s) repointed.`
    );

    if (!apply) {
      console.log('\n[merge-by-name] DRY RUN:');
      for (const { survivor, losers } of plans) {
        console.log(
          `  KEEP "${survivor.name}" (${survivor.category ?? 'no category'}, ${survivor.event_count} events)`
        );
        for (const loser of losers) {
          console.log(
            `    - remove duplicate row (${loser.event_count} events)`
          );
        }
      }
      console.log(
        '\n[merge-by-name] Re-run with --apply to actually perform this.'
      );
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
      console.log(
        `[merge-by-name] Merged ${plans.length} group(s) successfully.`
      );
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } finally {
    await pool.end();
  }
}

await main();
