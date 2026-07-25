import { describe, expect, it, vi } from 'vitest';

import { parseCsv } from './lib/csv.js';
import {
  enrichMissingAddresses,
  enrichMissingCoordinates
} from './lib/geocode-fallback.js';
import { parseIcs } from './sources/ics-calendar.js';
import { fetchInstagramScoutSignals } from './sources/instagram-scout.js';
import { buildInstagramScoutReviewQueue } from './instagram-scout-review.js';
import { triageInstagramScoutItem } from './instagram-scout-triage.js';
import { extractInstagramScoutFacts } from './instagram-scout-extraction.js';
import { mapMontrealOpenDataRow } from './sources/montreal-open-data.js';
import { mapTicketmasterEvent } from './sources/ticketmaster.js';
import {
  extractInstagramWatchlist,
  selectInstagramPilotTargets
} from './registry.js';
import type { RawIngestedEvent } from './types.js';

describe('parseCsv', () => {
  it('parses simple rows into header-keyed records', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n');
    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ]);
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const rows = parseCsv('title,description\n"Show, live","She said ""hi"""\n');
    expect(rows).toEqual([
      { title: 'Show, live', description: 'She said "hi"' }
    ]);
  });
});

describe('mapMontrealOpenDataRow', () => {
  it('maps a well-formed row to a RawIngestedEvent', () => {
    const event = mapMontrealOpenDataRow(
      {
        titre: 'Marché de Noël',
        url_fiche: 'https://montreal.ca/evenements/marche-de-noel',
        description: 'Un marché saisonnier',
        date_debut: '2026-12-01T10:00:00',
        date_fin: '2026-12-01T18:00:00',
        type_evenement: 'Marché',
        cout: 'Gratuit',
        titre_adresse: 'Place des Arts',
        adresse_principale: '175 Rue Sainte-Catherine O',
        arrondissement: 'Ville-Marie',
        lat: '45.5088',
        long: '-73.5673'
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event?.title).toBe('Marché de Noël');
    expect(event?.category).toBe('other');
    expect(event?.price).toEqual({ kind: 'free' });
    expect(event?.point).toEqual({ longitude: -73.5673, latitude: 45.5088 });
    // Even a free civic event should still get a redirect link - Pulso wants
    // the click-through data regardless of price, per product decision.
    expect(event?.ticketingUrl).toBe(
      'https://montreal.ca/evenements/marche-de-noel'
    );
  });

  it('returns undefined when the row has no title or start date', () => {
    const event = mapMontrealOpenDataRow({ titre: '', date_debut: '' }, 'now');
    expect(event).toBeUndefined();
  });

  it.each([
    ['Musique', 'music'],
    ['Humour', 'comedy'],
    ['Théâtre', 'show'],
    ['Cirque', 'show'],
    ['Cinéma', 'show']
  ])('maps type_evenement %s to category %s', (type_evenement, expected) => {
    const event = mapMontrealOpenDataRow(
      { titre: 'Test', date_debut: '2026-12-01T10:00:00', type_evenement },
      'now'
    );
    expect(event?.category).toBe(expected);
  });

  it('treats the CSV export\'s literal "nan" placeholder as a missing value', () => {
    const event = mapMontrealOpenDataRow(
      {
        titre: 'Cinéma en plein air',
        date_debut: '2026-07-13T00:00:00',
        titre_adresse: 'nan',
        adresse_principale: 'NaN',
        description: 'nan',
        arrondissement: 'nan'
      },
      'now'
    );

    expect(event?.venueName).toBeUndefined();
    expect(event?.address).toBeUndefined();
    expect(event?.description).toBeUndefined();
    expect(event?.organizer).toBeUndefined();
  });
});

describe('mapTicketmasterEvent', () => {
  it('maps a Ticketmaster event into a RawIngestedEvent', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-1',
        name: 'Some Concert',
        url: 'https://ticketmaster.ca/event/tm-1',
        classifications: [{ segment: { name: 'Music' } }],
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } },
        priceRanges: [{ min: 45, currency: 'CAD' }],
        _embedded: {
          venues: [
            {
              name: 'MTELUS',
              address: { line1: '59 Rue Sainte-Catherine E' },
              location: { longitude: '-73.5605', latitude: '45.5106' }
            }
          ]
        }
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.category).toBe('music');
    expect(event.venueName).toBe('MTELUS');
    expect(event.point).toEqual({ longitude: -73.5605, latitude: 45.5106 });
    expect(event.price).toEqual({ kind: 'paid', minimumAmount: 45 });
  });

  it('drops (0, 0) venue coordinates instead of treating them as valid', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-2',
        name: 'Bell Centre Show',
        url: 'https://ticketmaster.ca/event/tm-2',
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } },
        _embedded: {
          venues: [
            {
              name: 'Bell Centre',
              location: { longitude: '0', latitude: '0' }
            }
          ]
        }
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.point).toBeUndefined();
  });

  it('treats a missing priceRanges as paid with an undetermined amount, not unknown', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-3',
        name: 'Canadiens vs. Bruins',
        url: 'https://ticketmaster.ca/event/tm-3',
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } }
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.price).toEqual({ kind: 'paid' });
  });

  it('picks the smallest 16:9 image at or above 640px wide', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-4',
        name: 'Festival',
        url: 'https://ticketmaster.ca/event/tm-4',
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } },
        images: [
          { ratio: '16_9', url: 'https://example.com/tiny.jpg', width: 100 },
          { ratio: '16_9', url: 'https://example.com/good.jpg', width: 1024 },
          { ratio: '16_9', url: 'https://example.com/huge.jpg', width: 2426 },
          { ratio: '3_2', url: 'https://example.com/wrong-ratio.jpg', width: 700 }
        ]
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.imageUrl).toBe('https://example.com/good.jpg');
  });

  it('falls back to the largest available image when none reach 640px', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-5',
        name: 'Small show',
        url: 'https://ticketmaster.ca/event/tm-5',
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } },
        images: [
          { ratio: '16_9', url: 'https://example.com/small.jpg', width: 100 },
          { ratio: '16_9', url: 'https://example.com/smaller.jpg', width: 50 }
        ]
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.imageUrl).toBe('https://example.com/small.jpg');
  });

  it('leaves imageUrl undefined when the source has no images', () => {
    const event = mapTicketmasterEvent(
      {
        id: 'tm-6',
        name: 'No image show',
        url: 'https://ticketmaster.ca/event/tm-6',
        dates: { start: { dateTime: '2026-08-01T23:00:00Z' } }
      },
      '2026-07-21T00:00:00.000Z'
    );

    expect(event.imageUrl).toBeUndefined();
  });
});

