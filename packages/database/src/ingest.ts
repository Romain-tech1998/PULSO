import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  createMontrealOpenDataConnector,
  createTicketmasterConnector,
  createParseBotRaClubsConnector,
  createParseBotRaEventsConnector,
  deriveDeterministicEventId,
  enrichMissingAddresses,
  enrichMissingCoordinates,
  extractInstagramWatchlist,
  fetchInstagramScoutSignals,
  geocodeAddress,
  mapAndDeduplicateRawEvents,
  normalizeForKey,
  runConnector,
  runVenueConnector,
  type IngestionConnector,
  type VenueConnector,
  type RawIngestedEvent,
  type RawIngestedVenue
} from '@pulso/ingestion';

import { createPool } from './client.js';
import { upsertPublicEvents } from './upsert-public-events.js';

/**
 * Manual, dev-local pilot script (`pnpm run db:ingest`). Per PROJECT_INDEX.md,
 * ingestion is only authorized at pilot/research stage - this is intentionally
 * NOT a cron job or production pipeline, just a way for a developer to
 * populate their local Postgres with real Montréal events for testing.
 *
 * ICS calendar sources are wired in @pulso/ingestion but not run here: there is
 * no registry of per-venue ICS URLs yet (montreal-source-registry.csv has no
 * such column) to configure createIcsCalendarConnector with.
 */

const registryCsvPath = fileURLToPath(
  new URL(
    '../../../docs/data/research/montreal-source-registry.csv',
    import.meta.url
  )
);

const instagramScoutOutputDirectory = fileURLToPath(
  new URL('../ingestion-output/', import.meta.url)
);

function buildConnectors(): IngestionConnector[] {
  const connectors: IngestionConnector[] = [createMontrealOpenDataConnector()];

  if (process.env.TICKETMASTER_API_KEY) {
    connectors.push(createTicketmasterConnector());
  } else {
    console.warn(
      '[ingest] Skipping Ticketmaster: TICKETMASTER_API_KEY is not set.'
    );
  }

  if (process.env.PARSE_BOT_API_KEY) {
    connectors.push(createParseBotRaEventsConnector());
  } else {
    console.warn(
      '[ingest] Skipping Parse.bot RA Events: PARSE_BOT_API_KEY is not set.'
    );
  }

  return connectors;
}

function buildVenueConnectors(): VenueConnector[] {
  const connectors: VenueConnector[] = [];
  if (process.env.PARSE_BOT_API_KEY) {
    connectors.push(createParseBotRaClubsConnector());
  } else {
    console.warn(
      '[ingest] Skipping Parse.bot RA Clubs: PARSE_BOT_API_KEY is not set.'
    );
  }
  return connectors;
}

// Nominatim's usage policy caps public requests at 1/second (see
// packages/ingestion/src/lib/geocode-fallback.ts).
const NOMINATIM_DELAY_MS = 1100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Venue connectors (e.g. Parse.bot RA clubs) may only return an address, no
 * coordinates. Unlike the events path, there is no `pointResolution` column
 * on `venues` to record uncertainty, so a venue whose location cannot be
 * resolved at all is skipped rather than inserted at a fabricated (0, 0)
 * point - the same "never invent a coordinate" rule enforced for events in
 * packages/ingestion/src/mapping/to-public-event.ts.
 */
async function resolveVenuePoint(
  venue: RawIngestedVenue
): Promise<{ longitude: number; latitude: number } | undefined> {
  if (venue.point) return venue.point;
  const queryParts = [venue.address, venue.name].filter(
    (part): part is string => Boolean(part && part.trim().length > 0)
  );
  if (queryParts.length === 0) return undefined;
  return geocodeAddress(`${queryParts.join(', ')}, Montréal, QC, Canada`);
}

