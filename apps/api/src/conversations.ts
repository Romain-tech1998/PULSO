import {
  addParticipantRequestSchema,
  conversationFlagRequestSchema,
  conversationRoomsResponseSchema,
  conversationSearchQuerySchema,
  conversationSearchResponseSchema,
  createConversationRequestSchema,
  roomMessageResponseSchema,
  roomMessagesResponseSchema,
  sendRoomMessageRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  ConversationMessage,
  ConversationsRepository,
  NotificationsRepository
} from '@pulso/database';
import {
  ConversationFullError,
  ConversationNotFoundError,
  ParticipantNotReachableError
} from '@pulso/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import type { ImageModerationProvider } from './image-moderation.js';
import { savePhotoUpload, STILL_IMAGE_MIME_TYPES } from './photo-upload.js';

const conversationParamsSchema = z.object({ id: z.uuid() });

/**
 * DEC-0025. Rooms.
 *
 * Served under /me/rooms rather than /me/conversations, which DEC-0012's
 * one-to-one inbox still answers on. The document's own word for the thing
 * is a room, so this is the name it keeps once the pair routes retire - not
 * a prefix invented to dodge a collision.
 *
 * Three of the errors below are the document's rules, and they are answered
 * with three different codes on purpose: a caller told "full" can wait for
 * somebody to leave, a caller told "not reachable" has to make a friend
 * first, and a caller told "not found" is being told nothing at all - §3's
 * refusal must not double as a way to discover which rooms exist.
 */
function replyConversationError(reply: FastifyReply, error: unknown) {
  if (error instanceof ConversationNotFoundError) {
    return reply.status(404).send({
      error: { code: 'CONVERSATION_NOT_FOUND', message: error.message }
    });
  }
  if (error instanceof ParticipantNotReachableError) {
    return reply.status(403).send({
      error: { code: 'PARTICIPANT_NOT_REACHABLE', message: error.message }
    });
  }
  if (error instanceof ConversationFullError) {
    return reply.status(409).send({
      error: { code: 'CONVERSATION_FULL', message: error.message }
    });
  }
  throw error;
}

export function registerConversationsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  conversations: ConversationsRepository,
  uploadDir: string,
  publicUploadUrl: string,
  notifications?: NotificationsRepository,
  imageModeration?: ImageModerationProvider
) {
  /**
   * An attachment is a URL by the time a client sees it; the repository holds
   * the path. Kept in one place so no route can accidentally hand out a raw
   * disk path.
   */
  const withUrls = (message: ConversationMessage) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      url: `${publicUploadUrl}/${attachment.filePath}`,
      mimeType: attachment.mimeType,
      byteSize: attachment.byteSize
    }))
  });

  app.get('/me/rooms', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const rooms = await conversations.listConversations(user.id);
    return conversationRoomsResponseSchema.parse({
      data: rooms.map((room) => ({
        ...room,
        lastMessage: room.lastMessage ? withUrls(room.lastMessage) : undefined
      }))
    });
  });

  app.post('/me/rooms', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const body = createConversationRequestSchema.parse(request.body);
    try {
      const id = await conversations.createConversation(
        user.id,
        body.participantIds,
        body.title
      );
      return reply.status(201).send({ data: { id } });
    } catch (error) {
      return replyConversationError(reply, error);
    }
  });

  app.get('/me/rooms/search', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { q } = conversationSearchQuerySchema.parse(request.query);
    const hits = await conversations.search(user.id, q);
    return conversationSearchResponseSchema.parse({
      data: hits.map((hit) => ({
        conversationId: hit.conversationId,
        message: withUrls(hit.message)
      }))
    });
  });

  app.get('/me/rooms/:id/messages', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    try {
      const messages = await conversations.getMessages(id, user.id);
      return roomMessagesResponseSchema.parse({
        data: messages.map(withUrls)
      });
    } catch (error) {
      return replyConversationError(reply, error);
    }
  });

  app.post('/me/rooms/:id/messages', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    const body = sendRoomMessageRequestSchema.parse(request.body);
    if (body.body.trim().length === 0) {
      return reply.status(400).send({
        error: { code: 'EMPTY_MESSAGE', message: 'A message needs words.' }
      });
    }
    try {
      const message = await conversations.sendMessage(id, user.id, body.body);
      // DEC-0025 §8. The repository decides who is owed a notification and
      // records that decision in the same statement, so a burst of messages
      // produces one notification per reader rather than one per message.
      if (notifications) {
        const owed = await conversations.participantsToNotify(id, user.id);
        for (const recipient of owed) {
          await notifications.notifyMessageReceived(recipient, user.id);
        }
      }
      return reply
        .status(201)
        .send(roomMessageResponseSchema.parse({ data: withUrls(message) }));
    } catch (error) {
      return replyConversationError(reply, error);
    }
  });

  /**
   * DEC-0025 §9 and DEC-0021. An attachment is screened before it is stored,
   * and a message carries it only once it has passed - so nothing in the
   * store is unscreened, and there is no state for "waiting".
   *
   * The file is written first and unlinked if the send is refused, the same
   * order every other upload in this API uses.
   */
  app.post('/me/rooms/:id/attachments', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);

    const upload = await savePhotoUpload(
      await request.file(),
      reply,
      uploadDir,
      `message-attachments/${id}`,
      STILL_IMAGE_MIME_TYPES,
      { provider: imageModeration }
    );
    if (!upload.ok) return upload.reply;

    try {
      const message = await conversations.sendMessage(id, user.id, '', [
        {
          filePath: upload.filePath,
          mimeType: upload.mimeType,
          byteSize: upload.byteSize
        }
      ]);
      if (notifications) {
        const owed = await conversations.participantsToNotify(id, user.id);
        for (const recipient of owed) {
          await notifications.notifyMessageReceived(recipient, user.id);
        }
      }
      return reply
        .status(201)
        .send(roomMessageResponseSchema.parse({ data: withUrls(message) }));
    } catch (error) {
      // Not a participant, or the room filled: the file has no message to
      // belong to, so it does not stay on disk.
      await unlink(join(uploadDir, upload.filePath)).catch(() => {});
      return replyConversationError(reply, error);
    }
  });

  app.post('/me/rooms/:id/read', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    await conversations.markRead(id, user.id);
    return reply.status(204).send();
  });

  app.put('/me/rooms/:id/muted', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    const { value } = conversationFlagRequestSchema.parse(request.body);
    await conversations.setMuted(id, user.id, value);
    return reply.status(204).send();
  });

  app.put('/me/rooms/:id/pinned', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    const { value } = conversationFlagRequestSchema.parse(request.body);
    await conversations.setPinned(id, user.id, value);
    return reply.status(204).send();
  });

  app.post('/me/rooms/:id/participants', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    const { userId } = addParticipantRequestSchema.parse(request.body);
    try {
      await conversations.addParticipant(id, user.id, userId);
      return reply.status(204).send();
    } catch (error) {
      return replyConversationError(reply, error);
    }
  });

  // §4: anyone may leave, nobody may be ejected - so the only id this route
  // accepts is the caller's own, and it does not take one at all.
  app.delete('/me/rooms/:id/participants', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = conversationParamsSchema.parse(request.params);
    await conversations.leaveConversation(id, user.id);
    return reply.status(204).send();
  });
}
