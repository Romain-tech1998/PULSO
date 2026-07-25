import { describe, expect, it, vi } from 'vitest';

import { findNearbyNamedPlace } from './geocode-fallback.js';

function overpassResponse(elements: unknown[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ elements })
  } as Response;
}

describe('findNearbyNamedPlace', () => {
  const point = { longitude: -73.5567, latitude: 45.536 };

  it('returns the closest allowlisted named facility within range', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      overpassResponse([
        {
          type: 'way',
          center: { lat: 45.5352966, lon: -73.5559724 },
          tags: { name: 'Piscine Médéric-Martin', leisure: 'swimming_pool' }
        },
        {
          type: 'way',
          center: { lat: 45.5355487, lon: -73.5567197 },
          tags: { name: 'Parc Médéric-Martin', leisure: 'park' }
        }
      ])
    );
    const result = await findNearbyNamedPlace(point, fetchImpl);
    // The park's center sits closer to the query point than the pool's -
    // the function must pick the nearest qualifying candidate, not the
    // first one Overpass happens to list.
    expect(result).toBe('Parc Médéric-Martin');
  });

  it('ignores named features that are not on the venue-relevant allowlist', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      overpassResponse([
        {
          type: 'node',
          lat: 45.536,
          lon: -73.5567,
          tags: { name: 'Hochelaga / Gascon', highway: 'bus_stop' }
        },
        {
          type: 'node',
          lat: 45.5361,
          lon: -73.5568,
          tags: { name: 'Circuit électrique', amenity: 'charging_station' }
        }
      ])
    );
    const result = await findNearbyNamedPlace(point, fetchImpl);
    expect(result).toBeUndefined();
  });

  it('ignores features with no name tag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      overpassResponse([{ type: 'way', center: { lat: 45.536, lon: -73.5567 }, tags: { leisure: 'park' } }])
    );
    const result = await findNearbyNamedPlace(point, fetchImpl);
    expect(result).toBeUndefined();
  });

  it('returns undefined when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false } as Response);
    const result = await findNearbyNamedPlace(point, fetchImpl);
    expect(result).toBeUndefined();
  });

  it('returns undefined when there are no elements at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(overpassResponse([]));
    const result = await findNearbyNamedPlace(point, fetchImpl);
    expect(result).toBeUndefined();
  });
});
