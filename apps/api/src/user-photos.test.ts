import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Nothing here deletes anything under testUploadDir. It is shared across
// test files that vitest runs in parallel, so a recursive delete would - and
// did - remove a directory another worker was mid-write into, producing a
// 500 that had nothing to do with the code under test. The folder is a
// disposable OS temp dir by design (see test-support.ts).
import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeAuthRepository,
  fakeEventRepository,
  fakeUserPhotosRepository,
  testUploadDir,
  testUser
} from './test-support.js';

const event = fakeEventRepository();
const auth = { authorization: 'Bearer valid-token' };

const photoId = '00000000-0000-4000-8000-0000000000f0';
const friendId = '00000000-0000-4000-8000-0000000000f1';
const eventId = '00000000-0000-4000-8000-0000000000f2';
const venueId = '00000000-0000-4000-8000-0000000000f3';

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

describe('profile photo API (DEC-0020)', () => {
  it('rejects an upload without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [1, 2, 3]
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/photo',
      headers: { 'content-type': contentType },
      payload
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('stores the file and returns the account carrying its URL', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/png',
      [137, 80, 78, 71]
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/photo',
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(200);
    const url = response.json().data.photoUrl as string;
    // The photo lands under the account's own directory, and the URL the
    // API hands back really points at the bytes that were uploaded.
    expect(url).toContain(`profile-photos/${testUser.id}/`);
    const relativePath = url.split('/uploads/')[1]!;
    expect([...(await readFile(join(testUploadDir, relativePath)))]).toEqual([
      137, 80, 78, 71
    ]);
    await app.close();
  });

  it('refuses a file type that is not an image', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'application/pdf',
      [1, 2, 3]
    );
    const response = await app.inject({
      method: 'PUT',
      url: '/me/photo',
      headers: { ...auth, 'content-type': contentType },
      payload
    });
    expect(response.statusCode).toBe(415);
    await app.close();
  });

  it('deletes the file the photo replaced rather than orphaning it', async () => {
    // The previous path is what the repository reports, so a replace can
    // remove exactly the file it replaced - the behaviour that keeps the
    // upload directory from growing without bound.
    const previousPath = 'profile-photos/stale/previous.jpg';
    let cleared = false;
    const app = buildApp(
      event,
      accountRepositories({
        authRepository: fakeAuthRepository({
          clearProfilePhoto: async () => {
            cleared = true;
            return { user: testUser, previousPath };
          }
        })
      })
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/me/photo',
      headers: auth
    });

    expect(response.statusCode).toBe(200);
    expect(cleared).toBe(true);
    // No photoUrl left on the account: the avatar falls back to the preset,
    // then to the Google photo, then to the initial.
    expect(response.json().data.photoUrl).toBeUndefined();
    await app.close();
  });
});

describe('photo gallery API (DEC-0020)', () => {
  it('rejects reading a gallery without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/users/${friendId}/photos`
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('asks the repository for the gallery as seen by the caller', async () => {
    // Visibility is the repository's SQL to enforce, but the route has to
    // pass the viewer through for it to have anything to enforce with -
    // this pins that wiring, which is the part a route can get wrong.
    let seenArguments: [string, string] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        userPhotosRepository: fakeUserPhotosRepository({
          listPhotos: async (ownerId, viewerId) => {
            seenArguments = [ownerId, viewerId];
            return [];
          }
        })
      })
    );

    const response = await app.inject({
      method: 'GET',
      url: `/users/${friendId}/photos`,
      headers: auth
    });

    expect(response.statusCode).toBe(200);
    expect(seenArguments).toEqual([friendId, testUser.id]);
    await app.close();
  });

  it('stores a gallery photo with its caption and event reference', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/webp',
      [82, 73, 70, 70]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/photos?caption=Au%20Stereo&eventId=${eventId}`,
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(201);
    const photo = response.json().data;
    expect(photo.caption).toBe('Au Stereo');
    expect(photo.eventId).toBe(eventId);
    expect(photo.venueId).toBeUndefined();
    expect(photo.url).toContain(`user-photos/${testUser.id}/`);
    await app.close();
  });

  it('omits a caption sent as an empty parameter', async () => {
    // An absent parameter and a blank one mean the same thing - a photo
    // with no caption - rather than the blank one failing validation.
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [255, 216]
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/photos?caption=&eventId=',
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.caption).toBeUndefined();
    expect(response.json().data.eventId).toBeUndefined();
    await app.close();
  });

  it('refuses a photo claiming both an event and a venue', async () => {
    // The database CHECK says the same thing, but answering 400 here means
    // the file is never written for a request that cannot be stored.
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [255, 216]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/photos?eventId=${eventId}&venueId=${venueId}`,
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('AMBIGUOUS_REFERENCE');
    await app.close();
  });

  it('deletes only the caller’s own photo', async () => {
    let seenArguments: [string, string] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        userPhotosRepository: fakeUserPhotosRepository({
          deletePhoto: async (id, ownerId) => {
            seenArguments = [id, ownerId];
            return undefined;
          }
        })
      })
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/me/photos/${photoId}`,
      headers: auth
    });

    expect(response.statusCode).toBe(204);
    expect(seenArguments).toEqual([photoId, testUser.id]);
    await app.close();
  });
});
