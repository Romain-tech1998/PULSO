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
  description: 'A fictional music event used only to validate Pulso.',
  organizer: 'Synthetic Montréal Organizer',
  accessInformation: 'Free entry. No reservation is required for this fixture.',
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
  trust: {
    label: 'confirmed',
    freshness: 'unknown',
    locationConfidence: 'confirmed'
  },
  externalDestination: {
    label: 'Synthetic event source (example.com)',
    kind: 'event_source',
    status: 'available'
  }
};
