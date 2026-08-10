import { describe, expect, it } from 'vitest';

import {
  buildOverpassQuery,
  categoryForOsmTag,
  composeAddress,
  fetchOsmVenues,
  mapOverpassElement,
  readPhotoHints
} from './openstreetmap-venues.js';

const MONTREAL = { longitude: -73.5673, latitude: 45.5017 };

describe('buildOverpassQuery', () => {
  it('bounds the search on the requested point and radius', () => {
    const query = buildOverpassQuery(MONTREAL, 1500);
    expect(query).toContain('around:1500,45.5017,-73.5673');
    expect(query).toContain('[out:json]');
    // Without `out center`, a bar mapped as a building footprint comes back
    // with no coordinate at all and would be dropped.
    expect(query).toContain('out center tags;');
  });

  it('asks for nodes, ways and relations', () => {
    const query = buildOverpassQuery(MONTREAL, 500);
    for (const kind of ['node', 'way', 'relation']) {
      expect(query).toContain(`  ${kind}["amenity"="bar"]`);
    }
  });
});

describe('categoryForOsmTag', () => {
  it('maps a tag Pulso recognizes', () => {
    expect(categoryForOsmTag('amenity', 'nightclub')).toBe('nightclub');
    expect(categoryForOsmTag('leisure', 'music_venue')).toBe('concert_hall');
  });

  it('returns nothing for a tag outside DEC-0014, rather than guessing', () => {
    // A restaurant directory is explicitly not what the map exception
    // authorizes; answering with 'bar' here would quietly create one.
    expect(categoryForOsmTag('amenity', 'restaurant')).toBeUndefined();
    expect(categoryForOsmTag('shop', 'bakery')).toBeUndefined();
  });
});

describe('composeAddress', () => {
  it('composes the OSM address tags into one line', () => {
    expect(
      composeAddress({
        'addr:housenumber': '4479',
        'addr:street': 'Rue Saint-Denis',
        'addr:city': 'Montréal',
        'addr:postcode': 'H2J 2L2'
      })
    ).toBe('4479 Rue Saint-Denis, Montréal, H2J 2L2');
  });

  it('returns nothing without a street, rather than a partial address', () => {
    expect(composeAddress({ 'addr:city': 'Montréal' })).toBeUndefined();
    expect(composeAddress({})).toBeUndefined();
  });
});

describe('readPhotoHints', () => {
  it('reads every photo-bearing tag', () => {
    expect(
      readPhotoHints({
        image: 'https://example.org/bar.jpg',
        wikimedia_commons: 'File:Bar.jpg',
        wikidata: 'Q42',
        website: 'https://bar.example'
      })
    ).toEqual({
      image: 'https://example.org/bar.jpg',
      wikimediaCommons: 'File:Bar.jpg',
      wikidata: 'Q42',
      website: 'https://bar.example'
    });
  });

  it('accepts contact:website, which many Montréal venues use instead', () => {
    expect(
      readPhotoHints({ 'contact:website': 'https://bar.example' })
    ).toEqual({ website: 'https://bar.example' });
  });

  it('omits absent tags rather than carrying empty strings', () => {
    expect(readPhotoHints({ name: 'Le Red Room' })).toEqual({});
  });
});

