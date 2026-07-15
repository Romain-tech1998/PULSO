import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createPool } from './client.js';

const migrationsDirectory = fileURLToPath(
  new URL('../migrations', import.meta.url)
);
const pool = createPool();

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pulso_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pulso_migrations WHERE name = $1) AS exists',
      [file]
    );
    if (alreadyApplied.rows[0]?.exists) continue;

    const sql = await readFile(
      new URL(`../migrations/${file}`, import.meta.url),
      'utf8'
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO pulso_migrations (name) VALUES ($1)', [
        file
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
