import {
  activityResponseSchema,
  eventEngagementResponseSchema,
  eventIdsQuerySchema,
  friendCodeResponseSchema,
  friendMutualCountsResponseSchema,
  friendProfileResponseSchema,
  friendRequestsResponseSchema,
  friendsAttendingResponseSchema,
  friendsMapResponseSchema,
  friendsResponseSchema,
  friendSuggestionsResponseSchema,
  mutualEventIdsResponseSchema,
  myAttendanceResponseSchema,
  respondFriendRequestSchema,
  sendFriendRequestSchema,
  setAttendanceRequestSchema
} from '@pulso/contracts';
import type {
  AttendanceRepository,
  AuthRepository,
  FriendsRepository,
  ProfileRepository
} from '@pulso/database';
import {
  CannotFriendSelfError,
  EventNotFoundError,
  FriendCodeNotFoundError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const requestParamsSchema = z.object({ id: z.uuid() });
const friendParamsSchema = z.object({ friendUserId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });
const mutualCountsQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).min(1).max(100))
});
const suggestionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10)
});
const friendActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

/**
 * Registers the friends and participation-visibility surface of the
 * account layer. Only called when the account layer itself is active (see
 * app.ts) - like every other /me route, this simply doesn't exist when
 * Google credentials aren't configured.
 */