describe('parseIcs', () => {
  it('extracts VEVENT blocks including folded lines', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Concert du soir',
      'DESCRIPTION:Une soirée\\, avec deux artistes',
      'DTSTART:20260815T230000Z',
      'DTEND:20260816T020000Z',
      'LOCATION:Newspeak',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const events = parseIcs(ics);
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Concert du soir');
    expect(events[0]?.dtstart).toBe('2026-08-15T23:00:00.000Z');
  });
});

describe('enrichMissingCoordinates', () => {
  const baseEvent: RawIngestedEvent = {
    sourceId: 'ticketmaster',
    sourceName: 'Ticketmaster',
    sourceUrl: 'https://ticketmaster.ca/event/tm-2',
    observedAt: '2026-07-21T00:00:00.000Z',
    title: 'Bell Centre Show',
    category: 'unmapped',
    startsAt: '2026-08-01T23:00:00Z',
    venueName: 'Bell Centre',
    address: '1909 Avenue des Canadiens-de-Montréal'
  };

  it('leaves events with a point untouched, labelled as source', async () => {
    const withPoint: RawIngestedEvent = {
      ...baseEvent,
      point: { longitude: -73.5605, latitude: 45.4961 }
    };
    const [result] = await enrichMissingCoordinates([withPoint]);
    expect(result?.pointResolution).toBe('source');
    expect(result?.point).toEqual(withPoint.point);
  });

  it('geocodes events with a known address/venue name and no point', async () => {
    const geocodeImpl = vi.fn().mockResolvedValue({
      longitude: -73.5605,
      latitude: 45.4961
    });
    const [result] = await enrichMissingCoordinates([baseEvent], {
      delayMs: 0,
      geocodeImpl
    });
    expect(geocodeImpl).toHaveBeenCalledWith(
      expect.stringContaining('Bell Centre'),
      expect.anything()
    );
    expect(result?.pointResolution).toBe('geocoded');
    expect(result?.point).toEqual({ longitude: -73.5605, latitude: 45.4961 });
  });

  it('flags events with no address or venue name for human research instead of guessing', async () => {
    const geocodeImpl = vi.fn();
    const noAddress: RawIngestedEvent = {
      ...baseEvent,
      venueName: undefined,
      address: undefined
    };
    const [result] = await enrichMissingCoordinates([noAddress], {
      delayMs: 0,
      geocodeImpl
    });
    expect(geocodeImpl).not.toHaveBeenCalled();
    expect(result?.pointResolution).toBe('needs_research');
    expect(result?.point).toBeUndefined();
  });

  it('marks unresolved when geocoding a known address fails', async () => {
    const geocodeImpl = vi.fn().mockResolvedValue(undefined);
    const [result] = await enrichMissingCoordinates([baseEvent], {
      delayMs: 0,
      geocodeImpl
    });
    expect(result?.pointResolution).toBe('unresolved');
    expect(result?.point).toBeUndefined();
  });
});

