import {
  meResponseSchema,
  userPhotoResponseSchema,
  userPhotosResponseSchema
} from '@pulso/contracts';
import type {
  AuthRepository,
  UserPhoto,
  UserPhotosRepository
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import { savePhotoUpload } from './photo-upload.js';

const photoParamsSchema = z.object({ photoId: z.uuid() });
const ownerParamsSchema = z.object({ userId: z.uuid() });

// The caption and the optional "taken at" reference travel as query
// parameters rather than as multipart fields. @fastify/multipart only
// exposes fields it has already parsed when the file part is reached, so
// reading them from the body would silently depend on the order the client
// happened to serialise the parts in. A query string has no such ordering.
//
// An absent parameter and an empty one mean the same thing - not provided -
// since there is no edit route and therefore nothing to clear.
const createPhotoQuerySchema = z.object({
  caption: z.string().trim().max(280).optional(),
  eventId: z.uuid().optional(),
  venueId: z.uuid().optional()
});

function blankToUndefined(
  query: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => typeof value !== 'string' || value.trim().length > 0
    )
  );
}

/**
 * The profile photo and the personal photo gallery (DEC-0020).
 *
 * Both reverse the Phase 4.7 boundary that stored no user image beyond the
 * Google avatar, and both reuse the shared local-disk upload rather than
 * introducing a storage dependency. The gallery is a gallery and not a
 * feed: there is one read route and it is scoped to a single owner, with
 * the friends-only visibility rule enforced in the repository's SQL.
 */
export function registerUserPhotosRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  userPhotosRepository: UserPhotosRepository,
  uploadDir: string,
  publicUploadUrl: string
) {
  const toUrl = (filePath: string) => `${publicUploadUrl}/${filePath}`;
  // The repository deals in file paths and `undefined`; the contract wants a
  // URL and an absent key. One place to convert between the two.
  const toResponse = (photo: UserPhoto) => ({
    id: photo.id,
    url: toUrl(photo.filePath),
    createdAt: photo.createdAt,
    ...(photo.caption !== undefined ? { caption: photo.caption } : {}),
    ...(photo.eventId !== undefined ? { eventId: photo.eventId } : {}),
    ...(photo.venueId !== undefined ? { venueId: photo.venueId } : {})
  });

  // --- The profile photo -------------------------------------------------

  app.put('/me/photo', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);

    const upload = await savePhotoUpload(
      await request.file(),
      reply,
      uploadDir,
      `profile-photos/${user.id}`
    );
    if (!upload.ok) return upload.reply;

    const { user: updated, previousPath } =
      await authRepository.setProfilePhoto(
        user.id,
        toUrl(upload.filePath),
        upload.filePath
      );
    // Replacing a photo deletes the one it replaced; a failure to unlink is
    // deliberately swallowed, since an orphaned file on disk must not turn
    // a successful profile update into an error for the user.
    if (previousPath && previousPath !== upload.filePath) {
      await unlink(join(uploadDir, previousPath)).catch(() => {});
    }
    return meResponseSchema.parse({ data: updated });
  });

  app.delete('/me/photo', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { user: updated, previousPath } =
      await authRepository.clearProfilePhoto(user.id);
    if (previousPath) {
      await unlink(join(uploadDir, previousPath)).catch(() => {});
    }
    return meResponseSchema.parse({ data: updated });
  });

  // --- The gallery -------------------------------------------------------

  app.get('/me/photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const photos = await userPhotosRepository.listPhotos(user.id, user.id);
    return userPhotosResponseSchema.parse({ data: photos.map(toResponse) });
  });

  // Another account's gallery. An empty list is the answer for a stranger,
  // for a non-existent account and for a friend who has posted nothing -
  // the repository decides, and the three cases are indistinguishable on
  // purpose so this cannot be used to probe who has photos.
  app.get('/users/:userId/photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { userId } = ownerParamsSchema.parse(request.params);
    const photos = await userPhotosRepository.listPhotos(userId, user.id);
    return userPhotosResponseSchema.parse({ data: photos.map(toResponse) });
  });

  app.post('/me/photos', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);

    const fields = createPhotoQuerySchema.parse(
      blankToUndefined((request.query ?? {}) as Record<string, unknown>)
    );
    if (fields.eventId && fields.venueId) {
      return reply.status(400).send({
        error: {
          code: 'AMBIGUOUS_REFERENCE',
          message: 'A photo references either an event or a venue, not both.'
        }
      });
    }

    const upload = await savePhotoUpload(
      await request.file(),
      reply,
      uploadDir,
      `user-photos/${user.id}`
    );
    if (!upload.ok) return upload.reply;

    const photo = await userPhotosRepository.createPhoto(
      user.id,
      upload.filePath,
      fields
    );
    return reply
      .status(201)
      .send(userPhotoResponseSchema.parse({ data: toResponse(photo) }));
  });

  app.delete('/me/photos/:photoId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { photoId } = photoParamsSchema.parse(request.params);
    const deletedPath = await userPhotosRepository.deletePhoto(
      photoId,
      user.id
    );
    if (deletedPath) {
      await unlink(join(uploadDir, deletedPath)).catch(() => {});
    }
    return reply.status(204).send();
  });
}
