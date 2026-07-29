import {
  activityResponseSchema,
  meResponseSchema,
  profileStatsResponseSchema,
  updateProfileRequestSchema
} from '@pulso/contracts';
import type { AuthRepository, ProfileRepository } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

/**
 * Registers the profile page's own routes (Phase 4.7) - editing the
 * user-authored profile fields (bio/coverStyle) and reading the real,
 * derived stats/activity feed that back the Stats card and the Activité
 * tab. Only called when the account layer is active (see app.ts), same as
 * every other account-scoped route group.
 */
export function registerProfileRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  profileRepository: ProfileRepository
) {
  app.put('/me/profile', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const update = updateProfileRequestSchema.parse(request.body);
    const updated = await authRepository.updateProfile(user.id, update);
    return meResponseSchema.parse({ data: updated });
  });

  app.get('/me/profile-stats', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const stats = await profileRepository.getStats(user.id);
    return profileStatsResponseSchema.parse({ data: stats });
  });

  app.get('/me/activity', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { limit } = activityQuerySchema.parse(request.query);
    const activity = await profileRepository.getRecentActivity(user.id, limit);
    return activityResponseSchema.parse({ data: activity });
  });
}
