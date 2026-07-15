import { describe, expect, it } from 'vitest';

import { publicEventSchema } from './index.js';

describe('public event contract', () => {
  it('rejects a point outside valid latitude bounds', () => {
    const result = publicEventSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Synthetic event',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-08-01T00:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'free', currency: 'CAD' },
      venue: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Synthetic venue',
        address: 'Montréal',
        point: { longitude: -73.56, latitude: 100 }
      },
      source: {
        name: 'Synthetic',
        url: 'https://example.com/event',
        observedAt: '2026-07-15T12:00:00.000Z'
      },
      trust: { freshness: 'unknown', locationConfidence: 'confirmed' }
    });

    expect(result.success).toBe(false);
  });
});