async function runInstagramScout(): Promise<void> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accountId || !accessToken) {
    console.warn(
      '[ingest] Skipping Instagram Scout: INSTAGRAM_BUSINESS_ACCOUNT_ID/INSTAGRAM_ACCESS_TOKEN not set.'
    );
    return;
  }

  const registryCsv = await readFile(registryCsvPath, 'utf8');
  const targets = extractInstagramWatchlist(registryCsv);
  const signals = await fetchInstagramScoutSignals(targets);

  // Per DEC-0006, Instagram Scout output is a lead, not an event: it must go
  // through human review before ever becoming a Pulso event. Signals are
  // written to a timestamped local file for that review rather than inserted
  // into the database or left only in ephemeral console output.
  await mkdir(instagramScoutOutputDirectory, { recursive: true });
  const outputPath = fileURLToPath(
    new URL(
      `instagram-scout-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      new URL('../ingestion-output/', import.meta.url)
    )
  );
  await writeFile(outputPath, JSON.stringify(signals, null, 2), 'utf8');

  console.log(
    `[ingest] Instagram Scout found ${signals.length} signal(s) across ${targets.length} watched account(s) - written to ${outputPath} for manual review, none inserted.`
  );
}

async function main(): Promise<void> {
  const pool = createPool();
  const args = process.argv.slice(2);
  const runVenues = args.includes('--venues');

  try {
    if (runVenues) {
      console.log('[ingest] Running Venues ingestion...');
      const venueConnectors = buildVenueConnectors();
      for (const connector of venueConnectors) {
        const result = await runVenueConnector(connector);
        for (const error of result.errors) {
          console.warn(`[ingest] ${connector.id} error: ${error}`);
        }
        console.log(
          `[ingest] ${connector.id} fetched ${result.venues.length} raw venue(s).`
        );

        let geocoded = 0;
        let skippedNoPoint = 0;
        for (const venue of result.venues) {
          const point = await resolveVenuePoint(venue);
          if (!point) {
            skippedNoPoint += 1;
            console.warn(
              `[ingest] ${connector.id}: skipping "${venue.name}" - no source coordinates and geocoding found nothing.`
            );
            continue;
          }
          if (!venue.point) {
            geocoded += 1;
            // Respect Nominatim's 1 request/second usage policy between calls.
            await delay(NOMINATIM_DELAY_MS);
          }

          // Deterministic id (same "venue|name|address" convention as
          // to-public-event.ts, normalized the same way as computeDedupeKey)
          // so re-running this job - or an event elsewhere referencing the
          // same real venue under a slightly different spelling - converges
          // on the same row instead of inserting a fresh duplicate.
          const venueId = deriveDeterministicEventId(
            `venue|${normalizeForKey(venue.name)}|${normalizeForKey(venue.address ?? '')}`
          );
          await pool.query(
            `INSERT INTO venues (id, name, address, location)
             VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               address = EXCLUDED.address,
               location = EXCLUDED.location`,
            [
              venueId,
              venue.name,
              venue.address || '',
              point.longitude,
              point.latitude
            ]
          );
        }
        console.log(
          `[ingest] ${connector.id}: geocoded ${geocoded}, skipped ${skippedNoPoint} (no resolvable location).`
        );
      }
      return;
    }

    console.log('[ingest] Running Events ingestion...');
    const connectors = buildConnectors();
    const rawEvents: RawIngestedEvent[] = [];
    for (const connector of connectors) {
      const result = await runConnector(connector);
      for (const error of result.errors) {
        console.warn(`[ingest] ${connector.id} error: ${error}`);
      }
      console.log(
        `[ingest] ${connector.id} fetched ${result.events.length} raw event(s).`
      );
      rawEvents.push(...result.events);
    }

    // Category is already resolved per-connector (or 'unmapped') before this
    // point, and out-of-scope events are discarded later in
    // mapAndDeduplicateRawEvents regardless - filtering them out now avoids
    // burning enrichMissingCoordinates/enrichMissingAddresses's rate-limited
    // Nominatim budget (1 req/s) on ~87% of raw volume that gets thrown away
    // anyway (see PROJECT_INDEX.md entry 28).
    const inScopeEvents = rawEvents.filter(
      (event) => event.category !== 'unmapped'
    );
    console.log(
      `[ingest] ${rawEvents.length - inScopeEvents.length} out-of-scope event(s) skipped before enrichment.`
    );

    const withPoints = await enrichMissingCoordinates(inScopeEvents);
    const enriched = await enrichMissingAddresses(withPoints);
    const { events, skipped } = mapAndDeduplicateRawEvents(enriched);

    await upsertPublicEvents(pool, events);

    const skipCounts = skipped.reduce<Record<string, number>>((acc, skip) => {
      acc[skip.reason] = (acc[skip.reason] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `[ingest] Upserted ${events.length} event(s). Skipped ${skipped.length}: ${JSON.stringify(skipCounts)}`
    );

    await runInstagramScout();
  } finally {
    await pool.end();
  }
}

await main();
