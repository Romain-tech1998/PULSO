import type { PublicEvent } from '@pulso/contracts';
import {} from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Nothing here deletes anything under testUploadDir. It is shared across
// test files that vitest runs in parallel, so a recursive delete would - and
// did - remove a directory another worker was mid-write into, producing a
// 500 that had nothing to do with the code under test. The folder is a
// disposable OS temp dir by design (see test-support.ts).
import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventRepository,
  testUser
} from './test-support.js';

const createdEvent: PublicEvent = {
  id: '00000000-0000-4000-8000-0000000000b1',
  title: 'After chez Marie',
  category: 'nightlife',
  status: 'scheduled',
  startsAt: '2026-09-05T07:00:00.000Z',
  timezone: 'America/Toronto',
  price: { kind: 'free', currency: 'CAD' },
  accessInformation: 'Sonner à la porte bleue.',
  venue: {
    id: '00000000-0000-4000-8000-0000000000b2',
    name: 'Loft Saint-Henri',
    address: '1 rue Notre-Dame Ouest, Montréal, QC',
    point: { longitude: -73.58, latitude: 45.48 }
  },
  source: {
    name: 'Pulso — membre',
    url: 'https://pulso.app/events/created',
    observedAt: '2026-08-06T00:00:00.000Z'
  },
  origin: 'community',
  isAfter: true,
  createdBy: { userId: testUser.id, displayName: testUser.displayName }
};

const futureStart = new Date(Date.now() + 86_400_000).toISOString();

const validPayload = {
  title: 'After chez Marie',
  category: 'nightlife',
  startsAt: futureStart,
  accessInformation: 'Sonner à la porte bleue.',
  isAfter: true,
  price: { kind: 'free' },
  venue: { kind: 'existing', venueId: createdEvent.venue.id }
};

describe('event creation (DEC-0017)', () => {
  it('requires an account', async () => {
    const app = buildApp(fakeEventRepository(), accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/me/events',
      payload: validPayload
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('creates an event and returns it with its origin', async () => {
    let receivedUserId: string | undefined;
    const app = buildApp(
      fakeEventRepository({
        createEvent: async (userId) => {
          receivedUserId = userId;
          return createdEvent;
        }
      }),
      accountRepositories()
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/events',
      headers: { authorization: 'Bearer valid-token' },
      payload: validPayload
    });
    expect(response.statusCode).toBe(201);
    expect(receivedUserId).toBe(testUser.id);
    expect(response.json().data.origin).toBe('community');
    await app.close();
  });

  // DEC-0017 acceptance criterion 7.
  it('never gives a created event a trust label', async () => {
    const app = buildApp(
      fakeEventRepository({ createEvent: async () => createdEvent }),
      accountRepositories()
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/events',
      headers: { authorization: 'Bearer valid-token' },
      payload: validPayload
    });
    expect(response.json().data.trust).toBeUndefined();
    await app.close();
  });

  it('refuses an event that starts in the past', async () => {
    const app = buildApp(fakeEventRepository(), accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/me/events',
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        ...validPayload,
        startsAt: new Date(Date.now() - 86_400_000).toISOString()
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('EVENT_STARTS_IN_PAST');
    await app.close();
  });

  // DEC-0017 acceptance criterion 8: scoping lives in the repository, and a
  // miss must not disclose that the id exists.
  it('answers 404 when deleting an event the caller does not own', async () => {
    const app = buildApp(
      fakeEventRepository({ deleteCreatedEvent: async () => false }),
      accountRepositories()
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/me/events/${createdEvent.id}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe('created-event visibility (DEC-0017)', () => {
  // Acceptance criterion 2: the anonymous surfaces stay the sourced
  // directory, and the After filter is connected-only.
  it('excludes created events and ignores ?after for an anonymous caller', async () => {
    let options: { includeCreated?: boolean; after?: boolean } | undefined;
    const app = buildApp(
      fakeEventRepository({
        findInBounds: async (_bounds, _window, received) => {
          options = received;
          return [];
        }
      }),
      accountRepositories()
    );
    const res = await app.inject({
      method: 'GET',
      url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&date=next7&price=all&after=true'
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(options).toMatchObject({ includeCreated: false, after: false });
    await app.close();
  });

  it('includes created events for a signed-in caller', async () => {
    let options: { includeCreated?: boolean; after?: boolean } | undefined;
    const app = buildApp(
      fakeEventRepository({
        findInBounds: async (_bounds, _window, received) => {
          options = received;
          return [];
        }
      }),
      accountRepositories()
    );
    await app.inject({
      method: 'GET',
      url: '/events?west=-73.7&south=45.4&east=-73.4&north=45.7&date=next7&price=all&after=true',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(options).toMatchObject({ includeCreated: true, after: true });
    await app.close();
  });
});

describe('event cover upload', () => {
  const auth = { authorization: 'Bearer valid-token' };
  const eventId = '00000000-0000-4000-8000-0000000000b1';

  // @fastify/multipart parses real multipart/form-data - build one with the
  // platform's own FormData/Request rather than hand-rolling boundaries.
  async function buildUpload(mimeType: string, bytes: number[]) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      'cover'
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

  it('rejects an animated GIF, which the gallery accepts', async () => {
    // A cover is rendered at card size in every listing, so it stays still
    // images only. This route and the photo routes share one upload helper,
    // and the narrower list is passed to it explicitly - without this test
    // nothing would notice the helper's default quietly widening covers to
    // whatever the gallery allows.
    const app = buildApp(fakeEventRepository(), accountRepositories());
    const { contentType, payload } = await buildUpload('image/gif', [71, 73]);
    const response = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/cover`,
      headers: { ...auth, 'content-type': contentType },
      payload
    });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    await app.close();
  });

  it('accepts a still image and stores it under event-covers', async () => {
    let storedUrl: string | undefined;
    const app = buildApp(
      fakeEventRepository({
        setCreatedEventImage: async (_userId, _id, imageUrl) => {
          storedUrl = imageUrl;
          return true;
        }
      }),
      accountRepositories()
    );
    const { contentType, payload } = await buildUpload(
      'image/webp',
      [82, 73, 70, 70]
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/cover`,
      headers: { ...auth, 'content-type': contentType },
      payload
    });

    expect(response.statusCode).toBe(201);
    expect(storedUrl).toContain('event-covers/');
    expect(response.json().data.imageUrl).toContain('event-covers/');
    await app.close();
  });

  it('rejects a request carrying no file at all', async () => {
    const app = buildApp(fakeEventRepository(), accountRepositories());
    const { contentType } = await buildUpload('image/png', [1]);
    const response = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/cover`,
      headers: { ...auth, 'content-type': contentType },
      payload: Buffer.from('')
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
