import type { PublicEvent } from '@pulso/contracts';
import type { EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const event: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-08-01T00:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  venue: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic Montréal Venue',
    address: 'Montréal',
    point: { longitude: -73.5673, latitude: 45.5017 }
  },
  source: {
    name: 'Synthetic source',
    url: 'https://example.com/event',
    observedAt: '2026-07-15T12:00:00.000Z'
  },
  trust: { freshness: 'unknown', locationConfidence: 'confirmed' }
};

const repository: EventRepository = {
  findInBounds: async () => [event],
  findWithinDirectDistance: async () => [{ ...event, distanceMeters: 0 }]
};

describe('event discovery API', () => {
  it('returns contract-valid events for map bounds', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7'
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].id).toBe(event.id);
    await app.close();
  });

  it('rejects an invalid direct-distance radius', async () => {
    const app = buildApp(repository);
    const response = await app.inject({
      method: 'GET',
      url: '/events/near?longitude=-73.56&latitude=45.5&radiusMeters=-1'
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
    await app.close();
  });
});
