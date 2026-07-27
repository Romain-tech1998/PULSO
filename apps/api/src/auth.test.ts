import type { User } from '@pulso/contracts';
import type { AuthRepository, FavoritesRepository, GoogleProfile } from '@pulso/database';
import type { EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

const event: EventRepository = {
  findInBounds: async () => [],
  findWithinDirectDistance: async () => [],
  findById: async () => undefined,
  findExternalDestination: async () => undefined,
  findVenuesWithoutUpcomingEvents: async () => [],
  findByIds: async () => []
};

const google = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  callbackUri: 'http://localhost:3001/auth/google/callback',
  appCallbackUrl: 'http://localhost:3000/auth/callback'
};

const user: User = {
  id: '00000000-0000-4000-8000-000000000009',
  email: 'test@example.com',
  displayName: 'Test User'
};

function fakeAuthRepository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    upsertUserFromGoogle: async (_profile: GoogleProfile) => user,
    createSession: async () => ({ token: 'valid-token', expiresAt: new Date() }),
    findUserBySessionToken: async (token: string) =>
      token === 'valid-token' ? user : undefined,
    deleteSession: async () => undefined,
    ...overrides
  };
}

function fakeFavoritesRepository(
  overrides: Partial<FavoritesRepository> = {}
): FavoritesRepository {
  return {
    getFavoriteEventIds: async () => [],
    setFavoriteEventIds: async (_userId, eventIds) => eventIds,
    getFavoriteVenueIds: async () => [],
    setFavoriteVenueIds: async (_userId, venueIds) => venueIds,
    ...overrides
  };
}

describe('account authentication API', () => {
  it('does not register auth routes when Google credentials are absent', async () => {
    const app = buildApp(event);
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects /me without a bearer token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google });
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
    await app.close();
  });

  it('rejects /me with an unknown or expired token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google });
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not-a-real-token' }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the account for a valid bearer token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google });
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(user);
    await app.close();
  });

  it('starts the Google OAuth flow with a redirect', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google });
    const response = await app.inject({ method: 'GET', url: '/auth/google' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('accounts.google.com');
    await app.close();
  });

  it('deletes the session on logout, regardless of whether it existed', async () => {
    let deletedToken: string | undefined;
    const app = buildApp(event, {
      authRepository: fakeAuthRepository({
        deleteSession: async (token: string) => {
          deletedToken = token;
        }
      }),
      favoritesRepository: fakeFavoritesRepository(),
      google
    });
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
    const app = buildApp(event, { authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google });
    const response = await app.inject({ method: 'OPTIONS', url: '/me' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    await app.close();
  });
});

describe('account favorites API', () => {
  it('rejects favorites routes without a bearer token', async () => {
    const app = buildApp(event, {
      authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository(),
      google
    });
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
    const app = buildApp(event, {
      authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository({
        getFavoriteEventIds: async () => ['00000000-0000-4000-8000-000000000001']
      }),
      google
    });
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
    const app = buildApp(event, {
      authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository({
        setFavoriteEventIds: async (userId, eventIds) => {
          setUserId = userId;
          setIds = eventIds;
          return eventIds;
        }
      }),
      google
    });
    const response = await app.inject({
      method: 'PUT',
      url: '/me/favorites',
      headers: { authorization: 'Bearer valid-token' },
      payload: { eventIds: ['00000000-0000-4000-8000-000000000001'] }
    });
    expect(response.statusCode).toBe(200);
    expect(setUserId).toBe(user.id);
    expect(setIds).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(response.json().data.eventIds).toEqual([
      '00000000-0000-4000-8000-000000000001'
    ]);
    await app.close();
  });

  it('handles favorite venues the same way as favorite events', async () => {
    const app = buildApp(event, {
      authRepository: fakeAuthRepository(),
      favoritesRepository: fakeFavoritesRepository({
        getFavoriteVenueIds: async () => ['00000000-0000-4000-8000-000000000003']
      }),
      google
    });
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
});
