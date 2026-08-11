import { defaultModulesForGroupType } from '@pulso/domain';
import {
  createGroupChannelRequestSchema,
  createGroupChecklistItemRequestSchema,
  requestGroupVerificationSchema,
  createGroupPostRequestSchema,
  createGroupRequestSchema,
  updateGroupModulesRequestSchema,
  createGroupScheduleItemRequestSchema,
  discoverGroupsResponseSchema,
  groupChannelResponseSchema,
  groupChannelsResponseSchema,
  groupOutingResponseSchema,
  groupOutingsResponseSchema,
  groupSponsoredPlacementsResponseSchema,
  startGroupOutingRequestSchema,
  groupAttendanceSummarySchema,
  groupChecklistItemsResponseSchema,
  groupJoinRequestsResponseSchema,
  groupMembersResponseSchema,
  groupPostResponseSchema,
  groupPostsResponseSchema,
  groupResponseSchema,
  groupScheduleItemsResponseSchema,
  groupsResponseSchema,
  joinGroupResponseSchema,
  respondGroupJoinRequestSchema,
  setGroupAttendanceRequestSchema,
  setGroupChecklistCheckRequestSchema,
  setGroupPinnedRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  EventRepository,
  GroupsRepository,
  NotificationsRepository,
  OrganizerRepository
} from '@pulso/database';
import {
  EventNotFoundError,
  GroupNotFoundError,
  NotChannelWriterError,
  NotGroupMemberError,
  NotGroupModeratorError
} from '@pulso/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

/**
 * Every group route answers these three repository errors identically, so
 * the mapping lives here once instead of being restated per handler.
 */
function replyGroupError(reply: FastifyReply, error: unknown) {
  if (error instanceof GroupNotFoundError) {
    return reply
      .status(404)
      .send({ error: { code: 'GROUP_NOT_FOUND', message: error.message } });
  }
  if (error instanceof NotGroupMemberError) {
    return reply
      .status(403)
      .send({ error: { code: 'NOT_GROUP_MEMBER', message: error.message } });
  }
  if (error instanceof NotGroupModeratorError) {
    return reply.status(403).send({
      error: { code: 'NOT_GROUP_MODERATOR', message: error.message }
    });
  }
  if (error instanceof NotChannelWriterError) {
    return reply.status(403).send({
      error: { code: 'NOT_CHANNEL_WRITER', message: error.message }
    });
  }
  throw error;
}

