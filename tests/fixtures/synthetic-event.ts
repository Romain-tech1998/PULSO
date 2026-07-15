import type { PublicEvent } from '@pulso/contracts';

export const syntheticMontrealEvent: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Synthetic Montréal Pulse',
  category: 'music',
  status: 'scheduled',
  startsAt: '2026-08-01T00:00:00.000Z',
  endsAt: '2026-08-01T03:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  venue: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Synthetic Montréal Venue',
    address: '1000 Rue Synthétique, Montréal, QC',
    point: { longitude: -73.5673, latitude: 45.5017 }
  },
  source: {
    name: 'Synthetic source',
    url: 'https://example.com/pulso-synthetic-event',
    observedAt: '2026-07-15T12:00:00.000Z'
  },
  trust: { freshness: 'unknown', locationConfidence: 'confirmed' }
};
