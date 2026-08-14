import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeAuthRepository,
  fakeFavoritesRepository,
  fakeTrendsRepository,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

describe('account authentication API', () => {
  it('does not register auth routes when Google credentials are absent', async () => {
    const app = buildApp(event);
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects /me without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
    await app.close();
  });

  it('rejects /me with an unknown or expired token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not-a-real-token' }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the account for a valid bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(testUser);
    await app.close();
  });

  it('starts the Google OAuth flow with a redirect', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    await app.close();
  });

  it('deletes the session on logout, regardless of whether it existed', async () => {
    let deletedToken: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        authRepository: fakeAuthRepository({
          deleteSession: async (token: string) => {
            deletedToken = token;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(deletedToken).toBe('valid-token');
    await app.close();
  });

  it('includes authorization in the CORS preflight for any route', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'OPTIONS', url: '/me' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain(
      'authorization'
    );
    await app.close();
  });
});

describe('account favorites API', () => {
  it('rejects favorites routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const getEvents = await app.inject({ method: 'GET', url: '/me/favorites' });
    const putEvents = await app.inject({
      method: 'PUT',
      url: '/me/favorites',
      payload: { eventIds: [] }
    });
    expect(getEvents.statusCode).toBe(401);
    expect(putEvents.statusCode).toBe(401);
    await app.close();
  });

  it('returns the stored favorite event ids', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        favoritesRepository: fakeFavoritesRepository({
          getFavoriteEventIds: async () => [
            '00000000-0000-4000-8000-000000000001'
          ]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/favorites',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      eventIds: ['00000000-0000-4000-8000-000000000001']
    });
    await app.close();
  });

  it('replaces the stored favorite event ids on PUT, so un-favoriting works', async () => {
    let setUserId: string | undefined;
    let setIds: string[] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        favoritesRepository: fakeFavoritesRepository({
          setFavoriteEventIds: async (userId, eventIds) => {
            setUserId = userId;
            setIds = eventIds;
            return eventIds;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/favorites',
      headers: { authorization: 'Bearer valid-token' },
      payload: { eventIds: ['00000000-0000-4000-8000-000000000001'] }
    });
    expect(response.statusCode).toBe(200);
    expect(setUserId).toBe(testUser.id);
    expect(setIds).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(response.json().data.eventIds).toEqual([
      '00000000-0000-4000-8000-000000000001'
    ]);
    await app.close();
  });

  it('handles favorite venues the same way as favorite events', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        favoritesRepository: fakeFavoritesRepository({
          getFavoriteVenueIds: async () => [
            '00000000-0000-4000-8000-000000000003'
          ]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/favorite-venues',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      venueIds: ['00000000-0000-4000-8000-000000000003']
    });
    await app.close();
  });

  it('returns real batched favorite counts for venues, no auth required', async () => {
    const venueId = '00000000-0000-4000-8000-000000000004';
    const otherVenueId = '00000000-0000-4000-8000-000000000005';
    const app = buildApp(
      event,
      accountRepositories({
        favoritesRepository: fakeFavoritesRepository({
          getFavoriteCountsForVenues: async () => new Map([[venueId, 7]])
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/venues/favorite-counts?ids=${venueId},${otherVenueId}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { venueId, favoriteCount: 7 },
      { venueId: otherVenueId, favoriteCount: 0 }
    ]);
    await app.close();
  });
});

describe('account trends API', () => {
  it('rejects /me/trends without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({ method: 'GET', url: '/me/trends' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the real aggregated category counts from favorites', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        trendsRepository: fakeTrendsRepository({
          eventCategories: [{ category: 'music', count: 3 }],
          venueCategories: [{ category: 'bar', count: 1 }]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/trends',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      eventCategories: [{ category: 'music', count: 3 }],
      venueCategories: [{ category: 'bar', count: 1 }]
    });
    await app.close();
  });
});
