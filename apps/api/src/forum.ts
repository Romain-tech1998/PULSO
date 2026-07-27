import {
  createForumPostRequestSchema,
  forumCategorySchema,
  forumPostResponseSchema,
  forumPostsResponseSchema
} from '@pulso/contracts';
import type { AuthRepository, ForumRepository } from '@pulso/database';
import { EventNotFoundError, ForumPostNotFoundError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const categoryParamsSchema = z.object({ eventId: z.uuid(), category: forumCategorySchema });
const postParamsSchema = z.object({ postId: z.uuid() });

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
  forumRepository: ForumRepository
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
}
