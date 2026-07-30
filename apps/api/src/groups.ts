import {
  createGroupChecklistItemRequestSchema,
  createGroupPostRequestSchema,
  createGroupRequestSchema,
  createGroupScheduleItemRequestSchema,
  discoverGroupsResponseSchema,
  groupAttendanceSummarySchema,
  groupChecklistItemsResponseSchema,
  groupJoinRequestsResponseSchema,
  groupPostResponseSchema,
  groupPostsResponseSchema,
  groupResponseSchema,
  groupScheduleItemsResponseSchema,
  groupsResponseSchema,
  joinGroupResponseSchema,
  respondGroupJoinRequestSchema,
  setGroupAttendanceRequestSchema,
  setGroupChecklistCheckRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  EventRepository,
  GroupsRepository
} from '@pulso/database';
import {
  EventNotFoundError,
  GroupNotFoundError,
  NotGroupMemberError,
  NotGroupModeratorError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const groupParamsSchema = z.object({ id: z.uuid() });
const postParamsSchema = z.object({ postId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });
const joinRequestParamsSchema = z.object({ id: z.uuid(), userId: z.uuid() });
const scheduleItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
const checklistItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
const discoverQuerySchema = z.object({
  scope: z.enum(['permanent', 'event'])
});

/**
 * Registers groups (DEC-0013, extended by v1.2 for Phase 4.10). Only
 * called when the account layer is active (see app.ts). Membership is
 * open by default (join/leave freely) or restricted (join creates a
 * pending request the group's moderator - its creator, and only its
 * creator - must approve). Reading or posting in a group's feed and its
 * modules (schedule, attendance, checklist) requires accepted membership,
 * same account-only UGC posture as the event forum.
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
    const { name, description, visibility } = createGroupRequestSchema.parse(
      request.body
    );
    const group = await groupsRepository.createGroup(
      user.id,
      name,
      description,
      visibility ?? 'open'
    );
    return reply.status(201).send(groupResponseSchema.parse({ data: group }));
  });

  app.get('/me/groups', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const groups = await groupsRepository.listMyGroups(user.id);
    return groupsResponseSchema.parse({ data: groups });
  });

  // "Découvrir" (Phase 4.10) - permanent groups not yet joined, or every
  // event-linked group regardless of membership. Fulfills DEC-0013 v1.1's
  // principle approval of a public group directory.
  app.get('/groups/discover', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { scope } = discoverQuerySchema.parse(request.query);
    const entries = await groupsRepository.discoverGroups(user.id, scope);
    return discoverGroupsResponseSchema.parse({ data: entries });
  });

  app.get('/groups/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const group = await groupsRepository.getGroup(id, user.id);
    if (!group) {
      return reply.status(404).send({
        error: {
          code: 'GROUP_NOT_FOUND',
          message: 'This group does not exist.'
        }
      });
    }
    return groupResponseSchema.parse({ data: group });
  });

  app.post('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const status = await groupsRepository.joinGroup(id, user.id);
      return joinGroupResponseSchema.parse({ status });
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      throw error;
    }
  });

  app.delete('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    await groupsRepository.leaveGroup(id, user.id);
    return reply.status(204).send();
  });

  // Moderator-only (Phase 4.10, DEC-0013 v1.2) - who's waiting to join a
  // restricted group.
  app.get('/groups/:id/join-requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const requests = await groupsRepository.getJoinRequests(id, user.id);
      return groupJoinRequestsResponseSchema.parse({ data: requests });
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupModeratorError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MODERATOR', message: error.message }
        });
      }
      throw error;
    }
  });

  app.put('/groups/:id/join-requests/:userId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id, userId } = joinRequestParamsSchema.parse(request.params);
    const { action } = respondGroupJoinRequestSchema.parse(request.body);
    try {
      await groupsRepository.respondToJoinRequest(id, user.id, userId, action);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupModeratorError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MODERATOR', message: error.message }
        });
      }
      throw error;
    }
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
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MEMBER', message: error.message }
        });
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
      const post = await groupsRepository.createPost(
        id,
        user.id,
        body,
        parentId
      );
      return reply
        .status(201)
        .send(groupPostResponseSchema.parse({ data: post }));
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MEMBER', message: error.message }
        });
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
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
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

  // "Programme" (Phase 4.10) - any member can add/see; only the item's
  // own author can delete it, same author-only pattern as posts.
  app.get('/groups/:id/schedule', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const items = await groupsRepository.getScheduleItems(id);
    return groupScheduleItemsResponseSchema.parse({ data: items });
  });

  app.post('/groups/:id/schedule', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { label, scheduledAt } = createGroupScheduleItemRequestSchema.parse(
      request.body
    );
    try {
      await groupsRepository.addScheduleItem(id, user.id, label, scheduledAt);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MEMBER', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.delete('/groups/:id/schedule/:itemId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { itemId } = scheduleItemParamsSchema.parse(request.params);
    await groupsRepository.deleteScheduleItem(itemId, user.id);
    return reply.status(204).send();
  });

  // "Qui vient ?" (Phase 4.10) - real votes from real members only.
  app.get('/groups/:id/attendance', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const summary = await groupsRepository.getAttendanceSummary(id, user.id);
    return groupAttendanceSummarySchema.parse(summary);
  });

  app.put('/groups/:id/attendance', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { response } = setGroupAttendanceRequestSchema.parse(request.body);
    try {
      await groupsRepository.setAttendanceResponse(id, user.id, response);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MEMBER', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  // "Checklist" (Phase 4.10) - checkedCount/totalMembers is real: how many
  // of the group's real members personally checked an item off.
  app.get('/groups/:id/checklist', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const items = await groupsRepository.getChecklistItems(id, user.id);
    return groupChecklistItemsResponseSchema.parse({ data: items });
  });

  app.post('/groups/:id/checklist', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { label } = createGroupChecklistItemRequestSchema.parse(request.body);
    try {
      await groupsRepository.addChecklistItem(id, user.id, label);
    } catch (error) {
      if (error instanceof GroupNotFoundError) {
        return reply
          .status(404)
          .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
      }
      if (error instanceof NotGroupMemberError) {
        return reply.status(403).send({
          error: { code: 'NOT_GROUP_MEMBER', message: error.message }
        });
      }
      throw error;
    }
    return reply.status(204).send();
  });

  app.put('/groups/:id/checklist/:itemId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { itemId } = checklistItemParamsSchema.parse(request.params);
    const { checked } = setGroupChecklistCheckRequestSchema.parse(request.body);
    await groupsRepository.toggleChecklistCheck(itemId, user.id, checked);
    return reply.status(204).send();
  });

  app.delete('/groups/:id/checklist/:itemId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { itemId } = checklistItemParamsSchema.parse(request.params);
    await groupsRepository.deleteChecklistItem(itemId, user.id);
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
        error: {
          code: 'EVENT_NOT_FOUND',
          message: 'This event does not exist.'
        }
      });
    }
    try {
      const group = await groupsRepository.findOrCreateEventGroup(
        eventId,
        event.title,
        user.id
      );
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
