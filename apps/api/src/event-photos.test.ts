import { EventNotFoundError } from '@pulso/database';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventPhoto,
  fakeEventPhotosRepository,
  testUploadDir,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

const eventId = '00000000-0000-4000-8000-000000000014';

// @fastify/multipart parses real multipart/form-data - build one with the
// platform's own FormData/Request rather than hand-rolling boundaries.
async function buildPhotoUpload(mimeType: string, bytes: number[]) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    'photo'
  );
  const request = new Request('http://local/upload', {
    method: 'POST',
    body: form
  });
  return {
    contentType: request.headers.get('content-type')!,
    payload: Buffer.from(await request.arrayBuffer())
  };
}

describe('event photos API', () => {
  it('rejects listing photos without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/photos`
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects uploading a photo without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [1, 2, 3]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/photos`,
      headers: { 'content-type': contentType },
      payload
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects deleting a photo without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/photos/00000000-0000-4000-8000-000000000019`
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists photos with real, ready-to-use URLs built from the upload root', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventPhotosRepository: fakeEventPhotosRepository({
          listPhotos: async () => [
            fakeEventPhoto({ filePath: `event-photos/${eventId}/abc.jpg` })
          ]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/photos`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].url).toBe(
      `http://127.0.0.1:3001/uploads/event-photos/${eventId}/abc.jpg`
    );
    await app.close();
  });

  it('rejects an unsupported file type', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'text/plain',
      [1, 2, 3]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/photos`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': contentType
      },
      payload
    });
    expect(response.statusCode).toBe(415);
    await app.close();
  });

  it('saves an uploaded photo to disk and records it against the event and uploader', async () => {
    const created: Array<{
      eventId: string;
      uploaderId: string;
      filePath: string;
    }> = [];
    const app = buildApp(
      event,
      accountRepositories({
        eventPhotosRepository: fakeEventPhotosRepository({
          createPhoto: async (eventId, uploaderId, filePath) => {
            created.push({ eventId, uploaderId, filePath });
            return fakeEventPhoto({
              eventId,
              uploader: { id: uploaderId, displayName: testUser.displayName },
              filePath
            });
          }
        })
      })
    );
    const bytes = [1, 2, 3, 4, 5];
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      bytes
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/photos`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': contentType
      },
      payload
    });
    expect(response.statusCode).toBe(201);
    expect(created).toHaveLength(1);
    expect(created[0]!.eventId).toBe(eventId);
    expect(created[0]!.uploaderId).toBe(testUser.id);
    expect(created[0]!.filePath).toMatch(
      new RegExp(`^event-photos/${eventId}/.+\\.jpg$`)
    );
    expect(response.json().data.url).toBe(
      `http://127.0.0.1:3001/uploads/${created[0]!.filePath}`
    );

    const written = await readFile(join(testUploadDir, created[0]!.filePath));
    expect([...written]).toEqual(bytes);

    await rm(join(testUploadDir, 'event-photos', eventId), {
      recursive: true,
      force: true
    });
    await app.close();
  });

  it('returns 404 when uploading a photo for an event that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventPhotosRepository: fakeEventPhotosRepository({
          createPhoto: async () => {
            throw new EventNotFoundError();
          }
        })
      })
    );
    const { contentType, payload } = await buildPhotoUpload(
      'image/png',
      [1, 2, 3]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/photos`,
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': contentType
      },
      payload
    });
    expect(response.statusCode).toBe(404);
    await rm(join(testUploadDir, 'event-photos', eventId), {
      recursive: true,
      force: true
    });
    await app.close();
  });

  it("deletes a photo, silently no-op'ing when it isn't the caller's own", async () => {
    const app = buildApp(
      event,
      accountRepositories({
        eventPhotosRepository: fakeEventPhotosRepository({
          deletePhoto: async () => undefined
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/photos/00000000-0000-4000-8000-000000000019`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    await app.close();
  });
});
