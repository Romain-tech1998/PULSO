import type { PublicEvent } from '@pulso/contracts';
import type { Pool } from 'pg';

import { PostgresNotificationsRepository } from './notifications-repository.js';

export interface UpsertableEvent {
  event: PublicEvent;
  additionalSources?: Array<{ name: string; url: string; observedAt: string }>;
}

const VILLE_MONTREAL_SOURCE_NAME = 'Ville de Montréal — Événements publics';

const STADE_IGA_CANONICAL_VENUE: PublicEvent['venue'] = {
  id: '4f2b4dd1-c94b-532c-b556-1d37ad27026a',
  name: 'Stade IGA',
  address: '285 Rue Gary-Carter, Montréal, QC',
  point: { longitude: -73.627173, latitude: 45.532854 },
  category: 'other'
};

function normalizeVenueText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalizeKnownVenue(
  venue: PublicEvent['venue']
): PublicEvent['venue'] {
  const name = normalizeVenueText(venue.name);
  // Ingested events always carry an address - only a DEC-0022 on_approval
  // event withholds one, and those are never ingested. Falling back to the
  // empty string simply matches no canonical rule, which is the right answer
  // for a venue with no address to canonicalize.
  const address = normalizeVenueText(venue.address ?? '');
  const isStadeIga =
    address.includes('285 rue gary carter') ||
    name === 'rogers court' ||
    name === 'centre court iga stadium' ||
    name === 'stade iga';

  return isStadeIga ? { ...venue, ...STADE_IGA_CANONICAL_VENUE } : venue;
}

export function getStableSourceEntryId(
  sourceName: string,
  sourceUrl: string
): string | null {
  if (sourceName !== VILLE_MONTREAL_SOURCE_NAME) return null;

  try {
    const pathname = new URL(sourceUrl).pathname.replace(/\/+$/, '');
    return pathname.match(/-(\d+)$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Inverse of repository.ts's `toPublicEvent` row-mapper: persists ingestion
 * output (already shaped as PublicEvent, see @pulso/ingestion's
 * mapRawEventToPublicEvent) into the venues/events tables. Upserts are keyed
 * on the deterministic ids ingestion derives from a content hash, so re-running
 * the same ingestion pass updates existing rows instead of duplicating them.
 */
export async function upsertPublicEvents(
  pool: Pool,
  events: UpsertableEvent[]
): Promise<void> {
  const notifications = new PostgresNotificationsRepository(pool);
  for (const { event, additionalSources = [] } of events) {
    const venue = canonicalizeKnownVenue(event.venue);
    // A source can occasionally change a venue label or title between
    // exports, which changes the derived UUID even though the calendar entry
    // itself did not change. Ville de Montréal event URLs contain a stable
    // numeric entry id after the mutable title slug; use it with the start
    // instant as the authoritative identity. Other sources keep the stricter
    // URL + normalized-title fallback because some of them reuse generic
    // landing pages for several events.
    const stableSourceEntryId = getStableSourceEntryId(
      event.source.name,
      event.source.url
    );
    const existingIdentity = await pool.query<{ id: string }>(
      `SELECT id
       FROM events
       WHERE starts_at = $2
         AND (
           (
             source_url = $1
             AND lower(regexp_replace(trim(title), '\\s+', ' ', 'g')) =
                 lower(regexp_replace(trim($3), '\\s+', ' ', 'g'))
           )
           OR (
             $4::text IS NOT NULL
             AND source_name = $5
             AND (regexp_match(source_url, '-([0-9]+)(?:[/?#]*)$'))[1] = $4
           )
         )
       ORDER BY observed_at DESC NULLS LAST, id
       LIMIT 1`,
      [
        event.source.url,
        event.startsAt,
        event.title,
        stableSourceEntryId,
        VILLE_MONTREAL_SOURCE_NAME
      ]
    );
    const persistedEventId = existingIdentity.rows[0]?.id ?? event.id;

    await pool.query(
      `INSERT INTO venues (id, name, address, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         location = EXCLUDED.location`,
      [
        venue.id,
        venue.name,
        venue.address,
        venue.point.longitude,
        venue.point.latitude
      ]
    );

    // Mirrors seed.ts: the destination URL for the redirect endpoint is the
    // same URL as the event's source when an external destination exists.
    const externalDestinationUrl = event.externalDestination
      ? event.source.url
      : null;

    const upserted = await pool.query<{ inserted: boolean }>(
      `INSERT INTO events (
         id, venue_id, title, category, status, starts_at, ends_at, timezone,
         source_name, source_url, observed_at, freshness, location_confidence, price_kind,
         price_minimum_amount, image_url,
         description, organizer_name, access_information, external_destination_label,
         external_destination_url, external_destination_status, external_destination_kind,
         trust_label, additional_sources
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21, $22, $23, $24, $25
       )
       ON CONFLICT (id) DO UPDATE SET
         venue_id = EXCLUDED.venue_id,
         title = EXCLUDED.title,
         category = EXCLUDED.category,
         status = EXCLUDED.status,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         source_name = EXCLUDED.source_name,
         source_url = EXCLUDED.source_url,
         observed_at = EXCLUDED.observed_at,
         freshness = EXCLUDED.freshness,
         location_confidence = EXCLUDED.location_confidence,
         price_kind = EXCLUDED.price_kind,
         price_minimum_amount = EXCLUDED.price_minimum_amount,
         image_url = EXCLUDED.image_url,
         description = EXCLUDED.description,
         organizer_name = EXCLUDED.organizer_name,
         access_information = EXCLUDED.access_information,
         external_destination_label = EXCLUDED.external_destination_label,
         external_destination_url = EXCLUDED.external_destination_url,
         external_destination_status = EXCLUDED.external_destination_status,
         external_destination_kind = EXCLUDED.external_destination_kind,
         trust_label = EXCLUDED.trust_label,
         additional_sources = EXCLUDED.additional_sources
       RETURNING (xmax = 0) AS inserted`,
      [
        persistedEventId,
        venue.id,
        event.title,
        event.category,
        event.status,
        event.startsAt,
        event.endsAt ?? null,
        event.timezone,
        event.source.name,
        event.source.url,
        event.source.observedAt,
        event.trust?.freshness ?? 'unknown',
        event.trust?.locationConfidence ?? 'uncertain',
        event.price.kind,
        event.price.kind === 'paid'
          ? (event.price.minimumAmount ?? null)
          : null,
        event.imageUrl ?? null,
        event.description ?? null,
        event.organizer ?? null,
        event.accessInformation,
        event.externalDestination?.label ?? null,
        externalDestinationUrl,
        event.externalDestination?.status ?? null,
        event.externalDestination?.kind ?? null,
        event.trust?.label ?? 'to_verify',
        JSON.stringify(additionalSources)
      ]
    );

    // DEC-0016 trigger 1. `xmax = 0` is the standard way to tell an INSERT
    // from an ON CONFLICT UPDATE, so re-running ingestion over an event
    // Pulso already has notifies nobody a second time. Past events are
    // skipped: DEC-0016 authorizes a notification for programming a
    // follower could still attend, not an archive entry.
    const inserted = upserted.rows[0]?.inserted === true;
    if (inserted && new Date(event.startsAt).getTime() > Date.now()) {
      await notifications.notifyVenueFollowersOfNewEvent(
        venue.id,
        persistedEventId
      );
    }
  }
}