describe('enrichMissingAddresses', () => {
  const pointedNoAddress: RawIngestedEvent = {
    sourceId: 'ville-de-montreal-evenements-publics',
    sourceName: 'Ville de Montréal',
    sourceUrl: 'https://montreal.ca/evenements/trio-brasil',
    observedAt: '2026-07-21T00:00:00.000Z',
    title: 'Trio Brasil',
    category: 'music',
    startsAt: '2026-08-17T23:00:00Z',
    venueName: undefined,
    address: undefined,
    point: { longitude: -73.6, latitude: 45.55 }
  };

  it('reverse-geocodes events with a point but no name/address at all', async () => {
    const reverseGeocodeImpl = vi.fn().mockResolvedValue({
      venueName: 'Parc Gouin',
      address: 'Parc Gouin, Montréal, QC, Canada'
    });
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      reverseGeocodeImpl
    });
    expect(reverseGeocodeImpl).toHaveBeenCalledWith(
      pointedNoAddress.point,
      expect.anything()
    );
    expect(result?.venueName).toBe('Parc Gouin');
    expect(result?.address).toBe('Parc Gouin, Montréal, QC, Canada');
  });

  it('reuses one lookup for multiple events sharing the exact same point (recurring shows)', async () => {
    // Verified in practice: two DB rows for the same recurring exhibition
    // shared one coordinate, each independently called Nominatim, and one
    // resolved while the other didn't - pure per-request flakiness. Sharing
    // one lookup across same-point events avoids both the wasted request
    // and that inconsistency.
    const reverseGeocodeImpl = vi.fn().mockResolvedValue({
      venueName: 'Bibliothèque Robert-Bourassa',
      address: '41 Avenue Saint-Just'
    });
    const secondShowing: RawIngestedEvent = {
      ...pointedNoAddress,
      title: 'Trio Brasil (2nd date)',
      startsAt: '2026-08-18T23:00:00Z'
    };
    const results = await enrichMissingAddresses(
      [pointedNoAddress, secondShowing],
      { delayMs: 0, reverseGeocodeImpl }
    );
    expect(reverseGeocodeImpl).toHaveBeenCalledTimes(1);
    expect(results[0]?.venueName).toBe('Bibliothèque Robert-Bourassa');
    expect(results[1]?.venueName).toBe('Bibliothèque Robert-Bourassa');
  });

  it('retries a transient reverse-geocode failure before giving up', async () => {
    // Verified in practice: coordinates that returned nothing during a
    // large sequential ingestion batch resolved fine moments later on
    // their own - a transient failure, not missing data.
    const reverseGeocodeImpl = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ venueName: 'Bibliothèque Robert-Bourassa', address: '41 Avenue Saint-Just' });
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      reverseGeocodeImpl
    });
    expect(reverseGeocodeImpl).toHaveBeenCalledTimes(3);
    expect(result?.venueName).toBe('Bibliothèque Robert-Bourassa');
  });

  it('gives up after maxAttempts and leaves the event without a venue name/address', async () => {
    const reverseGeocodeImpl = vi.fn().mockResolvedValue(undefined);
    const nearbyPlaceImpl = vi.fn().mockResolvedValue(undefined);
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      maxAttempts: 2,
      reverseGeocodeImpl,
      nearbyPlaceImpl
    });
    expect(reverseGeocodeImpl).toHaveBeenCalledTimes(2);
    expect(result?.venueName).toBeUndefined();
    expect(result?.address).toBeUndefined();
  });

  it('prefers a real named facility a short walk away over a bare street label', async () => {
    // The exact point often has no on-point POI name at all (a park bench,
    // a random street corner), but a real, already-named OSM facility -
    // a pool, a community centre - can still sit a short walk away. That
    // beats a bare street address as a venue label, and is still entirely
    // OSM-sourced (findNearbyNamedPlace), never invented.
    const reverseGeocodeImpl = vi.fn().mockResolvedValue({
      venueName: undefined,
      shortLabel: '2329 Avenue Gascon',
      address: '2329, Avenue Gascon, Montréal, QC, Canada, H2K 2V6'
    });
    const nearbyPlaceImpl = vi.fn().mockResolvedValue('Piscine Médéric-Martin');
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      reverseGeocodeImpl,
      nearbyPlaceImpl
    });
    expect(nearbyPlaceImpl).toHaveBeenCalledWith(pointedNoAddress.point, expect.anything());
    expect(result?.venueName).toBe('Piscine Médéric-Martin');
    expect(result?.address).toBe('2329, Avenue Gascon, Montréal, QC, Canada, H2K 2V6');
  });

  it('falls back to a short road label as the venue name when OSM has no named POI at that point or nearby', async () => {
    // Most reverse-geocoded points (a park bench, a random street corner)
    // resolve to a real, correct address but no leisure/amenity/building/
    // tourism tag at all - falling back to venueName: undefined would
    // still surface as "Unknown venue" downstream even though the location
    // itself is genuinely known. The short label (not the full address)
    // keeps "Lieu" and "Adresse" from showing the identical long string.
    const reverseGeocodeImpl = vi.fn().mockResolvedValue({
      venueName: undefined,
      shortLabel: '4120 Rue Ontario Est',
      address: '4120, Rue Ontario Est, Montréal, QC, Canada, H1V 1J9'
    });
    const nearbyPlaceImpl = vi.fn().mockResolvedValue(undefined);
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      reverseGeocodeImpl,
      nearbyPlaceImpl
    });
    expect(result?.venueName).toBe('4120 Rue Ontario Est');
    expect(result?.address).toBe('4120, Rue Ontario Est, Montréal, QC, Canada, H1V 1J9');
  });

  it('falls back to venueName undefined when even the road is unavailable', async () => {
    const reverseGeocodeImpl = vi.fn().mockResolvedValue({
      venueName: undefined,
      shortLabel: undefined,
      address: 'Somewhere, Montréal, QC, Canada'
    });
    const nearbyPlaceImpl = vi.fn().mockResolvedValue(undefined);
    const [result] = await enrichMissingAddresses([pointedNoAddress], {
      delayMs: 0,
      reverseGeocodeImpl,
      nearbyPlaceImpl
    });
    expect(result?.venueName).toBeUndefined();
    expect(result?.address).toBe('Somewhere, Montréal, QC, Canada');
  });

  it('leaves events with an existing venue name or address untouched', async () => {
    const reverseGeocodeImpl = vi.fn();
    const hasVenueName: RawIngestedEvent = {
      ...pointedNoAddress,
      venueName: 'Le Balcon'
    };
    const [result] = await enrichMissingAddresses([hasVenueName], {
      delayMs: 0,
      reverseGeocodeImpl
    });
    expect(reverseGeocodeImpl).not.toHaveBeenCalled();
    expect(result).toEqual(hasVenueName);
  });

  it('does nothing for events without a resolved point', async () => {
    const reverseGeocodeImpl = vi.fn();
    const noPoint: RawIngestedEvent = { ...pointedNoAddress, point: undefined };
    const [result] = await enrichMissingAddresses([noPoint], {
      delayMs: 0,
      reverseGeocodeImpl
    });
    expect(reverseGeocodeImpl).not.toHaveBeenCalled();
    expect(result).toEqual(noPoint);
  });
});

