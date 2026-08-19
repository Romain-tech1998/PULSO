import type { ConversationsRepository } from '@pulso/database';
import { ParticipantNotReachableError } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { accountRepositories, fakeEventRepository } from './test-support.js';

/**
 * DEC-0025 at the route level: the codes, and the one rule a route owns
 * rather than the repository - a refusal to add somebody must not read as a
 * missing room, because the two tell the caller different things about what
 * exists.
 */
function fakeConversations(
  overrides: Partial<ConversationsRepository> = {}
): ConversationsRepository {
  return {
    createConversation: async () => 'ecf9f8c0-0000-4000-8000-000000000001',
    addParticipant: async () => undefined,
    leaveConversation: async () => undefined,
    listConversations: async () => [],
    getMessages: async () => [],
    sendMessage: async () => ({
      id: 'ecf9f8c0-0000-4000-8000-00000000000a',
      conversationId: 'ecf9f8c0-0000-4000-8000-000000000001',
      senderId: 'ecf9f8c0-0000-4000-8000-0000000000ff',
      body: 'Salut',
      createdAt: new Date().toISOString(),
      attachments: []
    }),
    markRead: async () => undefined,
    setMuted: async () => undefined,
    setPinned: async () => undefined,
    search: async () => [],
    participantsToNotify: async () => [],
    ...overrides
  };
}

const token = 'valid-token';

function appWith(conversations: ConversationsRepository) {
  return buildApp(
    fakeEventRepository(),
    accountRepositories({ conversationsRepository: conversations })
  );
}

describe('DEC-0025 conversation routes', () => {
  it('refuses an unauthenticated caller before anything else', async () => {
    const app = appWith(fakeConversations());
    const response = await app.inject({
      method: 'GET',
      url: '/me/rooms'
    });
    expect(response.statusCode).toBe(401);
  });

  it('opens a room and answers with its id', async () => {
    const app = appWith(fakeConversations());
    const response = await app.inject({
      method: 'POST',
      url: '/me/rooms',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantIds: ['ecf9f8c0-0000-4000-8000-0000000000b1'] }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().data.id).toBe(
      'ecf9f8c0-0000-4000-8000-000000000001'
    );
  });

  it('answers 403, not 404, when the adder could not already write to them', async () => {
    // The distinction is the point: 404 would say the room does not exist,
    // which is a different and false statement about the world.
    const app = appWith(
      fakeConversations({
        createConversation: async () => {
          throw new ParticipantNotReachableError();
        }
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/rooms',
      headers: { authorization: `Bearer ${token}` },
      payload: { participantIds: ['ecf9f8c0-0000-4000-8000-0000000000b1'] }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('PARTICIPANT_NOT_REACHABLE');
  });

  it('refuses a message with nothing in it', async () => {
    const app = appWith(fakeConversations());
    const response = await app.inject({
      method: 'POST',
      url: '/me/rooms/ecf9f8c0-0000-4000-8000-000000000001/messages',
      headers: { authorization: `Bearer ${token}` },
      payload: { body: '   ' }
    });
    expect(response.statusCode).toBe(400);
  });

  it('leaves without naming anybody: the only id it accepts is the caller', async () => {
    let left: string | undefined;
    const app = appWith(
      fakeConversations({
        leaveConversation: async (_id, userId) => {
          left = userId;
        }
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: '/me/rooms/ecf9f8c0-0000-4000-8000-000000000001/participants',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(204);
    expect(left).toBeDefined();
  });

  it('carries mute and pin as the reader’s own switches', async () => {
    const seen: Array<{ muted?: boolean; pinned?: boolean }> = [];
    const app = appWith(
      fakeConversations({
        setMuted: async (_id, _user, muted) => {
          seen.push({ muted });
        },
        setPinned: async (_id, _user, pinned) => {
          seen.push({ pinned });
        }
      })
    );
    const room = 'ecf9f8c0-0000-4000-8000-000000000001';
    await app.inject({
      method: 'PUT',
      url: `/me/rooms/${room}/muted`,
      headers: { authorization: `Bearer ${token}` },
      payload: { value: true }
    });
    await app.inject({
      method: 'PUT',
      url: `/me/rooms/${room}/pinned`,
      headers: { authorization: `Bearer ${token}` },
      payload: { value: true }
    });
    expect(seen).toEqual([{ muted: true }, { pinned: true }]);
  });

  it('will not search on a fragment too short to mean anything', async () => {
    const app = appWith(fakeConversations());
    const response = await app.inject({
      method: 'GET',
      url: '/me/rooms/search?q=a',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(response.statusCode).toBe(400);
  });
});
