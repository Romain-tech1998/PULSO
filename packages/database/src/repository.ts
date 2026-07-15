import type {
  DirectDistanceQuery,
  MapBoundsQuery,
  PublicEvent
} from '@pulso/contracts';
import type { DiscoveryWindow } from '@pulso/domain';
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
    window: DiscoveryWindow
  ): Promise<PublicEvent[]>;
  findWithinDirectDistance(query: DirectDistanceQuery): Promise<PublicEvent[]>;
  findById(id: string): Promise<PublicEvent | undefined>;
  findExternalDestination(
    id: string
  ): Promise<ExternalDestinationRecord | undefined>;
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
    e.source_name,
    e.source_url,
    e.observed_at,
    e.description,
    e.organizer_name,
    e.access_information,
    e.external_destination_label,
    e.external_destination_url,
    e.external_destination_status,
    e.trust_label,
    e.freshness,
    e.location_confidence,
    v.id AS venue_id,
    v.name AS venue_name,
    v.address,
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
  source_name: string;
  source_url: string;
  observed_at: Date;
  description: string | null;
  organizer_name: string | null;
  access_information: string;
  external_destination_label: string | null;
  external_destination_url: string | null;
  external_destination_status: 'available' | 'unavailable' | null;
  trust_label: PublicEvent['trust']['label'];
  freshness: PublicEvent['trust']['freshness'];
  location_confidence: PublicEvent['trust']['locationConfidence'];
  venue_id: string;
  venue_name: string;
  address: string;
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
    price: { kind: row.price_kind, currency: 'CAD' },
    accessInformation: row.access_information,
    venue: {
      id: row.venue_id,
      name: row.venue_name,
      address: row.address,
      point: {
        longitude: Number(row.longitude),
        latitude: Number(row.latitude)
      }
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
  if (row.ends_at) event.endsAt = row.ends_at.toISOString();
  if (row.description) event.description = row.description;
  if (row.organizer_name) event.organizer = row.organizer_name;
  if (row.external_destination_label && row.external_destination_status) {
    event.externalDestination = {
      label: row.external_destination_label,
      kind: 'event_source',
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
    window: DiscoveryWindow
  ): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
         AND e.starts_at >= $5
         AND e.starts_at <= $6
         AND e.status IN ('scheduled', 'postponed')
       ORDER BY e.starts_at, e.id`,
      [
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        window.startsAt,
        window.endsAt
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
}
