import type { PublicUser, User } from '@pulso/contracts';
import type {
  AttendanceRepository,
  AuthRepository,
  FavoritesRepository,
  ForumPost,
  ForumRepository,
  FriendRequest,
  FriendsRepository,
  GoogleProfile,
  Message,
  MessagesRepository,
  ReportsRepository,
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

export function fakeAttendanceRepository(
  overrides: Partial<AttendanceRepository> = {}
): AttendanceRepository {
  return {
    setAttendance: async () => undefined,
    clearAttendance: async () => undefined,
    getMyAttendance: async () => [],
    getFriendsAttending: async () => [],
    ...overrides
  };
}

export function fakeForumRepository(overrides: Partial<ForumRepository> = {}): ForumRepository {
  return {
    getPosts: async () => [],
    createPost: async (eventId, authorId, category, body, parentId) => ({
      id: '00000000-0000-4000-8000-000000000012',
      eventId,
      author: { id: authorId, displayName: testUser.displayName },
      category,
      body,
      createdAt: '2026-01-01T00:00:00.000Z',
      parentId,
      likeCount: 0,
      likedByMe: false,
      replyCount: 0
    }),
    deletePost: async () => undefined,
    likePost: async () => undefined,
    unlikePost: async () => undefined,
    ...overrides
  };
}

export function fakeForumPost(overrides: Partial<ForumPost> = {}): ForumPost {
  return {
    id: '00000000-0000-4000-8000-000000000013',
    eventId: '00000000-0000-4000-8000-000000000014',
    author: friend,
    category: 'general',
    body: 'Quelqu\'un vient à cet event ?',
    createdAt: '2026-01-01T00:00:00.000Z',
    parentId: undefined,
    likeCount: 0,
    likedByMe: false,
    replyCount: 0,
    ...overrides
  };
}

export function fakeMessagesRepository(
  overrides: Partial<MessagesRepository> = {}
): MessagesRepository {
  return {
    sendMessage: async (senderId, recipientId, body) => ({
      id: '00000000-0000-4000-8000-000000000015',
      senderId,
      recipientId,
      body,
      createdAt: '2026-01-01T00:00:00.000Z',
      readAt: undefined
    }),
    getConversation: async () => [],
    markConversationRead: async () => undefined,
    getUnreadCount: async () => 0,
    ...overrides
  };
}

export function fakeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: '00000000-0000-4000-8000-000000000016',
    senderId: friend.id,
    recipientId: testUser.id,
    body: 'On se retrouve devant à 21h ?',
    createdAt: '2026-01-01T00:00:00.000Z',
    readAt: undefined,
    ...overrides
  };
}

export function fakeReportsRepository(
  overrides: Partial<ReportsRepository> = {}
): ReportsRepository {
  return {
    createReport: async () => undefined,
    ...overrides
  };
}

// Bundles all account-layer repositories (+ Google config) so every
// buildApp(event, accountRepositories()) call in tests stays a one-liner
// even as the account layer grows more repositories - override only the
// one(s) a given test actually cares about.
export function accountRepositories(
  overrides: {
    authRepository?: AuthRepository;
    favoritesRepository?: FavoritesRepository;
    trendsRepository?: TrendsRepository;
    friendsRepository?: FriendsRepository;
    attendanceRepository?: AttendanceRepository;
    forumRepository?: ForumRepository;
    messagesRepository?: MessagesRepository;
    reportsRepository?: ReportsRepository;
  } = {}
) {
  return {
    authRepository: overrides.authRepository ?? fakeAuthRepository(),
    favoritesRepository: overrides.favoritesRepository ?? fakeFavoritesRepository(),
    trendsRepository: overrides.trendsRepository ?? fakeTrendsRepository(),
    friendsRepository: overrides.friendsRepository ?? fakeFriendsRepository(),
    attendanceRepository: overrides.attendanceRepository ?? fakeAttendanceRepository(),
    forumRepository: overrides.forumRepository ?? fakeForumRepository(),
    messagesRepository: overrides.messagesRepository ?? fakeMessagesRepository(),
    reportsRepository: overrides.reportsRepository ?? fakeReportsRepository(),
    google: testGoogleConfig
  };
}
