import type {
  DirectDistanceQuery,
  MapBoundsQuery,
  PublicEvent,
  PublicVenue,
  VenuesQuery
} from '@pulso/contracts';
import type { DiscoveryWindow } from '@pulso/domain';
import type { EventCategory, VenueCategory } from '@pulso/domain';
import type { Pool } from 'pg';

export interface ExternalDestinationRecord {
  label: string;
  url: string;
  status: 'available' | 'unavailable';
  eventStatus: PublicEvent['status'];
}

export interface EventRepository {
  findInBounds(
    bounds: MapBoundsQuery,
    window: DiscoveryWindow,
    options?: { excludedCategories?: EventCategory[] }
  ): Promise<PublicEvent[]>;
  findWithinDirectDistance(query: DirectDistanceQuery): Promise<PublicEvent[]>;
  findById(id: string): Promise<PublicEvent | undefined>;
  findByIds(ids: string[]): Promise<PublicEvent[]>;
  findExternalDestination(
    id: string
  ): Promise<ExternalDestinationRecord | undefined>;
  findVenuesWithoutUpcomingEvents(bounds: VenuesQuery): Promise<PublicVenue[]>;
}

const publicEventSelect = `
  SELECT
    e.id,
    e.title,
    e.category,
    e.status,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.price_kind,
    e.price_minimum_amount,
    e.image_url,
    e.source_name,
    e.source_url,
    e.observed_at,
    e.description,
    e.organizer_name,
    e.access_information,
    e.external_destination_label,
    e.external_destination_url,
    e.external_destination_status,
    e.external_destination_kind,
    e.trust_label,
    e.freshness,
    e.location_confidence,
    e.additional_sources,
    v.id AS venue_id,
    v.name AS venue_name,
    v.address,
    v.category AS venue_category,
    ST_X(v.location) AS longitude,
    ST_Y(v.location) AS latitude
`;

interface EventRow {
  id: string;
  title: string;
  category: PublicEvent['category'];
  status: PublicEvent['status'];
  starts_at: Date;
  ends_at: Date | null;
  timezone: 'America/Toronto';
  price_kind: PublicEvent['price']['kind'];
  price_minimum_amount: string | null;
  image_url: string | null;
  source_name: string;
  source_url: string;
  observed_at: Date;
  description: string | null;
  organizer_name: string | null;
  access_information: string;
  external_destination_label: string | null;
  external_destination_url: string | null;
  external_destination_status: 'available' | 'unavailable' | null;
  external_destination_kind: 'event_source' | 'ticketing' | null;
  trust_label: PublicEvent['trust']['label'];
  freshness: PublicEvent['trust']['freshness'];
  location_confidence: PublicEvent['trust']['locationConfidence'];
  additional_sources: NonNullable<PublicEvent['additionalSources']>;
  venue_id: string;
  venue_name: string;
  address: string;
  venue_category: VenueCategory | null;
  longitude: number;
  latitude: number;
  distance_meters?: number;
}

