import {
  CannotRequestOwnEventError,
  EventAccessDeclinedError,
  EventNotOnApprovalError
} from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventAccessRepository,
  fakeEventRepository,
  fakeNotificationsRepository,
  testUser
} from './test-support.js';

/**
 * DEC-0022 §6 route wiring.
 *
 * The disclosure rule itself is not testable here and is deliberately not
 * tested here: it lives in SQL, and a fake repository would happily agree
 * with whatever this file asserted. That guarantee is pinned against a real
 * PostgreSQL in tests/integration/dec-0022-address-disclosure.test.ts. What
 * this file covers is what routes do: who may call them, and what a refusal
 * looks like.
 */
const event = fakeEventRepository();
const eventId = '00000000-0000-4000-8000-000000000040';
const otherUserId = '00000000-0000-4000-8000-000000000041';

describe('DEC-0022 event access requests', () => {
  it('refuses every access route without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const post = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      payload: {}
    });
    const list = await app.inject({
      method: 'GET',
      url: `/me/events/${eventId}/access-requests`
    });
    const resolve = await app.inject({
      method: 'PUT',
      url: `/me/events/${eventId}/access-requests/${otherUserId}`,
      payload: { decision: 'approved' }
    });
    expect(post.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
    expect(resolve.statusCode).toBe(401);
    await app.close();
  });

  it('notifies the organizer when a request is genuinely new', async () => {
    const notified: string[] = [];
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          request: async () => 'pending',
          findOrganizerId: async () => otherUserId
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyEventAccessRequested: async (organizerId) => {
            notified.push(organizerId);
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { message: 'Ami de Léa' }
    });
    expect(response.statusCode).toBe(201);
    expect(notified).toEqual([otherUserId]);
    await app.close();
  });

  it('does not re-notify when the request already existed', async () => {
    let notifications = 0;
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          // Already approved: the row exists, so nothing new happened and
          // pressing the button again must not ping the organizer.
          request: async () => 'approved',
          findOrganizerId: async () => otherUserId
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyEventAccessRequested: async () => {
            notifications += 1;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {}
    });
    expect(response.statusCode).toBe(201);
    expect(notifications).toBe(0);
    await app.close();
  });

  it('answers 404 for an event that does not withhold its address', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          request: async () => {
            throw new EventNotOnApprovalError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {}
    });
    // Same answer a missing event gives: distinguishing them would confirm
    // which event ids are private afters.
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('refuses a second request from an account already declined', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          request: async () => {
            throw new EventAccessDeclinedError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {}
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ACCESS_DECLINED');
    await app.close();
  });

  it('refuses an organizer asking for their own address', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          request: async () => {
            throw new CannotRequestOwnEventError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/access-request`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {}
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ALREADY_ORGANIZER');
    await app.close();
  });

  it('hides the queue from anyone but the organizer of that event', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          findOrganizerId: async () => otherUserId
        })
      })
    );
    const list = await app.inject({
      method: 'GET',
      url: `/me/events/${eventId}/access-requests`,
      headers: { authorization: 'Bearer valid-token' }
    });
    const resolve = await app.inject({
      method: 'PUT',
      url: `/me/events/${eventId}/access-requests/${otherUserId}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { decision: 'approved' }
    });
    expect(list.statusCode).toBe(404);
    expect(resolve.statusCode).toBe(404);
    await app.close();
  });

  it('notifies the requester on both outcomes', async () => {
    const outcomes: Array<{ userId: string; approved: boolean }> = [];
    const buildFor = (decision: 'approved' | 'declined') =>
      buildApp(
        event,
        accountRepositories({
          eventAccessRepository: fakeEventAccessRepository({
            findOrganizerId: async () => testUser.id,
            resolve: async () => true
          }),
          notificationsRepository: fakeNotificationsRepository({
            notifyEventAccessResolved: async (userId, _eventId, approved) => {
              outcomes.push({ userId, approved });
            }
          })
        })
      ).inject({
        method: 'PUT',
        url: `/me/events/${eventId}/access-requests/${otherUserId}`,
        headers: { authorization: 'Bearer valid-token' },
        payload: { decision }
      });

    expect((await buildFor('approved')).statusCode).toBe(200);
    expect((await buildFor('declined')).statusCode).toBe(200);
    expect(outcomes).toEqual([
      { userId: otherUserId, approved: true },
      { userId: otherUserId, approved: false }
    ]);
  });

  it('answers 409 when there is nothing left to decide', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventAccessRepository: fakeEventAccessRepository({
          findOrganizerId: async () => testUser.id,
          // The repository refuses to re-approve a declined row, which is
          // what a false return means here.
          resolve: async () => false
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/me/events/${eventId}/access-requests/${otherUserId}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { decision: 'approved' }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('REQUEST_NOT_PENDING');
    await app.close();
  });
});
