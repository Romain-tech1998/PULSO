import { NotFriendsError, type EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeMessage,
  fakeMessagesRepository,
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

describe('direct messages API', () => {
  it('rejects messaging routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const send = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      payload: { body: 'Salut' }
    });
    const list = await app.inject({ method: 'GET', url: `/me/friends/${friend.id}/messages` });
    const unread = await app.inject({ method: 'GET', url: '/me/messages/unread-count' });
    expect(send.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
    expect(unread.statusCode).toBe(401);
    await app.close();
  });

  it('sends a message to a friend', async () => {
    let received: { senderId: string; recipientId: string; body: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          sendMessage: async (senderId, recipientId, body) => {
            received = { senderId, recipientId, body };
            return fakeMessage({ senderId, recipientId, body });
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
    expect(received).toEqual({
      senderId: testUser.id,
      recipientId: friend.id,
      body: 'On se retrouve devant à 21h ?'
    });
    expect(response.json().data.body).toBe('On se retrouve devant à 21h ?');
    await app.close();
  });

  it('returns 403 when the recipient is not an accepted friend', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          sendMessage: async () => {
            throw new NotFriendsError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'Salut' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('NOT_FRIENDS');
    await app.close();
  });

  it('returns the conversation with a friend', async () => {
    const message = fakeMessage();
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({ getConversation: async () => [message] })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/me/friends/${friend.id}/messages`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([message]);
    await app.close();
  });

  it('marks a conversation read', async () => {
    let received: { userId: string; friendUserId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          markConversationRead: async (userId, friendUserId) => {
            received = { userId, friendUserId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/me/friends/${friend.id}/messages/read`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ userId: testUser.id, friendUserId: friend.id });
    await app.close();
  });

  it('returns the unread count', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({ getUnreadCount: async () => 3 })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/messages/unread-count',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ count: 3 });
    await app.close();
  });

  it('rejects the conversations list without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/me/conversations' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the conversation summaries list', async () => {
    const summary = {
      friend,
      lastMessage: fakeMessage(),
      unreadCount: 2
    };
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          getConversations: async () => [summary]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/conversations',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([summary]);
    await app.close();
  });
});
