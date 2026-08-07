import {
  conversationResponseSchema,
  conversationsResponseSchema,
  messageResponseSchema,
  sendMessageRequestSchema,
  unreadCountResponseSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  MessagesRepository,
  NotificationsRepository
} from '@pulso/database';
import { NotFriendsError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const friendParamsSchema = z.object({ friendUserId: z.uuid() });

/**
 * Registers direct messaging between friends. Only called when the
 * account layer is active (see app.ts). Messaging is restricted to
 * accepted friendships (enforced in MessagesRepository.sendMessage, not
 * here) - closed context is the abuse guard, not a separate blocklist.
 */
export function registerMessagesRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  messagesRepository: MessagesRepository,
  notificationsRepository: NotificationsRepository
) {
  app.post('/me/friends/:friendUserId/messages', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    const { body } = sendMessageRequestSchema.parse(request.body);
    try {
      const message = await messagesRepository.sendMessage(
        user.id,
        friendUserId,
        body
      );
      // Recipient only, never the sender (DEC-0016 acceptance criterion 4).
      await notificationsRepository.notifyMessageReceived(
        friendUserId,
        user.id
      );
      return reply
        .status(201)
        .send(messageResponseSchema.parse({ data: message }));
    } catch (error) {
      if (error instanceof NotFriendsError) {
        return reply.status(403).send({
          error: { code: 'NOT_FRIENDS', message: error.message }
        });
      }
      throw error;
    }
  });

  app.get('/me/friends/:friendUserId/messages', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    const messages = await messagesRepository.getConversation(
      user.id,
      friendUserId
    );
    return conversationResponseSchema.parse({ data: messages });
  });

  app.put('/me/friends/:friendUserId/messages/read', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    await messagesRepository.markConversationRead(user.id, friendUserId);
    return reply.status(204).send();
  });

  app.get('/me/messages/unread-count', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const count = await messagesRepository.getUnreadCount(user.id);
    return unreadCountResponseSchema.parse({ data: { count } });
  });

  app.get('/me/conversations', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const conversations = await messagesRepository.getConversations(user.id);
    return conversationsResponseSchema.parse({ data: conversations });
  });
}
