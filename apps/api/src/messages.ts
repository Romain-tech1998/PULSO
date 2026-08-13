import {
  conversationResponseSchema,
  conversationsResponseSchema,
  messageRequestsResponseSchema,
  messageResponseSchema,
  respondToMessageRequestSchema,
  sendMessageRequestSchema,
  unreadCountResponseSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  MessagesRepository,
  NotificationsRepository
} from '@pulso/database';
import {
  MessageRequestDeclinedError,
  MessageRequestPendingError,
  NotFriendsError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const friendParamsSchema = z.object({ friendUserId: z.uuid() });

/**
 * Registers direct messaging. Only called when the account layer is active
 * (see app.ts).
 *
 * DEC-0020 opened this up: any account may write to any other, but a first
 * message to a non-friend opens a request and is the only one allowed until
 * the recipient answers. All of that is decided in
 * MessagesRepository.sendMessage rather than here, so the limit holds for
 * every caller; this module only maps the resulting errors onto statuses.
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
      // DEC-0020 adds a second condition: a message that only exists
      // because it opened a request notifies nobody, or "anyone may write
      // to anyone" would become "anyone may ring anyone's bell". The
      // request appears in the Demandes list and nowhere else until it is
      // accepted.
      const pendingRequests =
        await messagesRepository.getMessageRequests(friendUserId);
      const behindAGate = pendingRequests.some(
        (entry) => entry.sender.id === user.id
      );
      if (!behindAGate) {
        await notificationsRepository.notifyMessageReceived(
          friendUserId,
          user.id
        );
      }
      return reply
        .status(201)
        .send(messageResponseSchema.parse({ data: message }));
    } catch (error) {
      if (error instanceof NotFriendsError) {
        return reply.status(403).send({
          error: { code: 'NOT_FRIENDS', message: error.message }
        });
      }
      // 429 rather than 403: the sender is not forbidden from talking to
      // this account, they have used their one message and have to wait.
      if (error instanceof MessageRequestPendingError) {
        return reply.status(429).send({
          error: { code: 'MESSAGE_REQUEST_PENDING', message: error.message }
        });
      }
      if (error instanceof MessageRequestDeclinedError) {
        return reply.status(403).send({
          error: { code: 'MESSAGE_REQUEST_DECLINED', message: error.message }
        });
      }
      throw error;
    }
  });

  // DEC-0020 - the Demandes list, and answering one.
  app.get('/me/message-requests', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const requests = await messagesRepository.getMessageRequests(user.id);
    return messageRequestsResponseSchema.parse({ data: requests });
  });

  app.put('/me/message-requests/:friendUserId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { friendUserId } = friendParamsSchema.parse(request.params);
    const { action } = respondToMessageRequestSchema.parse(request.body);
    const answered = await messagesRepository.respondToMessageRequest(
      user.id,
      friendUserId,
      action
    );
    if (!answered) {
      return reply.status(404).send({
        error: {
          code: 'MESSAGE_REQUEST_NOT_FOUND',
          message: 'No pending message request from this account.'
        }
      });
    }
    // Accepting is the moment the conversation becomes real, so it is also
    // the moment the sender's message stops being invisible - see
    // getUnreadCount, which excludes anything still behind a pending
    // request. No notification is sent for the request itself (DEC-0020).
    return reply.status(204).send();
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