describe('extractInstagramWatchlist', () => {
  it('extracts one target per unique source_id with a handle', () => {
    const csv =
      'source_id,instagram_handle\nmtelus,mtelusmontreal\nno-handle,\nmtelus,duplicate\n';
    const targets = extractInstagramWatchlist(csv);
    expect(targets).toEqual([{ sourceId: 'mtelus', handle: 'mtelusmontreal' }]);
  });
});

describe('fetchInstagramScoutSignals', () => {
  it('uses Graph API v25 and preserves the Feed/Reel product distinction', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          business_discovery: {
            media: {
              data: [
                {
                  id: 'media-1',
                  media_type: 'VIDEO',
                  media_product_type: 'REELS',
                  permalink: 'https://www.instagram.com/reel/example/',
                  timestamp: '2026-07-09T20:00:20+0000'
                }
              ]
            }
          }
        }),
        { status: 200 }
      )
    );

    const signals = await fetchInstagramScoutSignals(
      [{ sourceId: 'new-city-gas', handle: 'newcitygas' }],
      {
        queryingInstagramUserId: '17841410162193967',
        accessToken: 'test-token',
        fetchImpl
      }
    );

    const requestedUrl = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(requestedUrl.pathname).toBe('/v25.0/17841410162193967');
    expect(requestedUrl.searchParams.get('fields')).toContain(
      'media_product_type'
    );
    expect(signals[0]).toMatchObject({
      sourceId: 'new-city-gas',
      handle: 'newcitygas',
      mediaType: 'VIDEO',
      mediaProductType: 'REELS'
    });
  });
});

