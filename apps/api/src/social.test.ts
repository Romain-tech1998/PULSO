import {
  CannotFriendSelfError,
  FriendCodeNotFoundError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError,
  type EventRepository
} from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeFriendRequest,
  fakeFriendsRepository,
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

describe('friend code API', () => {
  it('rejects /me/friend-code without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/me/friend-code' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the account own friend code', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({ getFriendCode: async () => 'a1b2c3d4' })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/friend-code',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ friendCode: 'a1b2c3d4' });
    await app.close();
  });
});

describe('friend requests API', () => {
  it('sends a friend request by code', async () => {
    let received: { requesterId: string; friendCode: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          sendRequest: async (requesterId, friendCode) => {
            received = { requesterId, friendCode };
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
    expect(received).toEqual({ requesterId: testUser.id, friendCode: 'a1b2c3d4' });
    await app.close();
  });

  it('returns 404 for an unknown friend code', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          sendRequest: async () => {
            throw new FriendCodeNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/friends/requests',
      headers: { authorization: 'Bearer valid-token' },
      payload: { friendCode: 'unknown0' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('FRIEND_CODE_NOT_FOUND');
    await app.close();
  });

  it('returns 400 when trying to friend yourself', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          sendRequest: async () => {
            throw new CannotFriendSelfError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/friends/requests',
      headers: { authorization: 'Bearer valid-token' },
      payload: { friendCode: 'own-code' }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CANNOT_FRIEND_SELF');
    await app.close();
  });

  it('returns 409 when a friendship or pending request already exists', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          sendRequest: async () => {
            throw new FriendshipAlreadyExistsError();
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
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('FRIENDSHIP_ALREADY_EXISTS');
    await app.close();
  });

  it('lists pending requests, incoming and outgoing', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          getPendingRequests: async () => [fakeFriendRequest()]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/friends/requests',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([fakeFriendRequest()]);
    await app.close();
  });

  it('accepts a pending request', async () => {
    let received: { userId: string; requestId: string; action: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          respondToRequest: async (userId, requestId, action) => {
            received = { userId, requestId, action };
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
    expect(received).toEqual({
      userId: testUser.id,
      requestId: '00000000-0000-4000-8000-000000000011',
      action: 'accept'
    });
    await app.close();
  });

  it('returns 404 when responding to a request that is not pending for this account', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          respondToRequest: async () => {
            throw new FriendRequestNotFoundError();
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
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('FRIEND_REQUEST_NOT_FOUND');
    await app.close();
  });
});

describe('friends list API', () => {
  it('returns the accepted friends list', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({ getFriends: async () => [friend] })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/friends',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([friend]);
    await app.close();
  });

  it('removes a friend', async () => {
    let received: { userId: string; friendUserId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        friendsRepository: fakeFriendsRepository({
          removeFriend: async (userId, friendUserId) => {
            received = { userId, friendUserId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/me/friends/${friend.id}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ userId: testUser.id, friendUserId: friend.id });
    await app.close();
  });
});
