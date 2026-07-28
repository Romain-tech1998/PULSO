import { createPool } from './client.js';

/**
 * One-time cleanup for two Ville de Montréal data-quality issues found by
 * direct database inspection (see PROJECT_INDEX.md):
 *
 * 1. Duplicate events: the open-data connector's free-text venue-name
 *    column (titre_adresse) was observed to vary across separate CSV
 *    exports for the exact same calendar entry (same source_url, same
 *    address, same date) - since that field fed the deterministic event
 *    id, each ingestion run with slightly different text produced a new
 *    id, and the DB upsert (keyed on id) inserted a new row instead of
 *    updating the existing one. Fixed going forward in
 *    montreal-open-data.ts (identitySeed now anchors identity to the
 *    stable civic address instead) - this script cleans up the rows that
 *    already accumulated before that fix.
 * 2. Family/kids-audience events: out of MVP-0001's festive/nightlife
 *    scope, now excluded at ingestion time (see
 *    looksLikeFamilyOrKidsEvent in montreal-open-data.ts) - this removes
 *    the ones already ingested before that filter existed.
 *
 * Defaults to a dry run (reports what it would do, changes nothing).
 * Pass --apply to actually perform the deletes, inside one transaction.
 *
 *   pnpm --filter @pulso/database run db:cleanup-vdm-duplicates
 *   pnpm --filter @pulso/database run db:cleanup-vdm-duplicates -- --apply
 */

const SOURCE_NAME = 'Ville de Montréal — Événements publics';

const FAMILY_AUDIENCE_KEYWORDS = [
  'enfant',
  'jeune public',
  'en famille',
  'tout-petit',
  'tout petit',
  'bébé',
  'pour petits et grands'
];

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pool = createPool();

  try {
    // --- 1. Duplicate events -------------------------------------------
    // A "duplicate" here means: same title, same venue (by address), same
    // start time, same source_url - i.e. provably the same calendar entry,
    // not just a coincidental same-day/same-address pairing of two
    // genuinely different events. Keeps the row with the lexicographically
    // smallest id (arbitrary but deterministic) as the survivor.
    const dupeGroups = await pool.query<{
      keep_id: string;
      remove_ids: string[];
    }>(`
      SELECT (array_agg(e.id ORDER BY e.id))[1] AS keep_id,
             (array_agg(e.id ORDER BY e.id))[2:] AS remove_ids
      FROM events e
      JOIN venues v ON v.id = e.venue_id
      WHERE e.source_name = $1
      GROUP BY e.title, v.address, e.starts_at, e.source_url
      HAVING count(*) > 1
    `, [SOURCE_NAME]);

    const allRemoveIds = dupeGroups.rows.flatMap((row) => row.remove_ids);
    console.log(
      `[cleanup] Duplicate events: ${dupeGroups.rows.length} group(s), ${allRemoveIds.length} row(s) to remove.`
    );

    // --- 2. Family/kids-audience events ---------------------------------
    const keywordPattern = FAMILY_AUDIENCE_KEYWORDS.map((k) => `%${k}%`);
    const familyEvents = await pool.query<{ id: string; title: string }>(
      `SELECT id, title FROM events
       WHERE source_name = $1
       AND (lower(title) LIKE ANY($2) OR lower(coalesce(description, '')) LIKE ANY($2))`,
      [SOURCE_NAME, keywordPattern]
    );
    console.log(
      `[cleanup] Family/kids-audience events: ${familyEvents.rows.length} row(s) to remove.`
    );
    if (!apply) {
      console.log('[cleanup] Sample of family/kids matches (first 10):');
      for (const row of familyEvents.rows.slice(0, 10)) {
        console.log(`  - ${row.title}`);
      }
    }

    const idsToRemove = [
      ...new Set([...allRemoveIds, ...familyEvents.rows.map((r) => r.id)])
    ];

    if (!apply) {
      console.log(
        `\n[cleanup] DRY RUN - ${idsToRemove.length} total event row(s) would be removed (foreign-key references repointed to each group's surviving row first). Re-run with --apply to actually perform this.`
      );
      return;
    }

    if (idsToRemove.length === 0) {
      console.log('[cleanup] Nothing to remove.');
      return;
    }

    await pool.query('BEGIN');
    try {
      // Re-point references from a removed duplicate to its group's
      // survivor before deleting it, so no user-generated data (a
      // favorite, an attendance mark, a forum post) is silently dropped.
      // Family/kids rows have no survivor to repoint to - their own
      // references are removed outright, same as deleting any other
      // out-of-scope event.
      for (const { keep_id: keepId, remove_ids: removeIds } of dupeGroups.rows) {
        if (removeIds.length === 0) continue;
        await pool.query(
          `UPDATE event_attendance SET event_id = $1 WHERE event_id = ANY($2)
           AND NOT EXISTS (SELECT 1 FROM event_attendance ea2 WHERE ea2.event_id = $1 AND ea2.user_id = event_attendance.user_id)`,
          [keepId, removeIds]
        );
        await pool.query(`DELETE FROM event_attendance WHERE event_id = ANY($1)`, [removeIds]);
        await pool.query(`UPDATE forum_posts SET event_id = $1 WHERE event_id = ANY($2)`, [
          keepId,
          removeIds
        ]);
        await pool.query(
          `UPDATE user_favorite_events SET event_id = $1 WHERE event_id = ANY($2)
           AND NOT EXISTS (SELECT 1 FROM user_favorite_events f2 WHERE f2.event_id = $1 AND f2.user_id = user_favorite_events.user_id)`,
          [keepId, removeIds]
        );
        await pool.query(`DELETE FROM user_favorite_events WHERE event_id = ANY($1)`, [
          removeIds
        ]);
      }

      const familyIds = familyEvents.rows.map((r) => r.id);
      if (familyIds.length > 0) {
        await pool.query(`DELETE FROM event_attendance WHERE event_id = ANY($1)`, [familyIds]);
        await pool.query(`DELETE FROM forum_posts WHERE event_id = ANY($1)`, [familyIds]);
        await pool.query(`DELETE FROM user_favorite_events WHERE event_id = ANY($1)`, [
          familyIds
        ]);
      }

      const result = await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [idsToRemove]);
      await pool.query('COMMIT');
      console.log(`[cleanup] Removed ${result.rowCount} event row(s).`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } finally {
    await pool.end();
  }
}

await main();
