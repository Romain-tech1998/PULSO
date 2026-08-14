import { createPool } from './client.js';

/**
 * One-time cleanup for two Ville de Montréal data-quality issues found by
 * direct database inspection (see PROJECT_INDEX.md):
 *
 * 1. Duplicate events: the source can change a venue label or the title slug
 *    between exports. Ville de Montréal event URLs end with a stable numeric
 *    entry id, so duplicate detection uses that id plus the start instant and
 *    retains the newest observed version. upsert-public-events.ts applies the
 *    same identity rule to future ingestions.
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
    // A "duplicate" here means the same stable civic source entry and start
    // instant. The source id remains stable even when its human-readable URL
    // slug changes. Keep the newest observation, then the most descriptive
    // title as a deterministic tie-breaker.
    const dupeGroups = await pool.query<{
      keep_id: string;
      remove_ids: string[];
    }>(
      `
      SELECT (
               array_agg(
                 e.id ORDER BY e.observed_at DESC NULLS LAST,
                 length(e.title) DESC,
                 e.id
               )
             )[1] AS keep_id,
             (
               array_agg(
                 e.id ORDER BY e.observed_at DESC NULLS LAST,
                 length(e.title) DESC,
                 e.id
               )
             )[2:] AS remove_ids
      FROM events e
      WHERE e.source_name = $1
        AND (regexp_match(e.source_url, '-([0-9]+)(?:[/?#]*)$'))[1] IS NOT NULL
      GROUP BY
        (regexp_match(e.source_url, '-([0-9]+)(?:[/?#]*)$'))[1],
        e.starts_at
      HAVING count(*) > 1
    `,
      [SOURCE_NAME]
    );

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
      for (const {
        keep_id: keepId,
        remove_ids: removeIds
      } of dupeGroups.rows) {
        if (removeIds.length === 0) continue;
        const sourceRows = await pool.query<{
          source_name: string;
          source_url: string;
          observed_at: Date;
        }>(
          `SELECT source_name, source_url, observed_at
           FROM events
           WHERE id = ANY($1)`,
          [removeIds]
        );
        const additionalSources = sourceRows.rows.map((row) => ({
          name: row.source_name,
          url: row.source_url,
          observedAt: row.observed_at.toISOString()
        }));
        await pool.query(
          `UPDATE events
           SET additional_sources = coalesce(additional_sources, '[]'::jsonb) || $2::jsonb
           WHERE id = $1`,
          [keepId, JSON.stringify(additionalSources)]
        );
        await pool.query(
          `UPDATE event_attendance SET event_id = $1 WHERE event_id = ANY($2)
           AND NOT EXISTS (SELECT 1 FROM event_attendance ea2 WHERE ea2.event_id = $1 AND ea2.user_id = event_attendance.user_id)`,
          [keepId, removeIds]
        );
        await pool.query(
          `DELETE FROM event_attendance WHERE event_id = ANY($1)`,
          [removeIds]
        );
        await pool.query(
          `UPDATE forum_posts SET event_id = $1 WHERE event_id = ANY($2)`,
          [keepId, removeIds]
        );
        await pool.query(
          `UPDATE user_favorite_events SET event_id = $1 WHERE event_id = ANY($2)
           AND NOT EXISTS (SELECT 1 FROM user_favorite_events f2 WHERE f2.event_id = $1 AND f2.user_id = user_favorite_events.user_id)`,
          [keepId, removeIds]
        );
        await pool.query(
          `DELETE FROM user_favorite_events WHERE event_id = ANY($1)`,
          [removeIds]
        );
        await pool.query(
          `UPDATE forum_follows SET event_id = $1 WHERE event_id = ANY($2)
           AND NOT EXISTS (SELECT 1 FROM forum_follows ff2 WHERE ff2.event_id = $1 AND ff2.user_id = forum_follows.user_id)`,
          [keepId, removeIds]
        );
        await pool.query(`DELETE FROM forum_follows WHERE event_id = ANY($1)`, [
          removeIds
        ]);
        await pool.query(
          `UPDATE event_photos SET event_id = $1 WHERE event_id = ANY($2)`,
          [keepId, removeIds]
        );
        await pool.query(
          `UPDATE groups SET event_id = $1
           WHERE id = (
             SELECT id FROM groups
             WHERE event_id = ANY($2)
             ORDER BY created_at, id
             LIMIT 1
           )
           AND NOT EXISTS (SELECT 1 FROM groups g2 WHERE g2.event_id = $1)`,
          [keepId, removeIds]
        );
        // A second event-linked group cannot share the survivor because of
        // the unique event/group relationship. Preserve it as a standalone
        // group instead of deleting its members and history.
        await pool.query(
          `UPDATE groups SET event_id = NULL WHERE event_id = ANY($1)`,
          [removeIds]
        );
      }

      const familyIds = familyEvents.rows.map((r) => r.id);
      if (familyIds.length > 0) {
        await pool.query(
          `DELETE FROM event_attendance WHERE event_id = ANY($1)`,
          [familyIds]
        );
        await pool.query(`DELETE FROM forum_posts WHERE event_id = ANY($1)`, [
          familyIds
        ]);
        await pool.query(
          `DELETE FROM user_favorite_events WHERE event_id = ANY($1)`,
          [familyIds]
        );
        await pool.query(`DELETE FROM forum_follows WHERE event_id = ANY($1)`, [
          familyIds
        ]);
        await pool.query(`DELETE FROM event_photos WHERE event_id = ANY($1)`, [
          familyIds
        ]);
        await pool.query(
          `UPDATE groups SET event_id = NULL WHERE event_id = ANY($1)`,
          [familyIds]
        );
      }

      const result = await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [
        idsToRemove
      ]);
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
