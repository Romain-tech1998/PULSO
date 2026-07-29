import {
  createGroupPostRequestSchema,
  createGroupRequestSchema,
  groupPostResponseSchema,
  groupPostsResponseSchema,
  groupResponseSchema,
  groupsResponseSchema
} from '@pulso/contracts';
import type { AuthRepository, EventRepository, GroupsRepository } from '@pulso/database';
import { EventNotFoundError, GroupNotFoundError, NotGroupMemberError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const groupParamsSchema = z.object({ id: z.uuid() });
const postParamsSchema = z.object({ postId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });

/**
 * Registers groups (DEC-0013). Only called when the account layer is
 * active (see app.ts). Membership is open (join/leave freely, no
 * invitation or approval step); reading or posting in a group's feed
 * requires membership, same account-only UGC posture as the event forum.
 */
export function registerGroupsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  groupsRepository: GroupsRepository,
  eventRepository: EventRepository
) {
  app.post('/me/groups', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { name, description } = createGroupRequestSchema.parse(request.body);
    const group = await groupsRepository.createGroup(user.id, name, description);
    return reply.status(201).send(groupResponseSchema.parse({ data: group }));
  });

  app.get('/me/groups', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const groups = await groupsRepository.listMyGroups(user.id);
    return groupsResponseSchema.parse({ data: groups });
  });

  app.get('/groups/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const group = await groupsRepository.getGroup(id, user.id);
    if (!group) {
      return reply.status(404).send({
        error: { code: 'GROUP_NOT_FOUND', message: 'This group does not exist.' }
      });
    }
    return groupResponseSchema.parse({ data: group });
  });

  app.post('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      await groupsRepository.joinGroup(id, user.id);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply.status(404).send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    await groupsRepository.leaveGroup(id, user.id);
    return reply.status(204).send();
  });

  app.get('/groups/:id/posts', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const posts = await groupsRepository.getPosts(id, user.id);
      return groupPostsResponseSchema.parse({ data: posts });
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply.status(404).send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({ error: { code: 'NOT_GROUP_MEMBER', message: error.message } });
      }
      throw error;
    }
  });

  app.post('/groups/:id/posts', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { body, parentId } = createGroupPostRequestSchema.parse(request.body);
    try {
      const post = await groupsRepository.createPost(id, user.id, body, parentId);
      return reply.status(201).send(groupPostResponseSchema.parse({ data: post }));
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply.status(404).send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({ error: { code: 'NOT_GROUP_MEMBER', message: error.message } });
      }
      throw error;
    }
  });

  app.delete('/groups/:groupId/posts/:postId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    await groupsRepository.deletePost(postId, user.id);
    return reply.status(204).send();
  });

  app.post('/groups/:groupId/posts/:postId/like', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    try {
      await groupsRepository.likePost(postId, user.id);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply.status(404).send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/groups/:groupId/posts/:postId/like', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { postId } = postParamsSchema.parse(request.params);
    await groupsRepository.unlikePost(postId, user.id);
    return reply.status(204).send();
  });

  // "Rencontrer avant l'événement" (Phase 4.8) - reuses Groups (DEC-0013)
  // rather than a new meetup-point concept: find-or-create so everyone
  // clicking this for the same event lands in the same group instead of
  // each spawning their own.
  app.post('/events/:eventId/meetup-group', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const event = await eventRepository.findById(eventId);
    if (!event) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'This event does not exist.' }
      });
    }
    try {
      const group = await groupsRepository.findOrCreateEventGroup(eventId, event.title, user.id);
      return groupResponseSchema.parse({ data: group });
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({
          error: { code: 'EVENT_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
  });
}