describe('selectInstagramPilotTargets', () => {
  const registry =
    'source_id,instagram_handle\nnew-city-gas,newcitygas\nmtelus,mtelusmontreal\n';

  it('keeps the explicit pilot order and removes duplicate source ids', () => {
    expect(
      selectInstagramPilotTargets(registry, [
        'mtelus',
        'new-city-gas',
        'mtelus'
      ])
    ).toEqual([
      { sourceId: 'mtelus', handle: 'mtelusmontreal' },
      { sourceId: 'new-city-gas', handle: 'newcitygas' }
    ]);
  });

  it('rejects a source outside the DATA-0002 registry', () => {
    expect(() =>
      selectInstagramPilotTargets(registry, ['unknown-source'])
    ).toThrow('unknown-source');
  });
});

describe('buildInstagramScoutReviewQueue', () => {
  it('deduplicates signals and leaves every item for human review', () => {
    const signal = {
      sourceId: 'new-city-gas',
      handle: 'newcitygas',
      mediaId: 'media-1',
      mediaType: 'VIDEO',
      mediaProductType: 'REELS',
      permalink: 'https://www.instagram.com/reel/example/',
      timestamp: '2026-07-23T20:00:00+0000',
      observedAt: '2026-07-24T12:00:00.000Z'
    };

    const queue = buildInstagramScoutReviewQueue(
      [signal, signal],
      '2026-07-24T12:01:00.000Z'
    );

    expect(queue).toMatchObject({
      generatedAt: '2026-07-24T12:01:00.000Z',
      publicationAuthorized: false,
      itemCount: 1,
      sourceCount: 1,
      productTypeCounts: { REELS: 1 }
    });
    expect(queue.items[0]).toMatchObject({
      reviewId: 'new-city-gas:media-1',
      status: 'needs_review',
      reviewerNotes: ''
    });
  });
});

