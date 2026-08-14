import {
  eventPhotoResponseSchema,
  eventPhotosResponseSchema
} from '@pulso/contracts';
import type { AuthRepository, EventPhotosRepository } from '@pulso/database';
import { EventNotFoundError } from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import { savePhotoUpload } from './photo-upload.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const photoParamsSchema = z.object({ photoId: z.uuid() });

/**
 * Registers the event "Photos" tab (Phase 4.8 follow-up). Real photo
 * uploads, stored on the API's own local disk (uploadDir) rather than a
 * cloud object store - matches the project's current pre-deployment stage
 * (no external storage dependency yet, see DEC-0012 v1.2). Distinct from
 * the forum's text-only posts: DEC-0012's original "no attachments"
 * boundary is unchanged there.
 */
export function registerEventPhotosRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  eventPhotosRepository: EventPhotosRepository,
  uploadDir: string,
  publicUploadUrl: string
) {
  const toUrl = (filePath: string) => `${publicUploadUrl}/${filePath}`;

  app.get('/events/:eventId/photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const photos = await eventPhotosRepository.listPhotos(eventId);
    return eventPhotosResponseSchema.parse({
      data: photos.map((photo) => ({ ...photo, url: toUrl(photo.filePath) }))
    });
  });

  app.post('/events/:eventId/photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);

    const upload = await savePhotoUpload(
      await request.file(),
      reply,
      uploadDir,
      `event-photos/${eventId}`
    );
    if (!upload.ok) return upload.reply;
    const { filePath } = upload;

    try {
      const photo = await eventPhotosRepository.createPhoto(
        eventId,
        user.id,
        filePath
      );
      return reply.status(201).send(
        eventPhotoResponseSchema.parse({
          data: { ...photo, url: toUrl(photo.filePath) }
        })
      );
    } catch (error) {
      await unlink(join(uploadDir, filePath)).catch(() => {});
      if (error instanceof EventNotFoundError) {
        return reply.status(404).send({
          error: { code: 'EVENT_NOT_FOUND', message: error.message }
        });
      }
      throw error;
    }
  });

  app.delete('/events/:eventId/photos/:photoId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { photoId } = photoParamsSchema.parse(request.params);
    const deletedPath = await eventPhotosRepository.deletePhoto(
      photoId,
      user.id
    );
    if (deletedPath) {
      await unlink(join(uploadDir, deletedPath)).catch(() => {});
    }
    return reply.status(204).send();
  });
}
