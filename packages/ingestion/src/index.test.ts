import { describe, expect, it } from 'vitest';

import { parseCsv } from './lib/csv.js';
import { parseIcs } from './sources/ics-calendar.js';
import { mapMontrealOpenDataRow } from './sources/montreal-open-data.js';
import { mapTicketmasterEvent } from './sources/ticketmaster.js';
import { extractInstagramWatchlist } from './registry.js';

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
  });

  it('returns undefined when the row has no title or start date', () => {
    const event = mapMontrealOpenDataRow({ titre: '', date_debut: '' }, 'now');
    expect(event).toBeUndefined();
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

describe('extractInstagramWatchlist', () => {
  it('extracts one target per unique source_id with a handle', () => {
    const csv =
      'source_id,instagram_handle\nmtelus,mtelusmontreal\nno-handle,\nmtelus,duplicate\n';
    const targets = extractInstagramWatchlist(csv);
    expect(targets).toEqual([{ sourceId: 'mtelus', handle: 'mtelusmontreal' }]);
  });
});
