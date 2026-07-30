import { createReportRequestSchema } from '@pulso/contracts';
import type { AuthRepository, ReportsRepository } from '@pulso/database';
import type { FastifyInstance } from 'fastify';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';

/**
 * Registers the minimal reporting endpoint (DEC-0012). Only called when
 * the account layer is active (see app.ts). Captures a report only - no
 * moderation queue, no automated action, no review UI exists yet.
 */
export function registerReportsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  reportsRepository: ReportsRepository
) {
  app.post('/reports', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { targetType, targetId, reason } = createReportRequestSchema.parse(
      request.body
    );
    await reportsRepository.createReport(user.id, targetType, targetId, reason);
    return reply.status(204).send();
  });
}