function toPublicEvent(row: EventRow): PublicEvent {
  const event: PublicEvent = {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    startsAt: row.starts_at.toISOString(),
    timezone: row.timezone,
    price:
      row.price_kind === 'paid'
        ? {
            kind: 'paid',
            currency: 'CAD',
            ...(row.price_minimum_amount !== null
              ? { minimumAmount: Number(row.price_minimum_amount) }
              : {})
          }
        : { kind: row.price_kind, currency: 'CAD' },
    accessInformation: row.access_information,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      address: row.address,
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      },
      ...(row.venue_category !== null ? { category: row.venue_category } : {})
    },
    source: {
      name: row.source_name,
      url: row.source_url,
      observedAt: row.observed_at.toISOString()
    },
    trust: {
      label: row.trust_label,
      freshness: row.freshness,
      locationConfidence: row.location_confidence
    }
  };
  if (row.additional_sources.length > 0)
    event.additionalSources = row.additional_sources;
  if (row.ends_at) event.endsAt = row.ends_at.toISOString();
  if (row.description) event.description = row.description;
  if (row.organizer_name) event.organizer = row.organizer_name;
  if (row.image_url) event.imageUrl = row.image_url;
  if (row.external_destination_label && row.external_destination_status) {
    event.externalDestination = {
      label: row.external_destination_label,
      // Legacy rows ingested before external_destination_kind existed have
      // no value here; 'event_source' is the safe fallback since it never
      // overstates a plain source link as an actual ticket purchase page.
      kind: row.external_destination_kind ?? 'event_source',
      status: row.external_destination_status
    };
  }
  if (row.distance_meters !== undefined)
    event.distanceMeters = Number(row.distance_meters);
  return event;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async findInBounds(
    bounds: MapBoundsQuery,
    window: DiscoveryWindow,
    options: { excludedCategories?: EventCategory[] } = {}
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         AND e.starts_at >= $5
         AND e.starts_at <= $6
         AND e.status IN ('scheduled', 'postponed')
         AND ($7::event_category[] IS NULL OR e.category = ANY($7))
         AND ($8::text = 'all' OR e.price_kind = $8)
         AND ($9::event_category[] IS NULL OR NOT (e.category = ANY($9)))
         AND (
           $10::float8 IS NULL
           OR ST_DWithin(
             v.location::geography,
             ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
             $12
           )
         )
       ORDER BY e.starts_at, e.id`,
      [
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        window.startsAt,
        window.endsAt,
        bounds.categories.length > 0 ? bounds.categories : null,
        bounds.price,
        options.excludedCategories && options.excludedCategories.length > 0
          ? options.excludedCategories
          : null,
        bounds.nearLongitude ?? null,
        bounds.nearLatitude ?? null,
        bounds.nearRadiusMeters ?? null
      ]
    );
    return result.rows.map(toPublicEvent);
  }

  async findWithinDirectDistance(
    query: DirectDistanceQuery
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect},
       ST_Distance(
         v.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_meters
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE ST_DWithin(
         v.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       ORDER BY distance_meters, e.id`,
      [query.longitude, query.latitude, query.radiusMeters]
    );
    return result.rows.map(toPublicEvent);
  }

  async findById(id: string): Promise<PublicEvent | undefined> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE e.id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row ? toPublicEvent(row) : undefined;
  }

  // Batch hydration for the Favoris section: favorites are stored
  // client-side only (no account system), so the client already knows
  // which ids it wants regardless of map viewport - this just fetches the
  // full PublicEvent objects.
  async findByIds(ids: string[]): Promise<PublicEvent[]> {
    if (ids.length === 0) return [];
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE e.id = ANY($1)`,
      [ids]
    );
    return result.rows.map(toPublicEvent);
  }

  async findExternalDestination(
    id: string
  ): Promise<ExternalDestinationRecord | undefined> {
    const result = await this.pool.query<{
      label: string | null;
      url: string | null;
      status: 'available' | 'unavailable' | null;
      event_status: PublicEvent['status'];
    }>(
      `SELECT external_destination_label AS label,
              external_destination_url AS url,
              external_destination_status AS status,
              status AS event_status
       FROM events
       WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row?.label || !row.url || !row.status) return undefined;
    return {
      label: row.label,
      url: row.url,
      status: row.status,
      eventStatus: row.event_status
    };
  }

  // Surfaces venues that were never attached to any event at all - every
  // venue produced by ingestion (Ville de Montréal, Ticketmaster) always
  // arrives together with an event row (see upsertPublicEvents), so the
  // only venues with zero event rows, ever, are hand-curated landmarks like
  // seed-curated-venues.ts. Deliberately not "no *upcoming* event": that
  // would also catch the long tail of real venues whose only ingested
  // events happen to be in the past, which is a normal, common state for
  // Ville de Montréal's one-off events and not what the Lieux view's fixed
  // reference points are meant to single out.
  async findVenuesWithoutUpcomingEvents(
    bounds: VenuesQuery
  ): Promise<PublicVenue[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      address: string;
      category: VenueCategory | null;
      longitude: number;
      latitude: number;
    }>(
      `SELECT v.id, v.name, v.address, v.category,
              ST_X(v.location) AS longitude, ST_Y(v.location) AS latitude
       FROM venues v
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         AND NOT EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id)
       ORDER BY v.name`,
      [bounds.west, bounds.south, bounds.east, bounds.north]
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      point: { longitude: Number(row.longitude), latitude: Number(row.latitude) },
      ...(row.category !== null ? { category: row.category } : {})
    }));
  }
}
