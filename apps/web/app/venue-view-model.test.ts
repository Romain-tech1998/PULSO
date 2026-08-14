import type { PublicEvent } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import {
  getVenueDiscoveryDateRange,
  partitionVenueEvents
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