describe('mapOverpassElement', () => {
  const bar = {
    type: 'node',
    id: 42,
    lat: 45.52,
    lon: -73.58,
    tags: {
      name: 'Le Red Room',
      amenity: 'bar',
      'addr:housenumber': '2037',
      'addr:street': 'Rue Saint-Denis',
      'addr:city': 'Montréal'
    }
  };

  it('maps a tagged, named, addressed node', () => {
    expect(mapOverpassElement(bar)).toEqual({
      osmRef: 'node/42',
      name: 'Le Red Room',
      address: '2037 Rue Saint-Denis, Montréal',
      point: { longitude: -73.58, latitude: 45.52 },
      category: 'bar',
      secondaryCategories: [],
      photoHints: {}
    });
  });

  it('takes the coordinate from `center` for a way', () => {
    const result = mapOverpassElement({
      ...bar,
      type: 'way',
      lat: undefined,
      lon: undefined,
      center: { lat: 45.53, lon: -73.57 }
    });
    expect(result?.osmRef).toBe('way/42');
    expect(result?.point).toEqual({ longitude: -73.57, latitude: 45.53 });
  });

  it('records a second matching tag as a secondary category', () => {
    const result = mapOverpassElement({
      ...bar,
      tags: { ...bar.tags, amenity: 'nightclub', microbrewery: 'yes' }
    });
    expect(result?.category).toBe('nightclub');
    expect(result?.secondaryCategories).toEqual(['brewery_with_stage']);
  });

  it('carries the photo tags through for later resolution', () => {
    const result = mapOverpassElement({
      ...bar,
      tags: { ...bar.tags, wikidata: 'Q1128578' }
    });
    expect(result?.photoHints).toEqual({ wikidata: 'Q1128578' });
  });

  it('drops an unnamed place', () => {
    expect(
      mapOverpassElement({ ...bar, tags: { ...bar.tags, name: '  ' } })
    ).toBeUndefined();
  });

  it('keeps a place with no address, for the importer to reverse-geocode', () => {
    // 353 of Montréal's 860 mapped venues have no addr:street. Dropping them
    // here discarded 41% of the directory - and nothing is invented by
    // keeping them: `address` is simply absent until a real lookup fills it.
    const result = mapOverpassElement({
      ...bar,
      tags: { name: 'Le Red Room', amenity: 'bar' }
    });
    expect(result?.name).toBe('Le Red Room');
    expect(result?.address).toBeUndefined();
  });

  it('drops a tag Pulso has no category for, rather than guessing', () => {
    expect(
      mapOverpassElement({ ...bar, tags: { ...bar.tags, amenity: 'pharmacy' } })
    ).toBeUndefined();
  });

  it('drops an element with no usable coordinate', () => {
    expect(
      mapOverpassElement({ ...bar, lat: undefined, lon: undefined })
    ).toBeUndefined();
  });
});

describe('fetchOsmVenues', () => {
  function respondWith(elements: unknown[]): typeof fetch {
    return (async () =>
      new Response(JSON.stringify({ elements }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })) as unknown as typeof fetch;
  }

  it('collapses the same place mapped as both a node and a way', async () => {
    const tags = {
      name: 'Bar Le Cocktail',
      amenity: 'bar',
      'addr:street': 'Rue Sainte-Catherine Est',
      'addr:city': 'Montréal'
    };
    const result = await fetchOsmVenues(MONTREAL, 1000, {
      fetchImpl: respondWith([
        { type: 'node', id: 1, lat: 45.52, lon: -73.55, tags },
        { type: 'way', id: 2, center: { lat: 45.52, lon: -73.55 }, tags }
      ])
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.osmRef).toBe('node/1');
  });

  it('collapses an addressless duplicate by name and rounded position', async () => {
    const tags = { name: 'Le Ritz PDB', amenity: 'bar' };
    const result = await fetchOsmVenues(MONTREAL, 1000, {
      fetchImpl: respondWith([
        { type: 'node', id: 1, lat: 45.5231, lon: -73.5812, tags },
        // The way's centroid is never bit-identical to the node.
        { type: 'way', id: 2, center: { lat: 45.5232, lon: -73.5814 }, tags }
      ])
    });
    expect(result).toHaveLength(1);
  });

  it('keeps two same-named bars in different places apart', async () => {
    const tags = { name: 'Bar Le Cocktail', amenity: 'bar' };
    const result = await fetchOsmVenues(MONTREAL, 30_000, {
      fetchImpl: respondWith([
        { type: 'node', id: 1, lat: 45.52, lon: -73.55, tags },
        { type: 'node', id: 2, lat: 45.46, lon: -73.62, tags }
      ])
    });
    expect(result).toHaveLength(2);
  });

  it('merges what each copy knows instead of taking only the first', async () => {
    // Verified shape in the real extract: the node carries the address and
    // the way carries the wikidata id. First-one-wins loses a photo.
    const result = await fetchOsmVenues(MONTREAL, 1000, {
      fetchImpl: respondWith([
        {
          type: 'node',
          id: 1,
          lat: 45.52,
          lon: -73.55,
          tags: { name: 'Le Balcon', amenity: 'theatre' }
        },
        {
          type: 'way',
          id: 2,
          center: { lat: 45.52, lon: -73.55 },
          tags: {
            name: 'Le Balcon',
            amenity: 'theatre',
            wikidata: 'Q999',
            website: 'https://lebalcon.example'
          }
        }
      ])
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.photoHints).toEqual({
      wikidata: 'Q999',
      website: 'https://lebalcon.example'
    });
  });

  it('surfaces an Overpass failure instead of returning an empty result', async () => {
    const failing = (async () =>
      new Response('rate limited', { status: 429 })) as unknown as typeof fetch;
    await expect(
      fetchOsmVenues(MONTREAL, 1000, { fetchImpl: failing })
    ).rejects.toThrow(/429/);
  });
});
