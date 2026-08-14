import type { AdminVenuePhoto } from '@pulso/contracts';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventRepository,
  fakeOrganizerRepository
} from './test-support.js';

const VENUE_ID = '6f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b';

const borrowedPhoto: AdminVenuePhoto = {
  venueId: VENUE_ID,
  venueName: 'Bar Le Cocktail',
  imageUrl: 'https://cdn.example/bar.jpg',
  imageSource: 'website_og',
  pageUrl: 'https://bar.example/',
  suppressed: false
};

function adminApp(
  repositoryOverrides: Parameters<typeof fakeEventRepository>[0] = {}
) {
  const repository = fakeEventRepository(repositoryOverrides);
  return buildApp(repository, {
    ...accountRepositories({
      organizerRepository: fakeOrganizerRepository({
        isAdmin: async () => true
      })
    })
  });
}

describe('DEC-0019 venue photo administration', () => {
  it('lists the photos to an administrator', async () => {
    const app = adminApp({ listVenuePhotos: async () => [borrowedPhoto] });
    const response = await app.inject({
      method: 'GET',
      url: '/admin/venue-photos',
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ venueName: 'Bar Le Cocktail', imageSource: 'website_og' }]
    });
    await app.close();
  });

  it('passes a search term through', async () => {
    let searched: string | undefined;
    const app = adminApp({
      listVenuePhotos: async (query) => {
        searched = query;
        return [];
      }
    });
    await app.inject({
      method: 'GET',
      url: '/admin/venue-photos?query=cocktail',
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(searched).toBe('cocktail');
    await app.close();
  });

  it('suppresses a photo for every future import, not just the current one', async () => {
    // The whole point of the suppression: clearing the column alone would be
    // undone by the next import.
    let suppressedFor: string | undefined;
    let options: { thisOneOnly?: boolean; reason?: string } | undefined;
    const app = adminApp({
      suppressVenuePhoto: async (venueId, received) => {
        suppressedFor = venueId;
        options = received;
        return true;
      }
    });
    const response = await app.inject({
      method: 'POST',
      url: `/admin/venue-photos/${VENUE_ID}/suppress`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { reason: 'owner request' }
    });

    expect(response.statusCode).toBe(204);
    expect(suppressedFor).toBe(VENUE_ID);
    expect(options).toEqual({ reason: 'owner request' });
    await app.close();
  });

  it('404s on a venue that does not exist', async () => {
    const app = adminApp({ suppressVenuePhoto: async () => false });
    const response = await app.inject({
      method: 'POST',
      url: `/admin/venue-photos/${VENUE_ID}/suppress`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('lifts a suppression', async () => {
    let restoredFor: string | undefined;
    const app = adminApp({
      restoreVenuePhoto: async (venueId) => {
        restoredFor = venueId;
        return true;
      }
    });
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/venue-photos/${VENUE_ID}/suppress`,
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(response.statusCode).toBe(204);
    expect(restoredFor).toBe(VENUE_ID);
    await app.close();
  });

  it('answers 204 when there was no suppression to lift', async () => {
    // A retry of a completed removal is not a failure: the caller asked for
    // "not suppressed", and that is the state either way.
    const app = adminApp({ restoreVenuePhoto: async () => false });
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/venue-photos/${VENUE_ID}/suppress`,
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it('refuses a non-administrator', async () => {
    let listed = false;
    const repository = fakeEventRepository({
      listVenuePhotos: async () => {
        listed = true;
        return [];
      }
    });
    const app = buildApp(repository, {
      ...accountRepositories({
        organizerRepository: fakeOrganizerRepository({
          isAdmin: async () => false
        })
      })
    });
    const response = await app.inject({
      method: 'GET',
      url: '/admin/venue-photos',
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(response.statusCode).toBe(403);
    expect(listed).toBe(false);
    await app.close();
  });

  it('refuses an unauthenticated caller', async () => {
    const app = adminApp();
    const response = await app.inject({
      method: 'GET',
      url: '/admin/venue-photos'
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
