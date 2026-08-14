import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeAuthRepository,
  fakeEventRepository,
  fakeImageModerationProvider,
  fakeImageModerationRepository,
  fakeOrganizerRepository,
  testUploadDir,
  testUser
} from './test-support.js';

// Nothing here deletes anything under testUploadDir. It is a shared folder
// and the suite runs files in parallel, so a recursive delete here removed
// a directory another worker was mid-write into - see the 500 that produced.
// The folder is a disposable OS temp dir by design (test-support.ts).
const event = fakeEventRepository();
const auth = { authorization: 'Bearer valid-token' };
const moderationId = '00000000-0000-4000-8000-0000000000e0';

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

const admin = () => fakeOrganizerRepository({ isAdmin: async () => true });

describe('the moderation queue is administrator-only (DEC-0021 §5)', () => {
  it('refuses an unauthenticated caller', async () => {
    const app = buildApp(event, accountRepositories());
    const list = await app.inject({
      method: 'GET',
      url: '/admin/image-moderation'
    });
    const decide = await app.inject({
      method: 'POST',
      url: `/admin/image-moderation/${moderationId}`,
      payload: { decision: 'approved' }
    });
    expect(list.statusCode).toBe(401);
    expect(decide.statusCode).toBe(401);
    await app.close();
  });

  it('refuses a signed-in non-administrator on the server', async () => {
    // The route being absent from an interface has never been protection.
    const app = buildApp(
      event,
      accountRepositories({
        organizerRepository: fakeOrganizerRepository({
          isAdmin: async () => false
        })
      })
    );
    const list = await app.inject({
      method: 'GET',
      url: '/admin/image-moderation',
      headers: auth
    });
    const decide = await app.inject({
      method: 'POST',
      url: `/admin/image-moderation/${moderationId}`,
      headers: auth,
      payload: { decision: 'rejected' }
    });
    expect(list.statusCode).toBe(403);
    expect(decide.statusCode).toBe(403);
    await app.close();
  });
});

