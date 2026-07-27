import {
  friendCodeResponseSchema,
  friendRequestsResponseSchema,
  friendsResponseSchema,
  respondFriendRequestSchema,
  sendFriendRequestSchema
} from '@pulso/contracts';
import type { AuthRepository, FriendsRepository } from '@pulso/database';
import {
  CannotFriendSelfError,
  FriendCodeNotFoundError,
  FriendRequestNotFoundError,
  FriendshipAlreadyExistsError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const requestParamsSchema = z.object({ id: z.uuid() });
const friendParamsSchema = z.object({ friendUserId: z.uuid() });

/**
 * Registers the friends surface of the account layer. Only called when the
 * account layer itself is active (see app.ts) - like every other /me route,
 * this simply doesn't exist when Google credentials aren't configured.
 */
export function registerSocialRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  friendsRepository: FriendsRepository
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
}
