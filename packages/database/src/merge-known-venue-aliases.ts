import { createPool } from './client.js';

/**
 * Consolidates source-specific sub-venue aliases that Pulso intentionally
 * exposes as one public place. The National Bank Open publishes Centre Court
 * and Rogers Court separately, but both belong to the Stade IGA complex at
 * 285 Rue Gary-Carter and should share one Pulso venue sheet.
 *
 * Defaults to a dry run. Pass --apply to merge inside one transaction.
 */

const CANONICAL_ID = '4f2b4dd1-c94b-532c-b556-1d37ad27026a';
const CANONICAL_NAME = 'Stade IGA';
const CANONICAL_ADDRESS = '285 Rue Gary-Carter, Montréal, QC';
const CANONICAL_LONGITUDE = -73.627173;
const CANONICAL_LATITUDE = 45.532854;
const ALIAS_NAMES = ['CENTRE COURT - IGA STADIUM', 'Rogers Court', 'Stade IGA'];

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pool = createPool();

  try {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      event_count: number;
      secondary_categories: string[];
      image_url: string | null;
    }>(
      `SELECT v.id, v.name, v.secondary_categories, v.image_url,
              (SELECT count(*) FROM events e WHERE e.venue_id = v.id)::int AS event_count
       FROM venues v
       WHERE v.name = ANY($1)
          OR lower(regexp_replace(v.address, '[^a-zA-Z0-9]+', ' ', 'g'))
             LIKE '%285 rue gary carter%'`,
      [ALIAS_NAMES]
    );

    const survivor = rows.find((row) => row.id === CANONICAL_ID);
    if (!survivor) {
      throw new Error(
        `Canonical Stade IGA venue ${CANONICAL_ID} was not found.`
      );
    }
    const losers = rows.filter((row) => row.id !== CANONICAL_ID);
    console.log(
      `[merge-known-venues] Stade IGA: ${rows.length} row(s), ${losers.length} duplicate row(s), ${rows.reduce((sum, row) => sum + row.event_count, 0)} event(s).`
    );

    if (!apply) {
      for (const row of rows) {
        console.log(
          `  ${row.id === CANONICAL_ID ? 'KEEP' : 'MERGE'} "${row.name}" (${row.event_count} events)`
        );
      }
      console.log('[merge-known-venues] DRY RUN — re-run with --apply.');
      return;
    }

    await pool.query('BEGIN');
    try {
      const loserIds = losers.map((row) => row.id);
      if (loserIds.length > 0) {
        await pool.query(
          `UPDATE events SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [CANONICAL_ID, loserIds]
        );
        await pool.query(
          `DELETE FROM user_favorite_venues WHERE venue_id = ANY($1)
           AND user_id IN (SELECT user_id FROM user_favorite_venues WHERE venue_id = $2)`,
          [loserIds, CANONICAL_ID]
        );
        await pool.query(
          `UPDATE user_favorite_venues SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [CANONICAL_ID, loserIds]
        );
        await pool.query(
          `DELETE FROM venue_ratings WHERE venue_id = ANY($1)
           AND user_id IN (SELECT user_id FROM venue_ratings WHERE venue_id = $2)`,
          [loserIds, CANONICAL_ID]
        );
        await pool.query(
          `UPDATE venue_ratings SET venue_id = $1 WHERE venue_id = ANY($2)`,
          [CANONICAL_ID, loserIds]
        );
      }

      const secondaryCategories = [
        ...new Set(rows.flatMap((row) => row.secondary_categories))
      ];
      const imageUrl =
        survivor.image_url ??
        rows.find((row) => row.image_url)?.image_url ??
        null;
      await pool.query(
        `UPDATE venues
         SET name = $2,
             address = $3,
             location = ST_SetSRID(ST_MakePoint($4, $5), 4326),
             category = 'other',
             secondary_categories = $6,
             image_url = $7
         WHERE id = $1`,
        [
          CANONICAL_ID,
          CANONICAL_NAME,
          CANONICAL_ADDRESS,
          CANONICAL_LONGITUDE,
          CANONICAL_LATITUDE,
          secondaryCategories,
          imageUrl
        ]
      );
      if (loserIds.length > 0) {
        await pool.query(`DELETE FROM venues WHERE id = ANY($1)`, [loserIds]);
      }
      await pool.query('COMMIT');
      console.log(
        `[merge-known-venues] Stade IGA merged successfully; removed ${loserIds.length} duplicate row(s).`
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
