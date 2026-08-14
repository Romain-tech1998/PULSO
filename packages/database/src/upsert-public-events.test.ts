import type { PublicEvent } from '@pulso/contracts';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  canonicalizeKnownVenue,
  getStableSourceEntryId,
  upsertPublicEvents
} from './upsert-public-events.js';

const event: PublicEvent = {
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Soirée synthétique',
  category: 'nightlife',
  status: 'scheduled',
  startsAt: '2026-08-08T23:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'unknown', currency: 'CAD' },
  accessInformation: 'Consulter la source.',
  venue: {
    id: '00000000-0000-4000-8000-000000000102',
    name: 'Lieu synthétique',
    address: '1000 Rue Synthétique, Montréal, QC',
    point: { longitude: -73.5673, latitude: 45.5017 }
  },
  source: {
    name: 'Source synthétique',
    url: 'https://example.com/evenements/soiree-synthetique',
    observedAt: '2026-08-04T12:00:00.000Z'
  },
  trust: {
    label: 'confirmed',
    freshness: 'unknown',
    locationConfidence: 'confirmed'
  }
};

describe('upsertPublicEvents duplicate prevention', () => {
  it('reuses the persisted identity for the same source, start and title', async () => {
    const existingId = '00000000-0000-4000-8000-000000000199';
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT id') && sql.includes('source_url')) {
        return { rows: [{ id: existingId }] };
      }
      return { rows: [] };
    });

    await upsertPublicEvents({ query } as unknown as Pool, [{ event }]);

    const eventInsert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO events')
    );
    expect(eventInsert).toBeDefined();
    expect(eventInsert?.[1]?.[0]).toBe(existingId);
  });

  it('uses the incoming identity when no matching event exists', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: []
    }));

    await upsertPublicEvents({ query } as unknown as Pool, [{ event }]);

    const eventInsert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO events')
    );
    expect(eventInsert?.[1]?.[0]).toBe(event.id);
  });

  it('extracts the stable Ville de Montréal entry id after a renamed slug', () => {
    expect(
      getStableSourceEntryId(
        'Ville de Montréal — Événements publics',
        'https://montreal.ca/evenements/festival-presence-autochtone-sweet-grass-111646'
      )
    ).toBe('111646');
    expect(
      getStableSourceEntryId(
        'Source synthétique',
        'https://example.com/evenements/festival-111646'
      )
    ).toBeNull();
  });

  it('queries the stable source entry id to survive an upstream title change', async () => {
    const existingId = '00000000-0000-4000-8000-000000000188';
    const renamedEvent: PublicEvent = {
      ...event,
      source: {
        ...event.source,
        name: 'Ville de Montréal — Événements publics',
        url: 'https://montreal.ca/evenements/festival-presence-autochtone-sweet-grass-111646'
      }
    };
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id') && params?.[3] === '111646') {
        return { rows: [{ id: existingId }] };
      }
      return { rows: [] };
    });

    await upsertPublicEvents({ query } as unknown as Pool, [
      { event: renamedEvent }
    ]);

    const eventInsert = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO events')
    );
    expect(eventInsert?.[1]?.[0]).toBe(existingId);
  });

  it('canonicalizes IGA Stadium court aliases into one public venue', () => {
    const canonical = canonicalizeKnownVenue({
      id: '00000000-0000-4000-8000-000000000333',
      name: 'Rogers Court',
      address: '285 Rue Gary-Carter',
      point: { longitude: -73.6238, latitude: 45.5357 },
      category: 'other'
    });

    expect(canonical).toMatchObject({
      id: '4f2b4dd1-c94b-532c-b556-1d37ad27026a',
      name: 'Stade IGA',
      address: '285 Rue Gary-Carter, Montréal, QC',
      point: { longitude: -73.627173, latitude: 45.532854 }
    });
  });
});