const groupParamsSchema = z.object({ id: z.uuid() });
const postParamsSchema = z.object({ postId: z.uuid() });
const eventParamsSchema = z.object({ eventId: z.uuid() });
const joinRequestParamsSchema = z.object({ id: z.uuid(), userId: z.uuid() });
const channelParamsSchema = z.object({ id: z.uuid(), channelId: z.uuid() });
const placementParamsSchema = z.object({
  id: z.uuid(),
  placementId: z.uuid()
});
const scheduleItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
const checklistItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() });
const postsQuerySchema = z.object({ channelId: z.uuid().optional() });
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
const ALLOWED_MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export function registerGroupsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  groupsRepository: GroupsRepository,
  eventRepository: EventRepository,
  notificationsRepository: NotificationsRepository,
  // Who the Pulso administrators are is DEC-0018's concern and is answered
  // in exactly one place, so verification requests ask that repository
  // rather than growing a second copy of the same query here.
  organizerRepository: OrganizerRepository,
  uploadDir: string,
  publicUploadUrl: string
) {
  app.post('/me/groups', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { name, description, type, visibility, modulesConfig } =
      createGroupRequestSchema.parse(request.body);
    const group = await groupsRepository.createGroup(
      user.id,
      name,
      description,
      type,
      visibility ?? 'open',
      // DEC-0015: each group type starts from its own template. Passing []
      // created a workspace with no modules at all - not even discussion.
      modulesConfig ?? defaultModulesForGroupType(type)
    );
    return reply.status(201).send(groupResponseSchema.parse({ data: group }));
  });

  app.patch('/groups/:id/modules', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);

    const { id } = groupParamsSchema.parse(request.params);
    const { modulesConfig } = updateGroupModulesRequestSchema.parse(
      request.body
    );
    try {
      // Who may reshape a group's workspace is exactly who may approve its
      // join requests (DEC-0013 v1.2's one moderator power): its creator.
      // This was previously unchecked, so any signed-in account could
      // reconfigure any group.
      await groupsRepository.updateGroupModules(id, modulesConfig, user.id);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    const group = await groupsRepository.getGroup(id, user.id);
    if (!group) return reply.status(404).send();
    return reply.status(200).send(groupResponseSchema.parse({ data: group }));
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
      if (status === 'pending') {
        // The pending queue has existed since Phase 4.10, but nothing ever
        // told the moderator to look at it, so requests sat there unseen.
        const group = await groupsRepository.getGroup(id, user.id);
        if (group) {
          await notificationsRepository.notifyGroupJoinRequestReceived(
            group.createdBy,
            user.id,
            id
          );
        }
      }
      return joinGroupResponseSchema.parse({ status });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.delete('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    await groupsRepository.leaveGroup(id, user.id);
    return reply.status(204).send();
  });

  // Phase 4.14: a member's own choice to show/hide this group in their
  // sidebar shortcut list - a no-op if they're not an accepted member
  // (leaveGroup-style, not an error worth surfacing).
  app.put('/groups/:id/pin', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { pinned } = setGroupPinnedRequestSchema.parse(request.body);
    await groupsRepository.setGroupPinned(id, user.id, pinned);
    return reply.status(204).send();
  });

  app.get('/groups/:id/members', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const members = await groupsRepository.getMembers(id, user.id);
      return groupMembersResponseSchema.parse({ data: members });
    } catch (error) {
      return replyGroupError(reply, error);
    }
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
      return replyGroupError(reply, error);
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
      return replyGroupError(reply, error);
    }
    // Only an acceptance is announced: a refusal stays silent, same as a
    // declined friend request (DEC-0011).
    if (action === 'accept') {
      await notificationsRepository.notifyGroupJoinRequestAccepted(userId, id);
    }
    return reply.status(204).send();
  });

  /**
   * Discussion threads (channels). Any member reads them; only the
   * moderator creates or removes one, and a staff-only channel ("Annonces")
   * is one only the moderator may write in - which is how DEC-0015's
   * announcements module exists without a second content model.
   */
  app.get('/groups/:id/channels', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const channels = await groupsRepository.listChannels(id, user.id);
      return groupChannelsResponseSchema.parse({ data: channels });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.post('/groups/:id/channels', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { name, staffOnly } = createGroupChannelRequestSchema.parse(
      request.body
    );
    try {
      const channel = await groupsRepository.createChannel(
        id,
        user.id,
        name,
        staffOnly ?? false
      );
      return reply
        .status(201)
        .send(groupChannelResponseSchema.parse({ data: channel }));
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.delete('/groups/:id/channels/:channelId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id, channelId } = channelParamsSchema.parse(request.params);
    try {
      await groupsRepository.deleteChannel(id, channelId, user.id);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    return reply.status(204).send();
  });

  /**
   * The paid placements this group should show right now (DEC-0015).
   * Members read them; only the group's moderator can take one down, which
   * is what keeps the community's last word real rather than nominal.
   */
  app.get('/groups/:id/placements', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const placements = await groupsRepository.listGroupPlacements(
        id,
        user.id
      );
      return groupSponsoredPlacementsResponseSchema.parse({
        data: placements
      });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.delete('/groups/:id/placements/:placementId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id, placementId } = placementParamsSchema.parse(request.params);
    try {
      await groupsRepository.dismissPlacement(id, placementId, user.id);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    return reply.status(204).send();
  });

  /**
   * Outings. The modules always describe the current one; the archived ones
   * stay readable so a group keeps its history instead of losing it every
   * time it plans something new.
   */
  app.get('/groups/:id/outings', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const outings = await groupsRepository.listOutings(id, user.id);
      return groupOutingsResponseSchema.parse({ data: outings });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.post('/groups/:id/outings', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const body = startGroupOutingRequestSchema.parse(request.body);
    try {
      const outing = await groupsRepository.startOuting(id, user.id, {
        title: body.title,
        ...(body.eventId ? { eventId: body.eventId } : {}),
        ...(body.startsAt ? { startsAt: body.startsAt } : {})
      });
      return reply
        .status(201)
        .send(groupOutingResponseSchema.parse({ data: outing }));
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.get('/groups/:id/posts', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { channelId } = postsQuerySchema.parse(request.query);
    try {
      const posts = await groupsRepository.getPosts(id, user.id, channelId);
      return groupPostsResponseSchema.parse({ data: posts });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.post('/groups/:id/posts', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { body, parentId, channelId } = createGroupPostRequestSchema.parse(
      request.body
    );
    try {
      const post = await groupsRepository.createPost(
        id,
        user.id,
        body,
        parentId,
        channelId
      );
      return reply
        .status(201)
        .send(groupPostResponseSchema.parse({ data: post }));
    } catch (error) {
      return replyGroupError(reply, error);
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
      return replyGroupError(reply, error);
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
    try {
      const items = await groupsRepository.getScheduleItems(id, user.id);
      return groupScheduleItemsResponseSchema.parse({ data: items });
    } catch (error) {
      return replyGroupError(reply, error);
    }
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
      return replyGroupError(reply, error);
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
    try {
      const summary = await groupsRepository.getAttendanceSummary(id, user.id);
      return groupAttendanceSummarySchema.parse(summary);
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.put('/groups/:id/attendance', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { response } = setGroupAttendanceRequestSchema.parse(request.body);
    try {
      await groupsRepository.setAttendanceResponse(id, user.id, response);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    return reply.status(204).send();
  });

  // "Checklist" (Phase 4.10) - checkedCount/totalMembers is real: how many
  // of the group's real members personally checked an item off.
  app.get('/groups/:id/checklist', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    try {
      const items = await groupsRepository.getChecklistItems(id, user.id);
      return groupChecklistItemsResponseSchema.parse({ data: items });
    } catch (error) {
      return replyGroupError(reply, error);
    }
  });

  app.post('/groups/:id/checklist', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { label } = createGroupChecklistItemRequestSchema.parse(request.body);
    try {
      await groupsRepository.addChecklistItem(id, user.id, label);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    return reply.status(204).send();
  });

  app.put('/groups/:id/checklist/:itemId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { itemId } = checklistItemParamsSchema.parse(request.params);
    const { checked } = setGroupChecklistCheckRequestSchema.parse(request.body);
    try {
      await groupsRepository.toggleChecklistCheck(itemId, user.id, checked);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    return reply.status(204).send();
  });

  app.delete('/groups/:id/checklist/:itemId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { itemId } = checklistItemParamsSchema.parse(request.params);
    await groupsRepository.deleteChecklistItem(itemId, user.id);
    return reply.status(204).send();
  });

  /**
   * The group's photo. Same upload mechanism as event and venue photos
   * (multipart to the API's own disk), moderator-only. Replacing a photo
   * deletes the file it orphans rather than leaving it on disk forever.
   */
  app.post('/groups/:id/photo', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: { code: 'NO_FILE', message: 'No photo was uploaded.' }
      });
    }
    const extension = ALLOWED_MIME_TO_EXTENSION[file.mimetype];
    if (!extension) {
      return reply.status(415).send({
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Only JPEG, PNG, WebP or GIF photos are supported.'
        }
      });
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.status(413).send({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'The photo exceeds the maximum allowed size.'
        }
      });
    }

    const groupDir = join(uploadDir, 'group-photos', id);
    await mkdir(groupDir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(groupDir, filename), buffer);
    const filePath = `group-photos/${id}/${filename}`;

    let previousPath: string | undefined;
    try {
      previousPath = await groupsRepository.setGroupPhoto(
        id,
        user.id,
        `${publicUploadUrl}/${filePath}`,
        filePath
      );
    } catch (error) {
      // The uploaded file is only kept if the write was authorized.
      await unlink(join(uploadDir, filePath)).catch(() => {});
      return replyGroupError(reply, error);
    }
    if (previousPath) {
      await unlink(join(uploadDir, previousPath)).catch(() => {});
    }
    const group = await groupsRepository.getGroup(id, user.id);
    if (!group) return reply.status(404).send();
    return reply.status(200).send(groupResponseSchema.parse({ data: group }));
  });

  app.delete('/groups/:id/photo', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    let removedPath: string | undefined;
    try {
      removedPath = await groupsRepository.clearGroupPhoto(id, user.id);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    if (removedPath) {
      await unlink(join(uploadDir, removedPath)).catch(() => {});
    }
    return reply.status(204).send();
  });

  /**
   * Asks a Pulso administrator to verify this group. Same request/approve
   * shape as DEC-0018's organizer requests, including notifying every
   * administrator - a request nobody is told about is a request nobody
   * answers.
   */
  app.post('/groups/:id/verification-request', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = groupParamsSchema.parse(request.params);
    const { justification } = requestGroupVerificationSchema.parse(
      request.body
    );
    try {
      await groupsRepository.requestVerification(id, user.id, justification);
    } catch (error) {
      return replyGroupError(reply, error);
    }
    await notificationsRepository.notifyGroupVerificationReceived(
      await organizerRepository.listAdminUserIds(),
      user.id,
      id
    );
    const group = await groupsRepository.getGroup(id, user.id);
    if (!group) return reply.status(404).send();
    return reply.status(200).send(groupResponseSchema.parse({ data: group }));
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
