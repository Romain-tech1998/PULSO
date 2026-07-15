import type {
  DirectDistanceQuery,
  MapBoundsQuery,
  PublicEvent
} from '@pulso/contracts';
import type { Pool } from 'pg';

export interface EventRepository {
  findInBounds(bounds: MapBoundsQuery): Promise<PublicEvent[]>;
  findWithinDirectDistance(query: DirectDistanceQuery): Promise<PublicEvent[]>;
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
      freshness: row.freshness,
      locationConfidence: row.location_confidence
    }
  };
  if (row.ends_at) event.endsAt = row.ends_at.toISOString();
  if (row.distance_meters !== undefined)
    event.distanceMeters = Number(row.distance_meters);
  return event;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async findInBounds(bounds: MapBoundsQuery): Promise<PublicEvent[]> {
    const result = await this.pool.query<EventRow>(
      `${publicEventSelect}
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       WHERE v.location && ST_MakeEnvelope($1, $2, $3, $4, 4326)
       ORDER BY e.starts_at, e.id`,
      [bounds.west, bounds.south, bounds.east, bounds.north]
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
}
