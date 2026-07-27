import type { EventRepository } from '@pulso/database';
import { EventNotFoundError, ForumPostNotFoundError } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeForumPost,
  fakeForumRepository,
  testUser
} from './test-support.js';

const event: EventRepository = {
  findInBounds: async () => [],
  findWithinDirectDistance: async () => [],
  findById: async () => undefined,
  findExternalDestination: async () => undefined,
  findVenuesWithoutUpcomingEvents: async () => [],
  findByIds: async () => []
};

const eventId = '00000000-0000-4000-8000-000000000020';

describe('event forum API', () => {
  it('rejects reading the forum without a bearer token - UGC has no anonymous mode', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/general`
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an unknown forum category', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/not-a-real-category`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('lists posts for a category', async () => {
    const post = fakeForumPost();
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({ getPosts: async () => [post] })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/general`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([post]);
    await app.close();
  });

  it('creates a post as the signed-in author', async () => {
    let received:
      | {
          eventId: string;
          authorId: string;
          category: string;
          body: string;
          parentId: string | undefined;
        }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          createPost: async (id, authorId, category, body, parentId) => {
            received = { eventId: id, authorId, category, body, parentId };
            return fakeForumPost({ eventId: id, category, body });
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/find_partners`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'Quelqu\'un pour y aller ensemble ?' }
    });
    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      eventId,
      authorId: testUser.id,
      category: 'find_partners',
      body: 'Quelqu\'un pour y aller ensemble ?',
      parentId: undefined
    });
    expect(response.json().data.body).toBe('Quelqu\'un pour y aller ensemble ?');
    await app.close();
  });

  it('creates a reply carrying its parentId', async () => {
    const parentId = '00000000-0000-4000-8000-000000000013';
    let receivedParentId: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          createPost: async (id, authorId, category, body, parent) => {
            receivedParentId = parent;
            return fakeForumPost({ eventId: id, category, body, parentId: parent });
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/general`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'Oui, je serai là !', parentId }
    });
    expect(response.statusCode).toBe(201);
    expect(receivedParentId).toBe(parentId);
    expect(response.json().data.parentId).toBe(parentId);
    await app.close();
  });

  it('returns 404 when posting to an event that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          createPost: async () => {
            throw new EventNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/general`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'Salut' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EVENT_NOT_FOUND');
    await app.close();
  });

  it('rejects an empty or overlong post body', async () => {
    const app = buildApp(event, accountRepositories());
    const empty = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/general`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: '' }
    });
    const overlong = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/general`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'a'.repeat(2001) }
    });
    expect(empty.statusCode).toBe(400);
    expect(overlong.statusCode).toBe(400);
    await app.close();
  });

  it('deletes a post as its author', async () => {
    let received: { postId: string; authorId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          deletePost: async (postId, authorId) => {
            received = { postId, authorId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/forum/posts/00000000-0000-4000-8000-000000000013`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      postId: '00000000-0000-4000-8000-000000000013',
      authorId: testUser.id
    });
    await app.close();
  });

  it('likes a post', async () => {
    let received: { postId: string; userId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          likePost: async (postId, userId) => {
            received = { postId, userId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/posts/00000000-0000-4000-8000-000000000013/like`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      postId: '00000000-0000-4000-8000-000000000013',
      userId: testUser.id
    });
    await app.close();
  });

  it('returns 404 when liking a post that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          likePost: async () => {
            throw new ForumPostNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/posts/00000000-0000-4000-8000-000000000013/like`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('FORUM_POST_NOT_FOUND');
    await app.close();
  });

  it('unlikes a post', async () => {
    let received: { postId: string; userId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          unlikePost: async (postId, userId) => {
            received = { postId, userId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/forum/posts/00000000-0000-4000-8000-000000000013/like`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      postId: '00000000-0000-4000-8000-000000000013',
      userId: testUser.id
    });
    await app.close();
  });
});
