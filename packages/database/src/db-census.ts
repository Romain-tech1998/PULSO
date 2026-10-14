import { createPool } from './client.js';

/**
 * Read-only census of whatever database DATABASE_URL points at
 * (`pnpm db:census`). Writes nothing.
 *
 * Exists because on 2026-10-11 the live API served zero events and zero
 * venues while every scheduled ingestion run up to the pause had been green.
 * The GitHub secret predates the Neon deployment by two weeks, so the
 * question is which database CI has actually been writing into. The host and
 * database name identify it without printing a credential; the user count
 * tells a database people have signed up to from one only CI ever touched.
 */
const pool = createPool();

try {
  const url = new URL(process.env.DATABASE_URL!);
  console.log(
    `[census] host=${url.hostname} database=${url.pathname.slice(1)}`
  );

  const { rows } = await pool.query<Record<string, string | null>>(
    `SELECT
       (SELECT count(*) FROM venues)::text AS venues,
       (SELECT count(*) FROM venues WHERE review_state = 'published')::text AS published_venues,
       (SELECT count(*) FROM events)::text AS events,
       (SELECT count(*) FROM events WHERE starts_at >= now())::text AS upcoming_events,
       (SELECT max(starts_at) FROM events)::text AS latest_event,
       (SELECT count(*) FROM users)::text AS users`
  );
  for (const [key, value] of Object.entries(rows[0] ?? {})) {
    console.log(`[census] ${key}=${value ?? 'null'}`);
  }
} finally {
  await pool.end();
}
