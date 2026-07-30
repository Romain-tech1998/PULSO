import { EventNotFoundError, type EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeAttendanceRepository,
  friend,
  testUser
} from './test-support.js';

const event: EventRepository = {
  findInBounds: async () => [],
  findWithinDirectDistance: async () => [],
  findById: async () => undefined,
  findExternalDestination: async () => undefined,
  findVenuesWithoutUpcomingEvents: async () => [],
  findByIds: async () => []
};

const eventId = '00000000-0000-4000-8000-000000000020';

describe('participation visibility API', () => {
  it('rejects attendance routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const put = await app.inject({
      method: 'PUT',
      url: `/me/attendance/${eventId}`,
      payload: { visibility: 'private' }
    });
    const del = await app.inject({
      method: 'DELETE',
      url: `/me/attendance/${eventId}`
    });
    const list = await app.inject({ method: 'GET', url: '/me/attendance' });
    expect(put.statusCode).toBe(401);
    expect(del.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
    await app.close();
  });

  it('marks attendance with the given visibility', async () => {
    let received:
      { userId: string; eventId: string; visibility: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          setAttendance: async (userId, id, visibility) => {
            received = { userId, eventId: id, visibility };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/me/attendance/${eventId}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { visibility: 'friends' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      userId: testUser.id,
      eventId,
      visibility: 'friends'
    });
    await app.close();
  });

  it('returns 404 when marking attendance for an event that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          setAttendance: async () => {
            throw new EventNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/me/attendance/${eventId}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { visibility: 'private' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EVENT_NOT_FOUND');
    await app.close();
  });

  it('clears attendance', async () => {
    let received: { userId: string; eventId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          clearAttendance: async (userId, id) => {
            received = { userId, eventId: id };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/me/attendance/${eventId}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ userId: testUser.id, eventId });
    await app.close();
  });

  it('lists my attendance', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          getMyAttendance: async () => [{ eventId, visibility: 'friends' }]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/attendance',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{ eventId, visibility: 'friends' }]);
    await app.close();
  });

  it('returns an empty friends-attending list for an anonymous viewer, not a 401', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/friends-attending`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
    await app.close();
  });

  it('returns friends attending for a signed-in viewer', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          getFriendsAttending: async () => [friend]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/friends-attending`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([friend]);
    await app.close();
  });

  const otherEventId = '00000000-0000-4000-8000-000000000021';

  it('returns real attendee counts, no friends, for an anonymous caller on batched engagement', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          getAttendanceCountsForEvents: async () =>
            new Map([
              [eventId, 5],
              [otherEventId, 2]
            ]),
          getFriendsAttendingForEvents: async () => {
            throw new Error('must not be called for an anonymous caller');
          }
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/engagement?ids=${eventId},${otherEventId}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { eventId, attendeeCount: 5, friendsAttending: [] },
      { eventId: otherEventId, attendeeCount: 2, friendsAttending: [] }
    ]);
    await app.close();
  });

  it('returns real counts and friends attending, batched, for a signed-in viewer', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        attendanceRepository: fakeAttendanceRepository({
          getAttendanceCountsForEvents: async () => new Map([[eventId, 3]]),
          getFriendsAttendingForEvents: async () =>
            new Map([[eventId, [friend]]])
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/engagement?ids=${eventId},${otherEventId}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { eventId, attendeeCount: 3, friendsAttending: [friend] },
      { eventId: otherEventId, attendeeCount: 0, friendsAttending: [] }
    ]);
    await app.close();
  });
});
