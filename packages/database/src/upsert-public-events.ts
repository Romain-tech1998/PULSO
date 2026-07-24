import type { PublicEvent } from '@pulso/contracts';
import type { Pool } from 'pg';

export interface UpsertableEvent {
  event: PublicEvent;
  additionalSources?: Array<{ name: string; url: string; observedAt: string }>;
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
  for (const { event, additionalSources = [] } of events) {
    await pool.query(
      `INSERT INTO venues (id, name, address, location)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         location = EXCLUDED.location`,
      [
        event.venue.id,
        event.venue.name,
        event.venue.address,
        event.venue.point.longitude,
        event.venue.point.latitude
      ]
    );

    // Mirrors seed.ts: the destination URL for the redirect endpoint is the
    // same URL as the event's source when an external destination exists.
    const externalDestinationUrl = event.externalDestination
      ? event.source.url
      : null;

    await pool.query(
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
         additional_sources = EXCLUDED.additional_sources`,
      [
        event.id,
        event.venue.id,
        event.title,
        event.category,
        event.status,
        event.startsAt,
        event.endsAt ?? null,
        event.timezone,
        event.source.name,
        event.source.url,
        event.source.observedAt,
        event.trust.freshness,
        event.trust.locationConfidence,
        event.price.kind,
        event.price.kind === 'paid' ? event.price.minimumAmount ?? null : null,
        event.imageUrl ?? null,
        event.description ?? null,
        event.organizer ?? null,
        event.accessInformation,
        event.externalDestination?.label ?? null,
        externalDestinationUrl,
        event.externalDestination?.status ?? null,
        event.externalDestination?.kind ?? null,
        event.trust.label,
        JSON.stringify(additionalSources)
      ]
    );
  }
}
