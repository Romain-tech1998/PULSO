import type { Notification } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeFriendsRepository,
  fakeMessagesRepository,
  fakeNotificationsRepository,
  friend,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

const storedNotification: Notification = {
  kind: 'venue_new_event',
  id: '00000000-0000-4000-8000-0000000000a1',
  createdAt: '2026-08-05T12:00:00.000Z',
  readAt: null,
  venueId: '00000000-0000-4000-8000-0000000000a2',
  venueName: 'Le Balcon',
  eventId: '00000000-0000-4000-8000-0000000000a3',
  eventTitle: 'Jazz X Terrasse',
  eventStartsAt: '2026-08-08T23:00:00.000Z'
};

describe('notifications API (DEC-0016)', () => {
  it('requires an account', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: '/me/notifications'
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the list with its unread count', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        notificationsRepository: fakeNotificationsRepository({
          list: async () => [storedNotification],
          countUnread: async () => 1
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/notifications',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      notifications: [storedNotification],
      unreadCount: 1
    });
    await app.close();
  });

  it('marks every notification read for the caller only', async () => {
    let markedFor: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        notificationsRepository: fakeNotificationsRepository({
          markAllRead: async (userId) => {
            markedFor = userId;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/notifications/read',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(markedFor).toBe(testUser.id);
    await app.close();
  });
});

describe('notification triggers (DEC-0016)', () => {
  it('notifies the addressee when a friend request is sent', async () => {
    let notified: { recipient: string; actor: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          sendRequest: async () => friend.id
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyFriendRequestReceived: async (recipient, actor) => {
            notified = { recipient, actor };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/friends/requests',
      headers: { authorization: 'Bearer valid-token' },
      payload: { friendCode: 'a1b2c3d4' }
    });
    expect(response.statusCode).toBe(204);
    expect(notified).toEqual({ recipient: friend.id, actor: testUser.id });
    await app.close();
  });

  it('notifies the requester when their request is accepted', async () => {
    let notified: { recipient: string; actor: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          respondToRequest: async () => friend.id
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyFriendRequestAccepted: async (recipient, actor) => {
            notified = { recipient, actor };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/friends/requests/00000000-0000-4000-8000-000000000011',
      headers: { authorization: 'Bearer valid-token' },
      payload: { action: 'accept' }
    });
    expect(response.statusCode).toBe(204);
    expect(notified).toEqual({ recipient: friend.id, actor: testUser.id });
    await app.close();
  });

  // DEC-0016 authorizes a notification for an accepted request only.
  it('sends nothing when a request is declined', async () => {
    let notified = false;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          respondToRequest: async () => undefined
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyFriendRequestAccepted: async () => {
            notified = true;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/friends/requests/00000000-0000-4000-8000-000000000011',
      headers: { authorization: 'Bearer valid-token' },
      payload: { action: 'decline' }
    });
    expect(response.statusCode).toBe(204);
    expect(notified).toBe(false);
    await app.close();
  });

  // Acceptance criterion 4: the recipient only, never the sender.
  it('notifies the recipient of a direct message', async () => {
    let notified: { recipient: string; actor: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository(),
        notificationsRepository: fakeNotificationsRepository({
          notifyMessageReceived: async (recipient, actor) => {
            notified = { recipient, actor };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'On se retrouve devant à 21h ?' }
    });
    expect(response.statusCode).toBe(201);
    expect(notified).toEqual({ recipient: friend.id, actor: testUser.id });
    await app.close();
  });
});
