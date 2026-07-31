import type { PublicUser, User } from '@pulso/contracts';
import type {
  AttendanceRepository,
  AuthRepository,
  EventPhoto,
  EventPhotosRepository,
  FavoritesRepository,
  ForumPost,
  ForumRepository,
  FriendRequest,
  FriendsRepository,
  GoogleProfile,
  Group,
  GroupPost,
  GroupsRepository,
  Message,
  MessagesRepository,
  ProfileRepository,
  ReportsRepository,
  Trends,
  TrendsRepository
} from '@pulso/database';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GoogleAuthConfig } from './auth.js';

export const testUser: User = {
  id: '00000000-0000-4000-8000-000000000009',
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: '2024-01-01T00:00:00.000Z'
};

export const testGoogleConfig: GoogleAuthConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  callbackUri: 'http://localhost:3001/auth/google/callback',
  appCallbackUrl: 'http://localhost:3000/auth/callback'
};

export function fakeAuthRepository(
  overrides: Partial<AuthRepository> = {}
): AuthRepository {
  return {
    upsertUserFromGoogle: async (_profile: GoogleProfile) => testUser,
    createSession: async () => ({
      token: 'valid-token',
      expiresAt: new Date()
    }),
    findUserBySessionToken: async (token: string) =>
      token === 'valid-token' ? testUser : undefined,
    deleteSession: async () => undefined,
    updateProfile: async () => testUser,
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
    getFavoriteCountsForVenues: async () => new Map(),
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
    isFriend: async () => true,
    getMutualFriendCounts: async () => new Map(),
    getSuggestions: async () => [],
    getFriendProfile: async () => undefined,
    sendRequestToUser: async () => undefined,
    ...overrides
  };
}

export const friend: PublicUser = {
  id: '00000000-0000-4000-8000-000000000010',
  displayName: 'Friend User'
};

export function fakeFriendRequest(
  overrides: Partial<FriendRequest> = {}
): FriendRequest {
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
    getAttendanceCountsForEvents: async () => new Map(),
    getFriendsAttendingForEvents: async () => new Map(),
    getMutualEventIds: async () => [],
    getFriendsUpcomingAttendance: async () => [],
    ...overrides
  };
}

export function fakeForumRepository(
  overrides: Partial<ForumRepository> = {}
): ForumRepository {
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
    getRecentActivityForEvents: async () => [],
    getForumStatsForEvents: async () => new Map(),
    getForumMembers: async () => [],
    getPostedEventIds: async () => [],
    followForum: async () => undefined,
    unfollowForum: async () => undefined,
    isFollowingForum: async () => false,
    getFollowedEventIds: async () => [],
    ...overrides
  };
}

export function fakeForumPost(overrides: Partial<ForumPost> = {}): ForumPost {
  return {
    id: '00000000-0000-4000-8000-000000000013',
    eventId: '00000000-0000-4000-8000-000000000014',
    author: friend,
    category: 'general',
    body: "Quelqu'un vient à cet event ?",
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
    getConversations: async () => [],
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

export function fakeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: '00000000-0000-4000-8000-000000000017',
    name: 'Groupe test',
    description: undefined,
    createdBy: testUser.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    memberCount: 1,
    isMember: true,
    eventId: undefined,
    visibility: 'open',
    isModerator: true,
    myStatus: 'member',
    pendingRequestCount: undefined,
    pinned: false,
    ...overrides
  };
}

export function fakeGroupPost(overrides: Partial<GroupPost> = {}): GroupPost {
  return {
    id: '00000000-0000-4000-8000-000000000018',
    groupId: '00000000-0000-4000-8000-000000000017',
    author: friend,
    body: "Quelqu'un a un plan pour ce soir ?",
    createdAt: '2026-01-01T00:00:00.000Z',
    parentId: undefined,
    likeCount: 0,
    likedByMe: false,
    replyCount: 0,
    ...overrides
  };
}

