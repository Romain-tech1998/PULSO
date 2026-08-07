import { VenueNotFoundError } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeRatingsRepository,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

const venueId = '00000000-0000-4000-8000-000000000030';
const otherVenueId = '00000000-0000-4000-8000-000000000031';

describe('venue ratings API', () => {
  it('rejects rating routes without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const put = await app.inject({
      method: 'PUT',
      url: `/venues/${venueId}/rating`,
      payload: { rating: 4 }
    });
    const del = await app.inject({
      method: 'DELETE',
      url: `/venues/${venueId}/rating`
    });
    const get = await app.inject({
      method: 'GET',
      url: `/venues/${venueId}/rating`
    });
    expect(put.statusCode).toBe(401);
    expect(del.statusCode).toBe(401);
    expect(get.statusCode).toBe(401);
    await app.close();
  });

  it('sets a rating with an optional comment', async () => {
    let received:
      | {
          userId: string;
          venueId: string;
          rating: number;
          comment: string | undefined;
        }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        ratingsRepository: fakeRatingsRepository({
          setRating: async (userId, id, rating, comment) => {
            received = { userId, venueId: id, rating, comment };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { rating: 5, comment: 'Super ambiance' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      userId: testUser.id,
      venueId,
      rating: 5,
      comment: 'Super ambiance'
    });
    await app.close();
  });

  it('rejects a rating outside 1-5', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'PUT',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { rating: 6 }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when rating a venue that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ratingsRepository: fakeRatingsRepository({
          setRating: async () => {
            throw new VenueNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { rating: 3 }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('VENUE_NOT_FOUND');
    await app.close();
  });

  it('clears a rating', async () => {
    let received: { userId: string; venueId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        ratingsRepository: fakeRatingsRepository({
          clearRating: async (userId, id) => {
            received = { userId, venueId: id };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ userId: testUser.id, venueId });
    await app.close();
  });

  it('returns my existing rating', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ratingsRepository: fakeRatingsRepository({
          getMyRating: async () => ({ rating: 4, comment: 'Bien situé' })
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      rating: 4,
      comment: 'Bien situé'
    });
    await app.close();
  });

  it('returns null when the caller has not rated this venue yet', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/venues/${venueId}/rating`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toBeNull();
    await app.close();
  });

  it('returns batched averages for an anonymous caller, omitting venues with no ratings', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ratingsRepository: fakeRatingsRepository({
          getAverageRatingsForVenues: async () =>
            new Map([[venueId, { average: 4.5, count: 2 }]])
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/venues/ratings?ids=${venueId},${otherVenueId}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([{ venueId, average: 4.5, count: 2 }]);
    await app.close();
  });
});
