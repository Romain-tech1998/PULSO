import { describe, expect, it, vi } from 'vitest';

import { parseCsv } from './lib/csv.js';
import {
  enrichMissingAddresses,
  enrichMissingCoordinates
} from './lib/geocode-fallback.js';
import { parseIcs } from './sources/ics-calendar.js';
import { mapMontrealOpenDataRow } from './sources/montreal-open-data.js';
import { mapTicketmasterEvent } from './sources/ticketmaster.js';
import { extractInstagramWatchlist } from './registry.js';
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