export function fakeGroupsRepository(
  overrides: Partial<GroupsRepository> = {}
): GroupsRepository {
  return {
    createGroup: async (creatorId, name, description, visibility) =>
      fakeGroup({ createdBy: creatorId, name, description, visibility }),
    listMyGroups: async () => [],
    getGroup: async () => fakeGroup(),
    joinGroup: async () => 'member',
    leaveGroup: async () => undefined,
    setGroupPinned: async () => undefined,
    getMembers: async () => [],
    getJoinRequests: async () => [],
    respondToJoinRequest: async () => undefined,
    discoverGroups: async () => [],
    getPosts: async () => [],
    createPost: async (groupId, authorId, body, parentId) =>
      fakeGroupPost({
        groupId,
        author: { id: authorId, displayName: testUser.displayName },
        body,
        parentId
      }),
    deletePost: async () => undefined,
    likePost: async () => undefined,
    unlikePost: async () => undefined,
    findOrCreateEventGroup: async (eventId, eventTitle, userId) =>
      fakeGroup({
        eventId,
        name: `Rencontre – ${eventTitle}`,
        createdBy: userId
      }),
    getScheduleItems: async () => [],
    addScheduleItem: async () => undefined,
    deleteScheduleItem: async () => undefined,
    getAttendanceSummary: async () => ({
      yes: 0,
      maybe: 0,
      no: 0,
      myResponse: undefined
    }),
    setAttendanceResponse: async () => undefined,
    getChecklistItems: async () => [],
    addChecklistItem: async () => undefined,
    toggleChecklistCheck: async () => undefined,
    deleteChecklistItem: async () => undefined,
    ...overrides
  };
}

export function fakeProfileRepository(
  overrides: Partial<ProfileRepository> = {}
): ProfileRepository {
  return {
    getStats: async () => ({
      eventsAttended: 0,
      venuesDiscovered: 0,
      groupsJoined: 0,
      favoritesCount: 0
    }),
    getRecentActivity: async () => [],
    getFriendActivity: async () => [],
    ...overrides
  };
}

export function fakeEventPhoto(
  overrides: Partial<EventPhoto> = {}
): EventPhoto {
  return {
    id: '00000000-0000-4000-8000-000000000019',
    eventId: '00000000-0000-4000-8000-000000000014',
    uploader: friend,
    filePath: 'event-photos/00000000-0000-4000-8000-000000000014/photo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

export function fakeEventPhotosRepository(
  overrides: Partial<EventPhotosRepository> = {}
): EventPhotosRepository {
  return {
    listPhotos: async () => [],
    createPhoto: async (eventId, uploaderId, filePath) =>
      fakeEventPhoto({
        eventId,
        uploader: { id: uploaderId, displayName: testUser.displayName },
        filePath
      }),
    deletePhoto: async () => undefined,
    ...overrides
  };
}

// Isolated from any real upload directory the dev server might be using -
// a fresh temp folder per test process, safe to leave behind (OS temp dir).
export const testUploadDir = join(tmpdir(), 'pulso-test-uploads');
export const testPublicUploadUrl = 'http://127.0.0.1:3001/uploads';

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
    groupsRepository?: GroupsRepository;
    profileRepository?: ProfileRepository;
    eventPhotosRepository?: EventPhotosRepository;
    uploadDir?: string;
    publicUploadUrl?: string;
  } = {}
) {
  return {
    authRepository: overrides.authRepository ?? fakeAuthRepository(),
    favoritesRepository:
      overrides.favoritesRepository ?? fakeFavoritesRepository(),
    trendsRepository: overrides.trendsRepository ?? fakeTrendsRepository(),
    friendsRepository: overrides.friendsRepository ?? fakeFriendsRepository(),
    attendanceRepository:
      overrides.attendanceRepository ?? fakeAttendanceRepository(),
    forumRepository: overrides.forumRepository ?? fakeForumRepository(),
    messagesRepository:
      overrides.messagesRepository ?? fakeMessagesRepository(),
    reportsRepository: overrides.reportsRepository ?? fakeReportsRepository(),
    groupsRepository: overrides.groupsRepository ?? fakeGroupsRepository(),
    profileRepository: overrides.profileRepository ?? fakeProfileRepository(),
    eventPhotosRepository:
      overrides.eventPhotosRepository ?? fakeEventPhotosRepository(),
    uploadDir: overrides.uploadDir ?? testUploadDir,
    publicUploadUrl: overrides.publicUploadUrl ?? testPublicUploadUrl,
    google: testGoogleConfig
  };
}