describe('triageInstagramScoutItem', () => {
  const baseItem = {
    reviewId: 'source:media',
    status: 'needs_review' as const,
    sourceId: 'source',
    handle: 'source',
    mediaId: 'media',
    observedAt: '2026-07-24T12:00:00.000Z',
    reviewerNotes: ''
  };

  it('prioritizes a dated ticket announcement without accepting it', () => {
    expect(
      triageInstagramScoutItem({
        ...baseItem,
        caption:
          'Concert le 30 juillet. Billets en vente maintenant, portes à 20h.'
      })
    ).toMatchObject({
      decision: 'likely_event',
      reviewPriority: 'high',
      manualReviewRequired: true,
      dateMentions: ['30 juillet']
    });
  });

  it('sets a clear recap aside without authorizing publication', () => {
    expect(
      triageInstagramScoutItem({
        ...baseItem,
        caption: 'What a night! Thank you all for coming. Photos from the show.'
      })
    ).toMatchObject({
      decision: 'likely_not_event',
      reviewPriority: 'low',
      manualReviewRequired: false
    });
  });

  it('keeps an ambiguous contest in the review queue', () => {
    expect(
      triageInstagramScoutItem({
        ...baseItem,
        caption: 'Concours : deux billets à gagner pour notre prochain show.'
      })
    ).toMatchObject({
      decision: 'uncertain',
      reviewPriority: 'normal',
      manualReviewRequired: true
    });
  });
});

describe('extractInstagramScoutFacts', () => {
  it('keeps caption facts raw and does not claim the source is the venue', () => {
    const item = {
      reviewId: 'evenko:media',
      status: 'needs_review' as const,
      sourceId: 'evenko',
      handle: 'evenko',
      mediaId: 'media',
      caption:
        'ARTIST LIVE\n30 juillet à 20h — billets 25$ en vente avec @artist',
      observedAt: '2026-07-24T12:00:00.000Z',
      reviewerNotes: ''
    };
    const triage = triageInstagramScoutItem(item);

    expect(extractInstagramScoutFacts(item, triage)).toMatchObject({
      workingTitle: 'ARTIST LIVE',
      workingTitleConfidence: 0.35,
      dateMentions: ['30 juillet'],
      timeMentions: ['20h'],
      priceMentions: ['25$'],
      mentionedAccounts: ['@artist'],
      ticketingMentioned: true,
      sourceAccount: {
        sourceId: 'evenko',
        handle: 'evenko',
        role: 'possible_host_or_organizer'
      },
      missingFacts: ['venue_confirmation'],
      evidenceCompleteness: 0.75
    });
  });

  it('reports missing facts instead of inventing them', () => {
    const item = {
      reviewId: 'source:media',
      status: 'needs_review' as const,
      sourceId: 'source',
      handle: 'source',
      mediaId: 'media',
      caption: 'Big news soon',
      observedAt: '2026-07-24T12:00:00.000Z',
      reviewerNotes: ''
    };
    const triage = triageInstagramScoutItem(item);

    expect(extractInstagramScoutFacts(item, triage)).toMatchObject({
      workingTitle: 'Big news soon',
      dateMentions: [],
      timeMentions: [],
      missingFacts: ['date', 'time', 'venue_confirmation'],
      evidenceCompleteness: 0.25
    });
  });
});
