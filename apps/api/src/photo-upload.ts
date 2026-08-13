import type { MultipartFile } from '@fastify/multipart';
import type { FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The one photo-upload path shared by every surface that accepts an image.
 *
 * The same three steps - accept a known image type, buffer it within the
 * multipart size limit, write it under the upload root with a random name -
 * had been written out separately for event photos, group photos and event
 * covers, each with its own copy of the MIME table and its own wording for
 * the same two errors. This is that logic once. Storage stays the API's own
 * local disk rather than a cloud object store, matching the project's
 * pre-deployment stage (DEC-0012 v1.2, DEC-0020).
 */
const ALLOWED_MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export type PhotoUploadResult =
  { ok: true; filePath: string } | { ok: false; reply: FastifyReply };

/**
 * Writes `file` under `<uploadDir>/<subdirectory>/` and returns the path
 * relative to the upload root, which is what repositories store and what
 * the public URL is built from.
 *
 * On rejection the reply has already been sent, so a caller only has to
 * return it - the shape keeps the "which status, which code" decision here
 * instead of re-deciding it per route.
 */
export async function savePhotoUpload(
  file: MultipartFile | undefined,
  reply: FastifyReply,
  uploadDir: string,
  subdirectory: string
): Promise<PhotoUploadResult> {
  if (!file) {
    return {
      ok: false,
      reply: await reply.status(400).send({
        error: { code: 'NO_FILE', message: 'No photo was uploaded.' }
      })
    };
  }

  const extension = ALLOWED_MIME_TO_EXTENSION[file.mimetype];
  if (!extension) {
    return {
      ok: false,
      reply: await reply.status(415).send({
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Only JPEG, PNG, WebP or GIF photos are supported.'
        }
      })
    };
  }

  let buffer: Buffer;
  try {
    // @fastify/multipart throws here, not earlier, once the configured
    // fileSize limit is passed - so "too large" is only knowable after
    // asking for the bytes.
    buffer = await file.toBuffer();
  } catch {
    return {
      ok: false,
      reply: await reply.status(413).send({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'The photo exceeds the maximum allowed size.'
        }
      })
    };
  }

  const directory = join(uploadDir, subdirectory);
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(directory, filename), buffer);
  // Posix separators regardless of platform: this becomes part of a URL.
  return { ok: true, filePath: `${subdirectory}/${filename}` };
}
