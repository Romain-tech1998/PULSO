import { describe, expect, it } from 'vitest';

import { distanceKm } from './mapping/venue-identity.js';

import {
  composeNominatimAddress,
  lookupVenueByName,
  mapNominatimPlace
} from './lookup-venue.js';

const MONTREAL = { longitude: -73.5673, latitude: 45.5017 };

function respondWith(places: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(places), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch;
}

const plateauBar = {
  osm_type: 'node',
  osm_id: 4242,
  lat: '45.5231',
  lon: '-73.5812',
  name: 'Le Cheval Blanc',
  category: 'amenity',
  type: 'bar',
  address: {
    house_number: '809',
    road: 'Rue Ontario Est',
    city: 'Montréal',
    postcode: 'H2L 1P1'
  }
};

describe('distanceKm', () => {
  it('measures a short city distance', () => {
    const distance = distanceKm(MONTREAL, {
      longitude: -73.5812,
      latitude: 45.5231
    });
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
  });

  it('measures a distance well outside the island', () => {
    // Saint-Jérôme, comfortably past the 30 km rule.
    expect(
      distanceKm(MONTREAL, { longitude: -74.0, latitude: 45.78 })
    ).toBeGreaterThan(30);
  });
});

describe('composeNominatimAddress', () => {
  it('composes the street and city, without the country tail', () => {
    expect(
      composeNominatimAddress({
        house_number: '809',
        road: 'Rue Ontario Est',
        city: 'Montréal',
        state: 'Québec',
        country: 'Canada'
      })
    ).toBe('809 Rue Ontario Est, Montréal');
  });

  it('falls back to town when there is no city', () => {
    expect(
      composeNominatimAddress({ road: 'Rue Principale', town: 'Laval' })
    ).toBe('Rue Principale, Laval');
  });

  it('returns nothing without a street', () => {
    expect(composeNominatimAddress({ city: 'Montréal' })).toBeUndefined();
    expect(composeNominatimAddress(undefined)).toBeUndefined();
  });
});

describe('mapNominatimPlace', () => {
  it('maps a named, addressed, categorized place', () => {
    expect(mapNominatimPlace(plateauBar)).toEqual({
      osmRef: 'node/4242',
      name: 'Le Cheval Blanc',
      address: '809 Rue Ontario Est, Montréal',
      point: { longitude: -73.5812, latitude: 45.5231 },
      category: 'bar'
    });
  });

  it('keeps a place Pulso cannot categorize, without a category', () => {
    // The visitor asked for it by name, so it is still the right answer -
    // it simply does not earn a map pin, exactly like a hand-entered venue
    // with no category set.
    const result = mapNominatimPlace({
      ...plateauBar,
      category: 'building',
      type: 'commercial'
    });
    expect(result?.name).toBe('Le Cheval Blanc');
    expect(result?.category).toBeUndefined();
  });

  it('reads the older `class` key as well as jsonv2 `category`', () => {
    const { category, ...withoutCategory } = plateauBar;
    const result = mapNominatimPlace({ ...withoutCategory, class: category });
    expect(result?.category).toBe('bar');
  });

  it('rejects a place beyond the 30 km Montréal rule', () => {
    // bounded=1 constrains a rectangle; the product rule is a radius. This
    // is the check that keeps the corners of that rectangle out.
    expect(
      mapNominatimPlace({ ...plateauBar, lat: '45.78', lon: '-74.0' })
    ).toBeUndefined();
  });

  it('rejects a place with no street address', () => {
    expect(
      mapNominatimPlace({ ...plateauBar, address: { city: 'Montréal' } })
    ).toBeUndefined();
  });

  it('rejects an unnamed place', () => {
    const { name: _name, ...unnamed } = plateauBar;
    expect(mapNominatimPlace(unnamed)).toBeUndefined();
  });

  it('rejects a place with no usable coordinate', () => {
    expect(
      mapNominatimPlace({ ...plateauBar, lat: 'nope', lon: 'nope' })
    ).toBeUndefined();
  });
});

describe('lookupVenueByName', () => {
  it('returns what Nominatim found', async () => {
    const result = await lookupVenueByName('cheval blanc', {
      fetchImpl: respondWith([plateauBar])
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Le Cheval Blanc');
  });

  it('bounds the request to Montréal and to Canada', async () => {
    let requested = '';
    const spy = (async (url: string) => {
      requested = url;
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    await lookupVenueByName('cheval blanc', { fetchImpl: spy });
    expect(requested).toContain('bounded=1');
    expect(requested).toContain('countrycodes=ca');
    expect(requested).toContain('viewbox=');
  });

  it('does not spend a request on a two-character query', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('[]', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await lookupVenueByName('le', { fetchImpl: spy })).toEqual([]);
    expect(called).toBe(false);
  });

  it('answers empty rather than throwing when the endpoint fails', async () => {
    // This runs inside a visitor's search request. A rate-limited geocoder
    // must degrade to the empty result search already had, not a 500.
    const failing = (async () =>
      new Response('slow down', { status: 429 })) as unknown as typeof fetch;
    expect(
      await lookupVenueByName('cheval blanc', { fetchImpl: failing })
    ).toEqual([]);
  });

  it('answers empty when the request throws outright', async () => {
    const throwing = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(
      await lookupVenueByName('cheval blanc', { fetchImpl: throwing })
    ).toEqual([]);
  });

  it('answers empty when the payload is not the expected array', async () => {
    const result = await lookupVenueByName('cheval blanc', {
      fetchImpl: respondWith({ error: 'unavailable' })
    });
    expect(result).toEqual([]);
  });

  it('collapses the node and the way for one building', async () => {
    const result = await lookupVenueByName('cheval blanc', {
      fetchImpl: respondWith([
        plateauBar,
        { ...plateauBar, osm_type: 'way', osm_id: 99 }
      ])
    });
    expect(result).toHaveLength(1);
  });
});
