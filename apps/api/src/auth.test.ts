import type { User } from '@pulso/contracts';
import type { AuthRepository, GoogleProfile } from '@pulso/database';
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

describe('account authentication API', () => {
  it('does not register auth routes when Google credentials are absent', async () => {
    const app = buildApp(event);
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects /me without a bearer token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(), google });
    const response = await app.inject({ method: 'GET', url: '/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
    await app.close();
  });

  it('rejects /me with an unknown or expired token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(), google });
    const response = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer not-a-real-token' }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns the account for a valid bearer token', async () => {
    const app = buildApp(event, { authRepository: fakeAuthRepository(), google });
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
    const app = buildApp(event, { authRepository: fakeAuthRepository(), google });
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
    const app = buildApp(event, { authRepository: fakeAuthRepository(), google });
    const response = await app.inject({ method: 'OPTIONS', url: '/me' });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-headers']).toContain('authorization');
    await app.close();
  });
});
