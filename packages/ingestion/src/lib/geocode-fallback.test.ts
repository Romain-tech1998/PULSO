import { describe, expect, it, vi } from 'vitest';

import {
  findNearbyNamedPlace,
  geocodeAddressWithFrenchFallback,
  translateStreetToFrench
} from './geocode-fallback.js';

function nominatimResponse(results: unknown[]) {
  return { ok: true, json: () => Promise.resolve(results) } as Response;
}

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
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        overpassResponse([
          {
            type: 'way',
            center: { lat: 45.536, lon: -73.5567 },
            tags: { leisure: 'park' }
          }
        ])
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

describe('translateStreetToFrench', () => {
  it('moves a trailing English street type to the front in French, verified live cases', () => {
    // "858 Saint-Catherine Street East" - real RA address that Nominatim
    // rejected until translated (see the connector fix history).
    expect(translateStreetToFrench('858 Saint-Catherine Street East')).toBe(
      '858 Rue Sainte-Catherine Est'
    );
    expect(translateStreetToFrench('4465 St Laurent Blvd')).toBe(
      '4465 Boulevard Saint-Laurent'
    );
  });

  it('defaults to "Rue" when the source omits the street type entirely', () => {
    expect(translateStreetToFrench('856 Saint Catherine East')).toBe(
      '856 Rue Sainte-Catherine Est'
    );
  });

  it('corrects well-known feminine saint names that English sources get wrong', () => {
    expect(translateStreetToFrench('100 Saint Anne Avenue')).toBe(
      '100 Avenue Sainte-Anne'
    );
  });

  it('leaves an already-correct masculine saint name untouched', () => {
    expect(translateStreetToFrench('4465 Saint Laurent Boulevard')).toBe(
      '4465 Boulevard Saint-Laurent'
    );
  });

  it('returns undefined when nothing recognizable is found to translate', () => {
    expect(
      translateStreetToFrench('1403 Rue Sainte-Elisabeth')
    ).toBeUndefined();
    expect(translateStreetToFrench('Newspeak')).toBeUndefined();
  });
});

describe('geocodeAddressWithFrenchFallback', () => {
  it('returns the direct result without a second request when the first query succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(nominatimResponse([{ lat: '45.51', lon: '-73.56' }]));
    const result = await geocodeAddressWithFrenchFallback(
      'Rue Sainte-Catherine, Montreal',
      fetchImpl,
      0
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ longitude: -73.56, latitude: 45.51 });
  });

  it('retries with a translated segment when the original query fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(nominatimResponse([]))
      .mockResolvedValueOnce(
        nominatimResponse([{ lat: '45.5159988', lon: '-73.5581204' }])
      );
    const result = await geocodeAddressWithFrenchFallback(
      '858 Saint-Catherine Street East, Montreal, QC H2L 2E3, Canada',
      fetchImpl,
      0
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCallUrl = String(fetchImpl.mock.calls[1]![0]);
    expect(decodeURIComponent(secondCallUrl).replace(/\+/g, ' ')).toContain(
      '858 Rue Sainte-Catherine Est'
    );
    expect(result).toEqual({ longitude: -73.5581204, latitude: 45.5159988 });
  });

  it('gives up without a second request when there is nothing to translate', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(nominatimResponse([]));
    const result = await geocodeAddressWithFrenchFallback(
      'Newspeak, Montreal',
      fetchImpl,
      0
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });

  it('translates whichever segment has the street, even after a venue name', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(nominatimResponse([]))
      .mockResolvedValueOnce(
        nominatimResponse([{ lat: '45.5200679', lon: '-73.585827' }])
      );
    const result = await geocodeAddressWithFrenchFallback(
      'Salon Daomé, 4465 St Laurent Blvd, Montreal, Quebec H2W 1Z8',
      fetchImpl,
      0
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const secondCallUrl = String(fetchImpl.mock.calls[1]![0]);
    expect(decodeURIComponent(secondCallUrl).replace(/\+/g, ' ')).toContain(
      '4465 Boulevard Saint-Laurent'
    );
    expect(result).toEqual({ longitude: -73.585827, latitude: 45.5200679 });
  });
});