describe('working the queue', () => {
  it('shows an administrator why an image is waiting', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        organizerRepository: admin(),
        imageModerationRepository: fakeImageModerationRepository({
          queue: async () => [
            {
              id: moderationId,
              filePath: 'user-photos/x/a.jpg',
              surface: 'user_photo',
              ownerId: testUser.id,
              ownerDisplayName: testUser.displayName,
              status: 'flagged',
              provider: 'omni-moderation-latest',
              scores: { violence: 0.7 },
              reason: 'Needs review on violence.',
              moderatedAt: '2026-08-14T12:00:00.000Z',
              decidedAt: undefined,
              reportCount: 2,
              reportReasons: ['violence', 'other']
            }
          ]
        })
      })
    );

    const response = await app.inject({
      method: 'GET',
      url: '/admin/image-moderation',
      headers: auth
    });

    expect(response.statusCode).toBe(200);
    const entry = response.json().data[0];
    expect(entry.status).toBe('flagged');
    expect(entry.scores).toEqual({ violence: 0.7 });
    expect(entry.reportCount).toBe(2);
    expect(entry.reportReasons).toEqual(['violence', 'other']);
    // The console is the one place an unpublished image can be seen.
    expect(entry.url).toContain('user-photos/x/a.jpg');
    await app.close();
  });

  it('approves an image into publication', async () => {
    let seen: [string, string, string] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        organizerRepository: admin(),
        imageModerationRepository: fakeImageModerationRepository({
          decide: async (id, adminId, decision) => {
            seen = [id, adminId, decision];
            return {
              id,
              filePath: 'user-photos/x/a.jpg',
              surface: 'user_photo',
              ownerId: testUser.id,
              status: decision,
              provider: 'fake',
              scores: {},
              reason: undefined,
              moderatedAt: '2026-08-14T12:00:00.000Z',
              decidedAt: '2026-08-14T13:00:00.000Z'
            };
          }
        })
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: `/admin/image-moderation/${moderationId}`,
      headers: auth,
      payload: { decision: 'approved' }
    });

    expect(response.statusCode).toBe(204);
    expect(seen).toEqual([moderationId, testUser.id, 'approved']);
    await app.close();
  });

  it('answers 404 when there is nothing under that identifier', async () => {
    const app = buildApp(
      event,
      accountRepositories({ organizerRepository: admin() })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/admin/image-moderation/${moderationId}`,
      headers: auth,
      payload: { decision: 'approved' }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('reporting a published image (DEC-0021 §4)', () => {
  it('records the report and removes nothing', async () => {
    let seen: [string, string, string | undefined] | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        imageModerationRepository: fakeImageModerationRepository({
          report: async (id, reporterId, reason) => {
            seen = [id, reporterId, reason];
            return true;
          },
          decide: async () => {
            throw new Error('a report must never decide anything');
          }
        })
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: `/images/${moderationId}/report`,
      headers: auth,
      payload: { reason: 'violence' }
    });

    expect(response.statusCode).toBe(204);
    expect(seen).toEqual([moderationId, testUser.id, 'violence']);
    await app.close();
  });

  it('answers the same way when the account has already reported it', async () => {
    // The repository refuses the duplicate; the response is identical either
    // way, so a reporter cannot probe what has already been reported.
    const app = buildApp(
      event,
      accountRepositories({
        imageModerationRepository: fakeImageModerationRepository({
          report: async () => false
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/images/${moderationId}/report`,
      headers: auth,
      payload: { reason: 'spam' }
    });
    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it('refuses an unauthenticated reporter', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: `/images/${moderationId}/report`,
      payload: { reason: 'spam' }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe('uploads are screened before they are published', () => {
  it('refuses a disallowed image and never writes it to disk', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        imageModerationProvider: fakeImageModerationProvider({ sexual: 0.99 })
      })
    );
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [255, 216, 255]
    );

    const response = await app.inject({
      method: 'POST',
      url: '/me/photos',
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('IMAGE_REJECTED');
    // Nothing was stored: the refusal happens before the write.
    await expect(
      readFile(join(testUploadDir, 'user-photos', testUser.id))
    ).rejects.toThrow();
    await app.close();
  });

  it('accepts an ambiguous image but does not publish it', async () => {
    let recorded: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        imageModerationProvider: fakeImageModerationProvider({
          violence: 0.7
        }),
        imageModerationRepository: fakeImageModerationRepository({
          record: async (input) => {
            recorded = input.status;
            return {
              id: moderationId,
              filePath: input.filePath,
              surface: input.surface,
              ownerId: input.ownerId,
              status: input.status,
              provider: input.provider,
              scores: input.scores,
              reason: input.reason,
              moderatedAt: '2026-08-14T12:00:00.000Z',
              decidedAt: undefined
            };
          },
          // Nothing is approved, so nothing is served.
          approvedPaths: async () => new Set<string>()
        })
      })
    );
    const { contentType, payload } = await buildPhotoUpload(
      'image/jpeg',
      [255, 216]
    );

    const upload = await app.inject({
      method: 'POST',
      url: '/me/photos',
      headers: { ...auth, 'content-type': contentType },
      payload
    });
    expect(upload.statusCode).toBe(202);
    expect(upload.json().data.moderationStatus).toBe('flagged');
    expect(recorded).toBe('flagged');

    // Not even its own owner sees it while it waits.
    const listed = await app.inject({
      method: 'GET',
      url: '/me/photos',
      headers: auth
    });
    expect(listed.json().data).toEqual([]);

    await app.close();
  });

  it('keeps the existing profile photo when a replacement is not approved', async () => {
    // DEC-0021 §2: attempting a change must never be a way to lose a
    // working photo, or to blank a profile with an image that fails.
    let published = false;
    const app = buildApp(
      event,
      accountRepositories({
        imageModerationProvider: fakeImageModerationProvider({
          violence: 0.7
        }),
        authRepository: fakeAuthRepository({
          setProfilePhoto: async () => {
            published = true;
            return { user: testUser, previousPath: undefined };
          }
        })
      })
    );
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

    expect(response.statusCode).toBe(202);
    expect(response.json().moderation.status).toBe('flagged');
    expect(published).toBe(false);

    await app.close();
  });

  it('publishes a clean image immediately, with nothing said about moderation', async () => {
    const app = buildApp(event, accountRepositories());
    const { contentType, payload } = await buildPhotoUpload(
      'image/webp',
      [82, 73, 70, 70]
    );

    const response = await app.inject({
      method: 'POST',
      url: '/me/photos',
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.moderationStatus).toBe('approved');

    await app.close();
  });
});
