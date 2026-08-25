import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import {
  getVenueDiscoveryDateRange,
  partitionVenueEvents,
  shortenMontrealAddress
} from './venue-view-model.js';

const baseEvent: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-08-04T23:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  accessInformation: 'Free entry.',
  venue: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic Montréal Venue',
    address: '1000 Rue Synthétique, Montréal, QC',
    point: { longitude: -73.5673, latitude: 45.5017 }
  },
  source: {
    name: 'Synthetic source',
    url: 'https://example.com/event',
    observedAt: '2026-08-01T12:00:00.000Z'
  },
  trust: {
    label: 'confirmed',
    freshness: 'unknown',
    locationConfidence: 'confirmed'
  }
};

function eventAt(id: string, startsAt: string): PublicEvent {
  return { ...baseEvent, id, startsAt };
}

describe('venue discovery window', () => {
  it('covers fourteen Montréal calendar dates including today', () => {
    expect(
      getVenueDiscoveryDateRange(new Date('2026-08-04T16:00:00.000Z'))
    ).toEqual({ start: '2026-08-04', end: '2026-08-17' });
  });

  it('crosses month and year boundaries', () => {
    expect(
      getVenueDiscoveryDateRange(new Date('2026-12-27T17:00:00.000Z'))
    ).toEqual({ start: '2026-12-27', end: '2027-01-09' });
  });

  it('separates Montréal-today events and excludes events after the window', () => {
    const todayLate = eventAt(
      '00000000-0000-4000-8000-000000000010',
      '2026-08-05T03:30:00.000Z'
    );
    const tomorrow = eventAt(
      '00000000-0000-4000-8000-000000000011',
      '2026-08-05T04:30:00.000Z'
    );
    const lastDay = eventAt(
      '00000000-0000-4000-8000-000000000012',
      '2026-08-17T16:00:00.000Z'
    );
    const outside = eventAt(
      '00000000-0000-4000-8000-000000000013',
      '2026-08-18T16:00:00.000Z'
    );

    const result = partitionVenueEvents(
      [outside, tomorrow, lastDay, todayLate],
      new Date('2026-08-04T16:00:00.000Z')
    );

    expect(result.today.map((event) => event.id)).toEqual([todayLate.id]);
    expect(result.later.map((event) => event.id)).toEqual([
      tomorrow.id,
      lastDay.id
    ]);
  });
});

describe('shortenMontrealAddress', () => {
  it('keeps the civic number, the street and the neighbourhood', () => {
    expect(
      shortenMontrealAddress(
        'Bibliothèque Benny, 6400, Avenue de Monkland, Notre-Dame-de-Grâce, Côte-des-Neiges–Notre-Dame-de-Grâce, Montréal, Agglomération de Montréal, Montréal (région administrative), Québec, H4B 1H3, Canada',
        'Bibliothèque Benny'
      )
    ).toBe('6400 Avenue de Monkland, Notre-Dame-de-Grâce');
  });

  it('drops the administrative tail when there is no venue name to strip', () => {
    expect(
      shortenMontrealAddress(
        '3000, Rue Saint-Antoine, Lachine, Montréal, Agglomération de Montréal, Montréal (région administrative), Québec, H8S 1X8, Canada'
      )
    ).toBe('3000 Rue Saint-Antoine, Lachine');
  });

  it('handles a street with no civic number', () => {
    expect(
      shortenMontrealAddress(
        'Piscine Jarry, Rue Saint-Roch, Parc-Extension, Villeray–Saint-Michel–Parc-Extension, Montréal, Agglomération de Montréal, Québec, H3N 1K2, Canada',
        'Piscine Jarry'
      )
    ).toBe('Rue Saint-Roch, Parc-Extension');
  });

  it('leaves a hand-entered address alone even when it names the city', () => {
    // Three parts and a city is an ordinary address somebody typed, not a
    // geocoder tail. An earlier rule counted commas and quietly turned this
    // into "1000 Rue Synthétique, QC" - caught by an e2e test asserting
    // what the record actually shows.
    expect(shortenMontrealAddress('1000 Rue Synthétique, Montréal, QC')).toBe(
      '1000 Rue Synthétique, Montréal, QC'
    );
  });

  it('leaves a short, hand-entered address exactly as it is', () => {
    expect(shortenMontrealAddress('1234 Rue Sainte-Catherine Ouest')).toBe(
      '1234 Rue Sainte-Catherine Ouest'
    );
    expect(shortenMontrealAddress('5240 Av. du Parc, Montréal')).toBe(
      '5240 Av. du Parc, Montréal'
    );
  });

  it('never returns an empty string, whatever it is handed', () => {
    // An address made entirely of administrative noise still has to render
    // as something rather than collapse to nothing.
    expect(
      shortenMontrealAddress('Montréal, Québec, Canada').length
    ).toBeGreaterThan(0);
  });
});
