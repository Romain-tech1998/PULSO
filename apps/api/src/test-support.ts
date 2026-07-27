import type { PublicUser, User } from '@pulso/contracts';
import type {
  AuthRepository,
  FavoritesRepository,
  FriendRequest,
  FriendsRepository,
  GoogleProfile,
  Trends,
  TrendsRepository
} from '@pulso/database';

import type { GoogleAuthConfig } from './auth.js';

export const testUser: User = {
  id: '00000000-0000-4000-8000-000000000009',
  email: 'test@example.com',
  displayName: 'Test User'
};

export const testGoogleConfig: GoogleAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  callbackUri: 'http://localhost:3001/auth/google/callback',
  appCallbackUrl: 'http://localhost:3000/auth/callback'
};

export function fakeAuthRepository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    upsertUserFromGoogle: async (_profile: GoogleProfile) => testUser,
    createSession: async () => ({ token: 'valid-token', expiresAt: new Date() }),
    findUserBySessionToken: async (token: string) =>
      token === 'valid-token' ? testUser : undefined,
    deleteSession: async () => undefined,
    ...overrides
  };
}

export function fakeFavoritesRepository(
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

export function fakeTrendsRepository(
  trends: Trends = { eventCategories: [], venueCategories: [] }
): TrendsRepository {
  return { getTrends: async () => trends };
}

export function fakeFriendsRepository(
  overrides: Partial<FriendsRepository> = {}
): FriendsRepository {
  return {
    getFriendCode: async () => 'abcd1234',
    sendRequest: async () => undefined,
    getPendingRequests: async () => [],
    respondToRequest: async () => undefined,
    getFriends: async () => [],
    removeFriend: async () => undefined,
    ...overrides
  };
}

export const friend: PublicUser = {
  id: '00000000-0000-4000-8000-000000000010',
  displayName: 'Friend User'
};

export function fakeFriendRequest(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id: '00000000-0000-4000-8000-000000000011',
    user: friend,
    direction: 'incoming',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

// Bundles all four account-layer repositories (+ Google config) so every
// buildApp(event, accountRepositories()) call in tests stays a one-liner
// even as the account layer grows more repositories - override only the
// one(s) a given test actually cares about.
export function accountRepositories(
  overrides: {
    authRepository?: AuthRepository;
    favoritesRepository?: FavoritesRepository;
    trendsRepository?: TrendsRepository;
    friendsRepository?: FriendsRepository;
  } = {}
) {
  return {
    authRepository: overrides.authRepository ?? fakeAuthRepository(),
    favoritesRepository: overrides.favoritesRepository ?? fakeFavoritesRepository(),
    trendsRepository: overrides.trendsRepository ?? fakeTrendsRepository(),
    friendsRepository: overrides.friendsRepository ?? fakeFriendsRepository(),
    google: testGoogleConfig
  };
}
