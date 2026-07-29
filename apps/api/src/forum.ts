import {
  activeForumsResponseSchema,
  discoverForumsResponseSchema,
  createForumPostRequestSchema,
  forumCategorySchema,
  forumMembersResponseSchema,
  forumPostResponseSchema,
  forumPostsResponseSchema
} from '@pulso/contracts';
import type {
  AttendanceRepository,
  AuthRepository,
  EventRepository,
  FavoritesRepository,
  ForumRepository
} from '@pulso/database';
import { EventNotFoundError, ForumPostNotFoundError } from '@pulso/database';
import {
  createFilteredDiscoveryWindow,
  EVENT_CATEGORIES,
  getMontrealCalendarDate
} from '@pulso/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const categoryParamsSchema = z.object({ eventId: z.uuid(), category: forumCategorySchema });
const postParamsSchema = z.object({ postId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });
const discoverQuerySchema = z.object({
  category: z.enum(EVENT_CATEGORIES).optional(),
  sort: z.enum(['recent', 'popular']).optional().default('recent')
});

// Broad Montréal-wide bounds (same city-wide default used on the web side's
// initial map load) - the discovery grid isn't map-viewport-driven, it just
// needs "every upcoming event in the one city Pulso covers today."
const MONTREAL_WIDE_BOUNDS = { west: -73.75, south: 45.4, east: -73.4, north: 45.7 };
const DISCOVER_WINDOW_DAYS = 45;
const DISCOVER_LIMIT = 30;

/**
 * Registers the per-event forum. Only called when the account layer is
 * active (see app.ts). Unlike /events/:id/friends-attending, reading the
 * forum also requires a signed-in account (DEC-0012): user-generated
 * content has no trust framework comparable to sourced event data
 * (DATA-0001), so it isn't mixed into anonymous browsing.
 */
export function registerForumRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  forumRepository: ForumRepository,
  favoritesRepository: FavoritesRepository,
  attendanceRepository: AttendanceRepository,
  eventRepository: EventRepository
) {
  app.get('/events/:eventId/forum/:category', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId, category } = categoryParamsSchema.parse(request.params);
    const posts = await forumRepository.getPosts(eventId, category, user.id);
    return forumPostsResponseSchema.parse({ data: posts });
  });

  app.post('/events/:eventId/forum/:category', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId, category } = categoryParamsSchema.parse(request.params);
    const { body, parentId } = createForumPostRequestSchema.parse(request.body);
    try {
      const post = await forumRepository.createPost(eventId, user.id, category, body, parentId);
      return reply.status(201).send(forumPostResponseSchema.parse({ data: post }));
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({
          error: { code: 'EVENT_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
  });

  app.delete('/events/:eventId/forum/posts/:postId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    await forumRepository.deletePost(postId, user.id);
    return reply.status(204).send();
  });

  app.post('/events/:eventId/forum/posts/:postId/like', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    try {
      await forumRepository.likePost(postId, user.id);
    } catch (error) {
      if (error instanceof ForumPostNotFoundError) {
        return reply.status(404).send({
          error: { code: 'FORUM_POST_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/events/:eventId/forum/posts/:postId/like', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    await forumRepository.unlikePost(postId, user.id);
    return reply.status(204).send();
  });

  // Dashboard "Forums actifs" widget: scoped to the caller's own
  // favorited/attended events, never a public/global feed of every forum.
  app.get('/me/forums/active', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const [favoriteEventIds, attendance] = await Promise.all([
      favoritesRepository.getFavoriteEventIds(user.id),
      attendanceRepository.getMyAttendance(user.id)
    ]);
    const eventIds = Array.from(
      new Set([...favoriteEventIds, ...attendance.map((entry) => entry.eventId)])
    );
    const activity = await forumRepository.getRecentActivityForEvents(eventIds);
    const events = await eventRepository.findByIds(activity.map((entry) => entry.eventId));
    const eventTitleById = new Map(events.map((event) => [event.id, event.title]));
    const data = activity
      .filter((entry) => eventTitleById.has(entry.eventId))
      .map((entry) => ({ ...entry, eventTitle: eventTitleById.get(entry.eventId)! }));
    return activeForumsResponseSchema.parse({ data });
  });

  // Distinct authors across an event's forum (Phase 4.8's "Membres" tab) -
  // real, derived from actual posts, never a membership list (no join
  // concept exists, DEC-0012 unchanged).
  app.get('/events/:eventId/forum/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const members = await forumRepository.getForumMembers(eventId);
    return forumMembersResponseSchema.parse({ data: members });
  });

  // Forums discovery grid (Phase 4.8) - every upcoming event is a forum
  // entry point, not just the caller's own favorited/attended ones (that
  // narrower scope is what /me/forums/active above is for). Still behind
  // the account gate like the rest of the forum (DEC-0012), even though
  // the underlying events are public data.
  app.get('/me/forums/discover', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { category, sort } = discoverQuerySchema.parse(request.query);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DISCOVER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const events = await eventRepository.findInBounds(
      {
        ...MONTREAL_WIDE_BOUNDS,
        date: 'custom',
        categories: category ? [category] : [],
        price: 'all',
        dateStart: getMontrealCalendarDate(now),
        dateEnd: getMontrealCalendarDate(windowEnd)
      },
      createFilteredDiscoveryWindow(now, {
        date: 'custom',
        customStartDate: getMontrealCalendarDate(now),
        customEndDate: getMontrealCalendarDate(windowEnd)
      })
    );
    const stats = await forumRepository.getForumStatsForEvents(events.map((event) => event.id));
    const entries = events.map((event) => {
      const eventStats = stats.get(event.id);
      return {
        event,
        postCount: eventStats?.postCount ?? 0,
        memberCount: eventStats?.memberCount ?? 0,
        ...(eventStats ? { lastPostAt: eventStats.lastPostAt, lastPostExcerpt: eventStats.lastPostExcerpt } : {})
      };
    });
    const sorted =
      sort === 'popular'
        ? entries.sort((a, b) => b.postCount - a.postCount)
        : entries.sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());
    return discoverForumsResponseSchema.parse({ data: sorted.slice(0, DISCOVER_LIMIT) });
  });
}
