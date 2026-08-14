import {
  MessageRequestDeclinedError,
  MessageRequestPendingError,
  NotFriendsError
} from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeMessage,
  fakeMessagesRepository,
  fakeNotificationsRepository,
  friend,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

describe('direct messages API', () => {
  it('rejects messaging routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const send = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      payload: { body: 'Salut' }
    });
    const list = await app.inject({
      method: 'GET',
      url: `/me/friends/${friend.id}/messages`
    });
    const unread = await app.inject({
      method: 'GET',
      url: '/me/messages/unread-count'
    });
    expect(send.statusCode).toBe(401);
    expect(list.statusCode).toBe(401);
    expect(unread.statusCode).toBe(401);
    await app.close();
  });

  it('sends a message to a friend', async () => {
    let received:
      { senderId: string; recipientId: string; body: string } | undefined;
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
        messagesRepository: fakeMessagesRepository({
          getConversation: async () => [message]
        })
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
        messagesRepository: fakeMessagesRepository({
          getUnreadCount: async () => 3
        })
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
    const response = await app.inject({
      method: 'GET',
      url: '/me/conversations'
    });
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

describe('message requests (DEC-0020)', () => {
  const auth = { authorization: 'Bearer valid-token' };

  it('rejects the request routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const list = await app.inject({
      method: 'GET',
      url: '/me/message-requests'
    });
    const respond = await app.inject({
      method: 'PUT',
      url: `/me/message-requests/${friend.id}`,
      payload: { action: 'accept' }
    });
    expect(list.statusCode).toBe(401);
    expect(respond.statusCode).toBe(401);
    await app.close();
  });

  it('answers 429 when the one allowed message has already been sent', async () => {
    // Not 403: the sender is not barred from this account, they have used
    // their single message and have to wait for an answer.
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          sendMessage: async () => {
            throw new MessageRequestPendingError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: auth,
      payload: { body: 'Encore moi' }
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe('MESSAGE_REQUEST_PENDING');
    await app.close();
  });

  it('answers 403 once the recipient has declined', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          sendMessage: async () => {
            throw new MessageRequestDeclinedError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: auth,
      payload: { body: 'Rebonjour' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('MESSAGE_REQUEST_DECLINED');
    await app.close();
  });

  it('notifies nobody about a message still behind a pending request', async () => {
    // The whole point of the request gate: a stranger may write, but
    // writing must not ring the recipient's bell before they let them in.
    let notified = false;
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          getMessageRequests: async () => [
            {
              sender: { id: testUser.id, displayName: testUser.displayName },
              message: undefined,
              createdAt: '2026-08-13T12:00:00.000Z'
            }
          ]
        }),
        notificationsRepository: fakeNotificationsRepository({
          notifyMessageReceived: async () => {
            notified = true;
          }
        })
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: auth,
      payload: { body: 'On se croise ce soir ?' }
    });

    expect(response.statusCode).toBe(201);
    expect(notified).toBe(false);
    await app.close();
  });

  it('notifies normally once no request is pending', async () => {
    let notified = false;
    const app = buildApp(
      event,
      accountRepositories({
        notificationsRepository: fakeNotificationsRepository({
          notifyMessageReceived: async () => {
            notified = true;
          }
        })
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: `/me/friends/${friend.id}/messages`,
      headers: auth,
      payload: { body: 'Salut' }
    });

    expect(response.statusCode).toBe(201);
    expect(notified).toBe(true);
    await app.close();
  });

  it('accepts a request and reports 404 when there was none to answer', async () => {
    let seen: [string, string, string] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        messagesRepository: fakeMessagesRepository({
          respondToMessageRequest: async (recipientId, senderId, action) => {
            seen = [recipientId, senderId, action];
            return action === 'accept';
          }
        })
      })
    );

    const accepted = await app.inject({
      method: 'PUT',
      url: `/me/message-requests/${friend.id}`,
      headers: auth,
      payload: { action: 'accept' }
    });
    expect(accepted.statusCode).toBe(204);
    expect(seen).toEqual([testUser.id, friend.id, 'accept']);

    const missing = await app.inject({
      method: 'PUT',
      url: `/me/message-requests/${friend.id}`,
      headers: auth,
      payload: { action: 'decline' }
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
