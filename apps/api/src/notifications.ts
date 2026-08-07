import { notificationsResponseSchema } from '@pulso/contracts';
import type { AuthRepository, NotificationsRepository } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30)
});

const notificationParamsSchema = z.object({ id: z.uuid() });

/**
 * DEC-0016 in-app notifications. Account-scoped like every other /me route:
 * there is no anonymous notification, so an unauthenticated caller gets 401
 * rather than an empty list.
 *
 * No real-time transport by design (DEC-0016 §Scope boundaries) - the client
 * refetches on navigation, matching DEC-0012's existing position on messages.
 */
export function registerNotificationsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  notificationsRepository: NotificationsRepository
) {
  app.get('/me/notifications', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { limit } = listQuerySchema.parse(request.query);
    const [notifications, unreadCount] = await Promise.all([
      notificationsRepository.list(user.id, limit),
      notificationsRepository.countUnread(user.id)
    ]);
    return notificationsResponseSchema.parse({
      data: { notifications, unreadCount }
    });
  });

  app.post('/me/notifications/read', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    await notificationsRepository.markAllRead(user.id);
    return reply.status(204).send();
  });

  // Scoped by user_id in the UPDATE, so passing someone else's notification
  // id is a no-op rather than a cross-account write.
  app.post('/me/notifications/:id/read', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = notificationParamsSchema.parse(request.params);
    await notificationsRepository.markRead(user.id, id);
    return reply.status(204).send();
  });
}
