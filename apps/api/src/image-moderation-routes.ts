import {
  imageModerationQueueResponseSchema,
  reportImageRequestSchema,
  resolveImageModerationRequestSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  ImageModerationRepository,
  OrganizerRepository
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import {
  resolveBearerUser,
  sendForbidden,
  sendUnauthenticated
} from './auth.js';

const idParamsSchema = z.object({ id: z.uuid() });

/**
 * The moderation queue and the report that feeds it (DEC-0021).
 *
 * The administration half is gated on the same `organizerRepository.isAdmin`
 * check every other /admin route uses (DEC-0018) rather than a second
 * mechanism, and the check runs here on the server - a route being absent
 * from an interface has never been a protection.
 */
export function registerImageModerationRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  imageModerationRepository: ImageModerationRepository,
  organizerRepository: OrganizerRepository,
  uploadDir: string,
  publicUploadUrl: string
) {
  app.get('/admin/image-moderation', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const entries = await imageModerationRepository.queue();
    return imageModerationQueueResponseSchema.parse({
      data: entries.map((entry) => ({
        id: entry.id,
        // The console is the one place a not-yet-published image is
        // visible, which is the whole point of it being here.
        url: `${publicUploadUrl}/${entry.filePath}`,
        surface: entry.surface,
        status: entry.status,
        moderatedAt: entry.moderatedAt,
        reportCount: entry.reportCount,
        reportReasons: entry.reportReasons,
        ...(entry.ownerDisplayName
          ? { ownerDisplayName: entry.ownerDisplayName }
          : {}),
        ...(entry.provider ? { provider: entry.provider } : {}),
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.scores ? { scores: entry.scores } : {})
      }))
    });
  });

  app.post('/admin/image-moderation/:id', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!(await organizerRepository.isAdmin(user.id))) {
      return sendForbidden(reply);
    }
    const { id } = idParamsSchema.parse(request.params);
    const { decision } = resolveImageModerationRequestSchema.parse(
      request.body
    );

    const record = await imageModerationRepository.decide(
      id,
      user.id,
      decision
    );
    if (!record) {
      return reply.status(404).send({
        error: {
          code: 'IMAGE_MODERATION_NOT_FOUND',
          message: 'No image awaiting a decision under this identifier.'
        }
      });
    }

    // Removing means the file goes too. The row stays: it is the record
    // that this image existed and was refused, which a deleted row would
    // erase along with the evidence.
    if (decision === 'rejected') {
      await unlink(join(uploadDir, record.filePath)).catch(() => {});
    }
    return reply.status(204).send();
  });

  // Anyone signed in can report a published image. One report is not a
  // verdict: this raises it into the queue and removes nothing.
  app.post('/images/:id/report', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { id } = idParamsSchema.parse(request.params);
    const { reason } = reportImageRequestSchema.parse(request.body ?? {});
    await imageModerationRepository.report(id, user.id, reason);
    // 204 whether or not the report was new. Telling a reporter that they
    // had already reported this image says nothing useful and invites
    // probing at what other accounts have reported.
    return reply.status(204).send();
  });
}
