import type { EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { accountRepositories, fakeReportsRepository, testUser } from './test-support.js';

const event: EventRepository = {
  findInBounds: async () => [],
  findWithinDirectDistance: async () => [],
  findById: async () => undefined,
  findExternalDestination: async () => undefined,
  findVenuesWithoutUpcomingEvents: async () => [],
  findByIds: async () => []
};

const targetId = '00000000-0000-4000-8000-000000000030';

describe('content reports API', () => {
  it('rejects reporting without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/reports',
      payload: { targetType: 'forum_post', targetId }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('captures a report with an optional reason', async () => {
    let received:
      | { reporterId: string; targetType: string; targetId: string; reason: string | undefined }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        reportsRepository: fakeReportsRepository({
          createReport: async (reporterId, targetType, id, reason) => {
            received = { reporterId, targetType, targetId: id, reason };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: 'Bearer valid-token' },
      payload: { targetType: 'message', targetId, reason: 'Spam' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      reporterId: testUser.id,
      targetType: 'message',
      targetId,
      reason: 'Spam'
    });
    await app.close();
  });

  it('rejects an unknown target type', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: { authorization: 'Bearer valid-token' },
      payload: { targetType: 'user', targetId }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