export function registerSocialRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  friendsRepository: FriendsRepository,
  attendanceRepository: AttendanceRepository,
  profileRepository: ProfileRepository
) {
  app.get('/me/friend-code', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const friendCode = await friendsRepository.getFriendCode(user.id);
    return friendCodeResponseSchema.parse({ data: { friendCode } });
  });

  app.post('/me/friends/requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = sendFriendRequestSchema.parse(request.body);
    try {
      await friendsRepository.sendRequest(user.id, body.friendCode);
    } catch (error) {
      if (error instanceof FriendCodeNotFoundError) {
        return reply.status(404).send({
          error: { code: 'FRIEND_CODE_NOT_FOUND', message: error.message }
        });
      }
      if (error instanceof CannotFriendSelfError) {
        return reply.status(400).send({
          error: { code: 'CANNOT_FRIEND_SELF', message: error.message }
        });
      }
      if (error instanceof FriendshipAlreadyExistsError) {
        return reply.status(409).send({
          error: { code: 'FRIENDSHIP_ALREADY_EXISTS', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  // One-click add from "Suggestions pour toi" (Phase 4.15) - a suggestion
  // only ever exposes a real user id, never a friend_code.
  app.post('/me/friends/:friendUserId/request', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    try {
      await friendsRepository.sendRequestToUser(user.id, friendUserId);
    } catch (error) {
      if (error instanceof CannotFriendSelfError) {
        return reply.status(400).send({
          error: { code: 'CANNOT_FRIEND_SELF', message: error.message }
        });
      }
      if (error instanceof FriendshipAlreadyExistsError) {
        return reply.status(409).send({
          error: { code: 'FRIENDSHIP_ALREADY_EXISTS', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.get('/me/friends/requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const requests = await friendsRepository.getPendingRequests(user.id);
    return friendRequestsResponseSchema.parse({ data: requests });
  });

  app.put('/me/friends/requests/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = requestParamsSchema.parse(request.params);
    const { action } = respondFriendRequestSchema.parse(request.body);
    try {
      await friendsRepository.respondToRequest(user.id, id, action);
    } catch (error) {
      if (error instanceof FriendRequestNotFoundError) {
        return reply.status(404).send({
          error: { code: 'FRIEND_REQUEST_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.get('/me/friends', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const friends = await friendsRepository.getFriends(user.id);
    return friendsResponseSchema.parse({ data: friends });
  });

  app.delete('/me/friends/:friendUserId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    await friendsRepository.removeFriend(user.id, friendUserId);
    return reply.status(204).send();
  });

  // Real, batched "N amis en commun" (Phase 4.15) - shown next to friends,
  // requests, and suggestions alike.
  app.get('/me/friends/mutual-counts', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { ids } = mutualCountsQuerySchema.parse(request.query);
    const counts = await friendsRepository.getMutualFriendCounts(user.id, ids);
    return friendMutualCountsResponseSchema.parse({
      data: ids.map((userId) => ({
        userId,
        mutualFriendCount: counts.get(userId) ?? 0
      }))
    });
  });

  // "Suggestions pour toi" (Phase 4.15) - friends-of-friends, ranked by real
  // mutual-friend count, never collaborative filtering.
  app.get('/me/friends/suggestions', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { limit } = suggestionsQuerySchema.parse(request.query);
    const suggestions = await friendsRepository.getSuggestions(user.id, limit);
    return friendSuggestionsResponseSchema.parse({ data: suggestions });
  });

  // A friend's public profile (Phase 4.15) - real bio/createdAt, only ever
  // for an accepted friend.
  app.get('/me/friends/:friendUserId/profile', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    const profile = await friendsRepository.getFriendProfile(
      user.id,
      friendUserId
    );
    if (!profile) {
      return reply.status(404).send({
        error: {
          code: 'FRIEND_NOT_FOUND',
          message: 'This account is not one of your accepted friends.'
        }
      });
    }
    return friendProfileResponseSchema.parse({ data: profile });
  });

  // A friend's activity feed (Phase 4.15) - only real, friends-visible
  // attendance entries (see ProfileRepository.getFriendActivity's own
  // comment on why favorites/group-joins are never included here).
  app.get('/me/friends/:friendUserId/activity', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    const { limit } = friendActivityQuerySchema.parse(request.query);
    if (!(await friendsRepository.isFriend(user.id, friendUserId))) {
      return reply.status(404).send({
        error: {
          code: 'FRIEND_NOT_FOUND',
          message: 'This account is not one of your accepted friends.'
        }
      });
    }
    const activity = await profileRepository.getFriendActivity(
      friendUserId,
      limit
    );
    return activityResponseSchema.parse({ data: activity });
  });

  // "Événements en commun" (Phase 4.15) - real event ids both accounts
  // attend, respecting the friend's own visibility choice.
  app.get('/me/friends/:friendUserId/mutual-events', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    if (!(await friendsRepository.isFriend(user.id, friendUserId))) {
      return reply.status(404).send({
        error: {
          code: 'FRIEND_NOT_FOUND',
          message: 'This account is not one of your accepted friends.'
        }
      });
    }
    const eventIds = await attendanceRepository.getMutualEventIds(
      user.id,
      friendUserId
    );
    return mutualEventIdsResponseSchema.parse({ data: eventIds });
  });

  // "Amis sur la carte" (Phase 4.15) - real upcoming, friends-visible
  // attendance across every accepted friend, never a live position.
  app.get('/me/friends/map', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const entries = await attendanceRepository.getFriendsUpcomingAttendance(
      user.id
    );
    return friendsMapResponseSchema.parse({ data: entries });
  });

  app.put('/me/attendance/:eventId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const { visibility } = setAttendanceRequestSchema.parse(request.body);
    try {
      await attendanceRepository.setAttendance(user.id, eventId, visibility);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({
          error: { code: 'EVENT_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/me/attendance/:eventId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    await attendanceRepository.clearAttendance(user.id, eventId);
    return reply.status(204).send();
  });

  app.get('/me/attendance', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const attendance = await attendanceRepository.getMyAttendance(user.id);
    return myAttendanceResponseSchema.parse({ data: attendance });
  });

  // Registered under the account guard rather than the public /events
  // routes (it doesn't exist at all unless Google is configured, like the
  // rest of this file) - but unlike every other route here, an anonymous
  // caller gets an empty list rather than 401. This is an enrichment for
  // Event Details, not an account action; there's no meaningful "friends
  // attending" for a viewer with no session, but that's not an error case
  // worth interrupting the page over.
  app.get('/events/:eventId/friends-attending', async (request) => {
    const user = await resolveBearerUser(request, authRepository);
    const { eventId } = eventParamsSchema.parse(request.params);
    const friends = user
      ? await attendanceRepository.getFriendsAttending(user.id, eventId)
      : [];
    return friendsAttendingResponseSchema.parse({ data: friends });
  });

  // Batched version of the route above (Phase 4.11's Événements page grid)
  // - same "empty rather than 401 for an anonymous caller" rule, since this
  // is a page enrichment, not an account action. Real attendee counts are
  // returned regardless of sign-in state; friendsAttending is only ever
  // populated for a signed-in viewer.
  app.get('/events/engagement', async (request) => {
    const user = await resolveBearerUser(request, authRepository);
    const { ids } = eventIdsQuerySchema.parse(request.query);
    const [counts, friendsByEvent] = await Promise.all([
      attendanceRepository.getAttendanceCountsForEvents(ids),
      user
        ? attendanceRepository.getFriendsAttendingForEvents(user.id, ids)
        : Promise.resolve(new Map<string, never[]>())
    ]);
    return eventEngagementResponseSchema.parse({
      data: ids.map((eventId) => ({
        eventId,
        attendeeCount: counts.get(eventId) ?? 0,
        friendsAttending: friendsByEvent.get(eventId) ?? []
      }))
    });
  });
}
