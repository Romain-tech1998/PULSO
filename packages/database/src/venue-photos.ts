/**
 * Operator command for venue photos: see what is shown, and take it down.
 *
 * Most venue photos are borrowed. Pulso reads the Open Graph preview image a
 * business publishes about itself and hotlinks it - never copies it - which
 * is what makes 40% photo coverage possible at all. Borrowing carries an
 * obligation: when the business asks Pulso to stop, it has to actually stop,
 * permanently, without anyone having to remember not to re-run the importer.
 *
 * That is why removal writes a suppression row rather than just clearing the
 * column. Clearing `venues.image_url` alone would be undone by the next
 * import, which would cheerfully re-fetch the very photo somebody asked to
 * have taken down.
 *
 *   pnpm db:venue-photos                          # summary by source
 *   pnpm db:venue-photos -- --list website_og     # what is shown, and from where
 *   pnpm db:venue-photos -- --find "cocktail"     # locate a venue by name
 *   pnpm db:venue-photos -- --remove <venue-id>   # take it down, permanently
 *   pnpm db:venue-photos -- --remove <venue-id> --reason "owner request"
 *   pnpm db:venue-photos -- --remove <venue-id> --this-one-only
 *   pnpm db:venue-photos -- --restore <venue-id>  # lift the suppression
 *
 * RFC-0001 keeps correction an internal operator action rather than a public
 * administration product, which is why this is a command and not a web
 * console.
 */
import { createPool } from './client.js';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const listSource = flag('list');
const find = flag('find');
const remove = flag('remove');
const restore = flag('restore');
const reason = flag('reason');
// A specific image is wrong or unflattering, and a better one should replace
// it. Narrower than the default, which is "stop using our pictures".
const thisOneOnly = process.argv.includes('--this-one-only');

const pool = createPool();

try {
  if (remove) {
    const venue = await pool.query<{
      name: string;
      image_url: string | null;
      image_source: string | null;
      image_page_url: string | null;
    }>(
      `SELECT name, image_url, image_source, image_page_url
       FROM venues WHERE id = $1`,
      [remove]
    );
    const row = venue.rows[0];
    if (!row) {
      console.error(`No venue with id ${remove}.`);
      process.exitCode = 1;
    } else if (!row.image_url && thisOneOnly) {
      console.error(
        `${row.name} has no photo, so there is no single URL to suppress. Re-run without --this-one-only to block future ones.`
      );
      process.exitCode = 1;
    } else {
      await pool.query(
        `INSERT INTO venue_photo_suppressions (venue_id, image_url, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (venue_id, coalesce(image_url, ''))
         DO UPDATE SET reason = EXCLUDED.reason, suppressed_at = now()`,
        [remove, thisOneOnly ? row.image_url : null, reason ?? null]
      );
      await pool.query(
        `UPDATE venues
         SET image_url = NULL, image_source = NULL,
             image_attribution = NULL, image_page_url = NULL
         WHERE id = $1`,
        [remove]
      );
      console.log(
        `Removed the photo from ${row.name}${row.image_source ? ` (was ${row.image_source})` : ''}.`
      );
      console.log(
        thisOneOnly
          ? 'That specific image will not be re-imported. A different one still can.'
          : 'No photo will be re-imported for this venue.'
      );
    }
  } else if (restore) {
    const result = await pool.query(
      `DELETE FROM venue_photo_suppressions WHERE venue_id = $1`,
      [restore]
    );
    console.log(
      `Lifted ${result.rowCount ?? 0} suppression(s). The next import may set a photo again.`
    );
  } else if (find) {
    const result = await pool.query<{
      id: string;
      name: string;
      image_source: string | null;
      review_state: string;
    }>(
      `SELECT id, name, image_source, review_state
       FROM venues
       WHERE pulso_fold(name) LIKE '%' || pulso_fold($1) || '%'
       ORDER BY name
       LIMIT 40`,
      [find]
    );
    for (const row of result.rows) {
      console.log(
        `${row.id}  ${row.name.padEnd(40)} ${(row.image_source ?? 'no photo').padEnd(20)} ${row.review_state}`
      );
    }
    console.log(`${result.rows.length} match(es).`);
  } else if (listSource) {
    const result = await pool.query<{
      id: string;
      name: string;
      image_url: string;
      image_page_url: string | null;
    }>(
      `SELECT id, name, image_url, image_page_url
       FROM venues
       WHERE image_source = $1
       ORDER BY name`,
      [listSource]
    );
    for (const row of result.rows) {
      console.log(`${row.id}  ${row.name}`);
      console.log(`    image: ${row.image_url}`);
      if (row.image_page_url) console.log(`    from:  ${row.image_page_url}`);
    }
    console.log(`${result.rows.length} venue(s) with source ${listSource}.`);
  } else {
    const summary = await pool.query<{
      image_source: string | null;
      count: string;
    }>(
      `SELECT image_source, count(*) AS count
       FROM venues
       GROUP BY image_source
       ORDER BY count(*) DESC`
    );
    console.log('Venue photos by source:');
    for (const row of summary.rows) {
      console.log(`  ${(row.image_source ?? 'none').padEnd(22)} ${row.count}`);
    }
    const suppressed = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM venue_photo_suppressions`
    );
    console.log(`Suppressions in force: ${suppressed.rows[0]?.count ?? 0}`);
    console.log(
      '\nRemove one with: pnpm db:venue-photos -- --remove <venue-id> --reason "..."'
    );
    console.log('Find an id with:  pnpm db:venue-photos -- --find "<name>"');
  }
} finally {
  await pool.end();
}
