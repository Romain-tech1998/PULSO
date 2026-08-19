import type { PaymentProvider } from './payments.js';
import type { WalletPassProvider } from './wallet.js';
import type { ImageModerationProvider } from './image-moderation.js';
import type { PublicUser, User } from '@pulso/contracts';
import { defaultModulesForGroupType } from '@pulso/domain';
import type {
  AttendanceRepository,
  AuthRepository,
  EventPhoto,
  EventAccessRepository,
  TicketingRepository,
  EventPhotosRepository,
  UserPhotosRepository,
  ImageModerationRepository,
  EventRepository,
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
  NotificationsRepository,
  OrganizerRepository,
  ProfileRepository,
  RatingsRepository,
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

// Every account-layer test previously declared its own inline
// EventRepository stub; they all drifted apart whenever the interface grew.
export function fakeEventRepository(
  overrides: Partial<EventRepository> = {}
): EventRepository {
  return {
    findInBounds: async () => [],
    findWithinDirectDistance: async () => [],
    findById: async () => undefined,
    findExternalDestination: async () => undefined,
    findVenuesWithoutUpcomingEvents: async () => [],
    searchEvents: async () => [],
    searchVenues: async () => [],
    // False by default so no test silently exercises the live-lookup path:
    // a test that wants it opts in, which keeps the network-shaped branch
    // visible in the tests that actually cover it.
    shouldLookUpVenue: async () => false,
    saveLookedUpVenues: async () => [],
    listVenuePhotos: async () => [],
    suppressVenuePhoto: async () => false,
    restoreVenuePhoto: async () => false,
    findByIds: async () => [],
    createEvent: async () => {
      throw new Error('createEvent is not stubbed in this test.');
    },
    updateCreatedEvent: async () => undefined,
    deleteCreatedEvent: async () => false,
    listCreatedEvents: async () => [],
    setCreatedEventPinned: async () => false,
    setCreatedEventImage: async () => false,
    ...overrides
  };
}

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
    setProfilePhoto: async (_userId, photoUrl) => ({
      user: { ...testUser, photoUrl },
      previousPath: undefined
    }),
    clearProfilePhoto: async () => ({
      user: testUser,
      previousPath: undefined
    }),
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
    sendRequest: async () => friend.id,
    getPendingRequests: async () => [],
    respondToRequest: async () => friend.id,
    getFriends: async () => [],
    removeFriend: async () => undefined,
    isFriend: async () => true,
    getMutualFriendCounts: async () => new Map(),
    getSuggestions: async () => [],
    getFriendProfile: async () => undefined,
    sendRequestToUser: async (_requesterId, addresseeId) => addresseeId,
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
    getPublicAttendees: async () => [],
    getMostAttendedEventIds: async () => [],
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
    getForumFollowerIds: async () => [],
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
    getMessageRequests: async () => [],
    respondToMessageRequest: async () => true,
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

export function fakeRatingsRepository(
  overrides: Partial<RatingsRepository> = {}
): RatingsRepository {
  return {
    setRating: async () => undefined,
    clearRating: async () => undefined,
    getMyRating: async () => undefined,
    getAverageRatingsForVenues: async () => new Map(),
    ...overrides
  };
}

export function fakeNotificationsRepository(
  overrides: Partial<NotificationsRepository> = {}
): NotificationsRepository {
  return {
    list: async () => [],
    countUnread: async () => 0,
    markAllRead: async () => undefined,
    markRead: async () => undefined,
    notifyGroupVerificationReceived: async () => undefined,
    notifyGroupVerificationResolved: async () => undefined,
    notifyGroupJoinRequestReceived: async () => undefined,
    notifyGroupJoinRequestAccepted: async () => undefined,
    notifyFriendRequestReceived: async () => undefined,
    notifyFriendRequestAccepted: async () => undefined,
    notifyEventAccessRequested: async () => undefined,
    notifyEventAccessResolved: async () => undefined,
    notifyMessageReceived: async () => undefined,
    notifyForumReply: async () => undefined,
    notifyVenueFollowersOfNewEvent: async () => 0,
    notifyOrganizerRequestReceived: async () => undefined,
    notifyOrganizerRequestResolved: async () => undefined,
    ...overrides
  };
}

export function fakeOrganizerRepository(
  overrides: Partial<OrganizerRepository> = {}
): OrganizerRepository {
  return {
    getStatus: async () => ({
      isAdmin: false,
      verifiedVenues: [],
      pendingRequests: []
    }),
    createRequest: async () => {
      throw new Error('createRequest is not stubbed in this test.');
    },
    listPendingRequests: async () => [],
    resolveRequest: async () => undefined,
    listAdminUserIds: async () => [],
    isAdmin: async () => false,
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
    type: 'community',
    modulesConfig: defaultModulesForGroupType('community'),
    visibility: 'open',
    isModerator: true,
    myStatus: 'member',
    pendingRequestCount: undefined,
    pinned: false,
    verificationStatus: 'none',
    ...overrides
  };
}

export function fakeGroupPost(overrides: Partial<GroupPost> = {}): GroupPost {
  return {
    id: '00000000-0000-4000-8000-000000000018',
    groupId: '00000000-0000-4000-8000-000000000017',
    channelId: '00000000-0000-4000-8000-000000000031',
    kind: 'message',
    outingId: undefined,
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
    // DEC-0015 added `type` before `visibility` and `modulesConfig` after it.
    // The old stub still took four positional arguments, so it silently bound
    // the new `type` to `visibility` - which is what broke the groups suite.
    createGroup: async (
      creatorId,
      name,
      description,
      type,
      visibility,
      modulesConfig
    ) =>
      fakeGroup({
        createdBy: creatorId,
        name,
        description,
        type,
        visibility,
        modulesConfig
      }),
    updateGroupModules: async () => undefined,
    listMyGroups: async () => [],
    getGroup: async () => fakeGroup(),
    joinGroup: async () => 'member',
    leaveGroup: async () => undefined,
    setGroupPinned: async () => undefined,
    getMembers: async () => [],
    getJoinRequests: async () => [],
    respondToJoinRequest: async () => undefined,
    discoverGroups: async () => [],
    createPlacement: async () => undefined,
    listGroupPlacements: async () => [],
    dismissPlacement: async () => undefined,
    listAllPlacements: async () => [],
    searchGroups: async () => [],
    getCurrentOuting: async () => undefined,
    listOutings: async () => [],
    startOuting: async (groupId, _userId, input) => ({
      id: '00000000-0000-4000-8000-000000000032',
      groupId,
      eventId: input.eventId,
      title: input.title,
      startsAt: input.startsAt,
      place: input.place,
      createdAt: '2026-01-01T00:00:00.000Z',
      archivedAt: undefined
    }),
    listChannels: async () => [],
    createChannel: async (groupId, _userId, name, staffOnly) => ({
      id: '00000000-0000-4000-8000-000000000031',
      groupId,
      name,
      position: 0,
      staffOnly,
      postCount: 0
    }),
    deleteChannel: async () => undefined,
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
    setGroupPhoto: async () => undefined,
    clearGroupPhoto: async () => undefined,
    requestVerification: async () => undefined,
    listPendingVerifications: async () => [],
    resolveVerification: async () => undefined,
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

export function fakeEventAccessRepository(
  overrides: Partial<EventAccessRepository> = {}
): EventAccessRepository {
  return {
    findOrganizerId: async () => undefined,
    request: async () => 'pending',
    list: async () => [],
    resolve: async () => false,
    countPendingForOrganizer: async () => 0,
    ...overrides
  };
}

export function fakeTicketingRepository(
  overrides: Partial<TicketingRepository> = {}
): TicketingRepository {
  return {
    listTicketTypes: async () => [],
    createTicketType: async () => {
      throw new Error('not stubbed');
    },
    deleteTicketType: async () => false,
    issueTickets: async () => [],
    listMyTickets: async () => [],
    findTicketById: async () => undefined,
    redeem: async () => ({ result: 'unknown' }),
    isEventOrganizer: async () => false,
    countAdmissions: async () => ({ used: 0, valid: 0 }),
    findStripeAccount: async () => undefined,
    saveStripeAccount: async () => undefined,
    updateStripeStatus: async () => undefined,
    startPaidOrder: async () => {
      throw new Error('not stubbed');
    },
    attachCheckoutSession: async () => undefined,
    completePaidOrder: async () => [],
    releaseOrder: async () => false,
    recordWebhookEvent: async () => true,
    findOrderForRefund: async () => undefined,
    markOrderRefunded: async () => undefined,
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

export function fakeUserPhotosRepository(
  overrides: Partial<UserPhotosRepository> = {}
): UserPhotosRepository {
  return {
    listPhotos: async () => [],
    createPhoto: async (_ownerId, filePath, input) => ({
      id: '00000000-0000-4000-8000-0000000000f0',
      filePath,
      caption: input.caption,
      eventId: input.eventId,
      venueId: input.venueId,
      createdAt: new Date('2026-08-13T12:00:00.000Z').toISOString()
    }),
    deletePhoto: async () => undefined,
    ...overrides
  };
}

/**
 * A provider that reports whatever scores a test hands it, defaulting to
 * clean ones. Without it every upload would come back flagged - which is
 * the correct production default (DEC-0021 §3) but would block every test
 * that merely happens to upload something.
 */
export function fakeImageModerationProvider(
  scores: Record<string, number> = { sexual: 0.001, violence: 0.001 }
): ImageModerationProvider {
  return { name: 'fake', moderate: async () => scores };
}

/**
 * DEC-0021. Approves everything by default, so a test that is not about
 * moderation is not silently blocked by it; a test that is about moderation
 * overrides the one method it cares about.
 */
export function fakeImageModerationRepository(
  overrides: Partial<ImageModerationRepository> = {}
): ImageModerationRepository {
  return {
    record: async (input) => ({
      id: '00000000-0000-4000-8000-0000000000e0',
      filePath: input.filePath,
      surface: input.surface,
      ownerId: input.ownerId,
      status: input.status,
      provider: input.provider,
      scores: input.scores,
      reason: input.reason,
      moderatedAt: new Date('2026-08-14T12:00:00.000Z').toISOString(),
      decidedAt: undefined
    }),
    approvedPaths: async (paths) => new Set(paths),
    findByPath: async () => undefined,
    queue: async () => [],
    decide: async () => undefined,
    report: async () => true,
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
    eventAccessRepository?: EventAccessRepository;
    ticketingRepository?: TicketingRepository;
    paymentProvider?: PaymentProvider;
    walletProvider?: WalletPassProvider;
    eventPhotosRepository?: EventPhotosRepository;
    userPhotosRepository?: UserPhotosRepository;
    imageModerationRepository?: ImageModerationRepository;
    imageModerationProvider?: ImageModerationProvider;
    ratingsRepository?: RatingsRepository;
    notificationsRepository?: NotificationsRepository;
    organizerRepository?: OrganizerRepository;
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
    eventAccessRepository:
      overrides.eventAccessRepository ?? fakeEventAccessRepository(),
    ticketingRepository:
      overrides.ticketingRepository ?? fakeTicketingRepository(),
    ...(overrides.paymentProvider
      ? { paymentProvider: overrides.paymentProvider }
      : {}),
    ...(overrides.walletProvider
      ? { walletProvider: overrides.walletProvider }
      : {}),
    eventPhotosRepository:
      overrides.eventPhotosRepository ?? fakeEventPhotosRepository(),
    userPhotosRepository:
      overrides.userPhotosRepository ?? fakeUserPhotosRepository(),
    imageModerationRepository:
      overrides.imageModerationRepository ?? fakeImageModerationRepository(),
    imageModerationProvider:
      overrides.imageModerationProvider ?? fakeImageModerationProvider(),
    ratingsRepository: overrides.ratingsRepository ?? fakeRatingsRepository(),
    notificationsRepository:
      overrides.notificationsRepository ?? fakeNotificationsRepository(),
    organizerRepository:
      overrides.organizerRepository ?? fakeOrganizerRepository(),
    uploadDir: overrides.uploadDir ?? testUploadDir,
    publicUploadUrl: overrides.publicUploadUrl ?? testPublicUploadUrl,
    google: testGoogleConfig
  };
}
