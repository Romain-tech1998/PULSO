import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  linkInstagramScoutSourcesToKnownVenues,
  parseCsv,
  type InstagramScoutKnownVenue,
  type InstagramScoutVenueSource
} from '@pulso/ingestion';

import { createPool } from './client.js';

const registryPath = fileURLToPath(
  new URL(
    '../../../docs/data/research/montreal-source-registry.csv',
    import.meta.url
  )
);
const outputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);
const fixedVenueTypes = new Set([
  'venue',
  'nightclub',
  'bar',
  'comedy',
  'hybrid_space'
]);

async function main(): Promise<void> {
  const rows = parseCsv(await readFile(registryPath, 'utf8'));
  const sources: InstagramScoutVenueSource[] = rows
    .filter(
      (row) =>
        Boolean(row.instagram_handle) &&
        fixedVenueTypes.has(row.normalized_source_type ?? '')
    )
    .map((row) => ({
      sourceId: row.source_id ?? '',
      displayName: row.display_name ?? '',
      normalizedName: row.normalized_name ?? '',
      instagramHandle: row.instagram_handle ?? ''
    }));

  const pool = createPool();
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      address: string;
      longitude: string;
      latitude: string;
    }>(
      `SELECT id, name, address,
              ST_X(location::geometry)::text AS longitude,
              ST_Y(location::geometry)::text AS latitude
       FROM venues
       ORDER BY name`
    );
    const venues: InstagramScoutKnownVenue[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      }
    }));
    const linking = linkInstagramScoutSourcesToKnownVenues(sources, venues);
    const generatedAt = new Date().toISOString();
    const outputPath = join(
      outputDirectory,
      `instagram-scout-venue-links-${generatedAt.replace(/[:.]/gu, '-')}.json`
    );
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt,
          sourceCount: sources.length,
          venueCount: venues.length,
          linkedCount: linking.linked.length,
          ambiguousCount: linking.ambiguousSourceIds.length,
          unmatchedCount: linking.unmatchedSourceIds.length,
          ...linking,
          databaseWrites: 0,
          publicationAuthorized: false
        },
        null,
        2
      ),
      'utf8'
    );
    console.log(
      JSON.stringify({
        outputPath,
        sourceCount: sources.length,
        venueCount: venues.length,
        linkedCount: linking.linked.length,
        ambiguousCount: linking.ambiguousSourceIds.length,
        unmatchedCount: linking.unmatchedSourceIds.length,
        databaseWrites: 0,
        publicationAuthorized: false
      })
    );
  } finally {
    await pool.end();
  }
}

await main();
