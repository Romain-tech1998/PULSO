import type { EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeAuthRepository,
  fakeProfileRepository,
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

describe('profile API', () => {
  it('rejects profile routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const update = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      payload: { bio: 'Salut' }
    });
    const stats = await app.inject({ method: 'GET', url: '/me/profile-stats' });
    const activity = await app.inject({ method: 'GET', url: '/me/activity' });
    expect(update.statusCode).toBe(401);
    expect(stats.statusCode).toBe(401);
    expect(activity.statusCode).toBe(401);
    await app.close();
  });

  it('updates the bio/coverStyle/avatarStyle and returns the updated user', async () => {
    let received: { userId: string; update: unknown } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        authRepository: fakeAuthRepository({
          updateProfile: async (userId, update) => {
            received = { userId, update };
            return {
              ...testUser,
              bio: update.bio,
              coverStyle: update.coverStyle,
              avatarStyle: update.avatarStyle
            };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        bio: 'Toujours à la recherche de la prochaine bonne vibe',
        coverStyle: 'aurora',
        avatarStyle: 'disco'
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.bio).toBe('Toujours à la recherche de la prochaine bonne vibe');
    expect(response.json().data.avatarStyle).toBe('disco');
    expect(received).toEqual({
      userId: testUser.id,
      update: {
        bio: 'Toujours à la recherche de la prochaine bonne vibe',
        coverStyle: 'aurora',
        avatarStyle: 'disco'
      }
    });
    await app.close();
  });

  it('accepts an empty avatarStyle as the explicit "clear it" signal', async () => {
    let received: { userId: string; update: unknown } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        authRepository: fakeAuthRepository({
          updateProfile: async (userId, update) => {
            received = { userId, update };
            return testUser;
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: { authorization: 'Bearer valid-token' },
      payload: { avatarStyle: '' }
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ userId: testUser.id, update: { avatarStyle: '' } });
    await app.close();
  });

  it('returns the profile stats', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        profileRepository: fakeProfileRepository({
          getStats: async () => ({
            eventsAttended: 12,
            venuesDiscovered: 5,
            groupsJoined: 2,
            favoritesCount: 30
          })
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/profile-stats',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      eventsAttended: 12,
      venuesDiscovered: 5,
      groupsJoined: 2,
      favoritesCount: 30
    });
    await app.close();
  });

  it('returns the recent activity feed', async () => {
    const entry = {
      kind: 'joined_group' as const,
      occurredAt: '2026-01-01T00:00:00.000Z',
      groupId: '00000000-0000-4000-8000-000000000099',
      groupName: 'Techno Montreal'
    };
    const app = buildApp(
      event,
      accountRepositories({
        profileRepository: fakeProfileRepository({ getRecentActivity: async () => [entry] })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/activity',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([entry]);
    await app.close();
  });
});
