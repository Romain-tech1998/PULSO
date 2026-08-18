import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { MapBoundsQuery } from '@pulso/contracts';

import { PostgresEventRepository } from './repository.js';

describe('PostgresEventRepository', () => {
  it('accepts a map query without an explicit category list', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const repository = new PostgresEventRepository(pool);

    await repository.findInBounds(
      {
        west: -73.75,
        south: 45.4,
        east: -73.4,
        north: 45.7,
        date: 'next7',
        price: 'all'
      } as unknown as MapBoundsQuery,
      {
        startsAt: new Date('2026-08-15T00:00:00Z'),
        endsAt: new Date('2026-08-22T00:00:00Z')
      },
      { viewerId: null }
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]?.[6]).toBeNull();
  });
});
