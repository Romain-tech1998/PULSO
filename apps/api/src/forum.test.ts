import type { PublicEvent } from '@pulso/contracts';
import { EventNotFoundError, ForumPostNotFoundError } from '@pulso/database';
import type { EventRepository } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeFavoritesRepository,
  fakeForumPost,
  fakeForumRepository,
  testUser,
  fakeEventRepository
} from './test-support.js';

const event = fakeEventRepository();

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
      payload: { body: "Quelqu'un pour y aller ensemble ?" }
    });
    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      eventId,
      authorId: testUser.id,
      category: 'find_partners',
      body: "Quelqu'un pour y aller ensemble ?",
      parentId: undefined
    });
    expect(response.json().data.body).toBe("Quelqu'un pour y aller ensemble ?");
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
            return fakeForumPost({
              eventId: id,
              category,
              body,
              parentId: parent
            });
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

  it('lists recently active forums scoped to my favorited and attended events, with titles hydrated', async () => {
    const eventWithForum: EventRepository = {
      ...event,
      findByIds: async (ids) =>
        ids.includes(eventId)
          ? [
              {
                id: eventId,
                title: 'Concert au parc'
              } as unknown as PublicEvent
            ]
          : []
    };
    const app = buildApp(
      eventWithForum,
      accountRepositories({
        favoritesRepository: fakeFavoritesRepository({
          getFavoriteEventIds: async () => [eventId]
        }),
        forumRepository: fakeForumRepository({
          getRecentActivityForEvents: async (eventIds) => {
            expect(eventIds).toEqual([eventId]);
            return [
              {
                eventId,
                category: 'general',
                lastPostAt: '2026-01-01T00:00:00.000Z',
                lastPostExcerpt: "Quelqu'un vient ce soir ?",
                postCount: 3
              }
            ];
          }
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/forums/active',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      {
        eventId,
        eventTitle: 'Concert au parc',
        category: 'general',
        lastPostAt: '2026-01-01T00:00:00.000Z',
        lastPostExcerpt: "Quelqu'un vient ce soir ?",
        postCount: 3
      }
    ]);
    await app.close();
  });

  it('rejects the forum members list and the discover grid without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const members = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/members`
    });
    const discover = await app.inject({
      method: 'GET',
      url: '/me/forums/discover'
    });
    expect(members.statusCode).toBe(401);
    expect(discover.statusCode).toBe(401);
    await app.close();
  });

  it('lists the distinct authors who posted in an event forum', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          getForumMembers: async () => [
            { id: '00000000-0000-4000-8000-000000000030', displayName: 'Alex' }
          ]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { id: '00000000-0000-4000-8000-000000000030', displayName: 'Alex' }
    ]);
    await app.close();
  });

  it('discovers upcoming events as forum entries, defaulting stats to zero when nobody has posted yet', async () => {
    const fakePublicEvent = {
      id: eventId,
      title: 'Charlotte Cardin',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-08-01T23:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'unknown', currency: 'CAD' },
      accessInformation: 'Billets en vente sur le site officiel.',
      venue: {
        id: '00000000-0000-4000-8000-000000000031',
        name: 'MTELUS',
        address: '59 Rue Sainte-Catherine E, Montréal',
        point: { longitude: -73.5605, latitude: 45.5088 }
      },
      source: {
        name: 'ticketmaster',
        url: 'https://example.com/event',
        observedAt: '2026-07-01T00:00:00.000Z'
      },
      trust: {
        label: 'confirmed',
        freshness: 'fresh',
        locationConfidence: 'confirmed'
      }
    };
    const eventWithForum: EventRepository = {
      ...event,
      findInBounds: async () => [fakePublicEvent as unknown as PublicEvent]
    };
    const app = buildApp(
      eventWithForum,
      accountRepositories({
        forumRepository: fakeForumRepository({
          getForumStatsForEvents: async () => new Map()
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/forums/discover',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { event: fakePublicEvent, postCount: 0, memberCount: 0 }
    ]);
    await app.close();
  });

  it('scope=mine restricts the discovery grid to favorited/attended events only', async () => {
    const otherEventId = '00000000-0000-4000-8000-000000000021';
    const baseEvent = {
      id: eventId,
      title: 'Charlotte Cardin',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-08-01T23:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'unknown', currency: 'CAD' },
      accessInformation: 'Billets en vente sur le site officiel.',
      venue: {
        id: '00000000-0000-4000-8000-000000000031',
        name: 'MTELUS',
        address: '59 Rue Sainte-Catherine E, Montréal',
        point: { longitude: -73.5605, latitude: 45.5088 }
      },
      source: {
        name: 'ticketmaster',
        url: 'https://example.com/event',
        observedAt: '2026-07-01T00:00:00.000Z'
      },
      trust: {
        label: 'confirmed',
        freshness: 'fresh',
        locationConfidence: 'confirmed'
      }
    };
    const myEvent = baseEvent;
    const someoneElsesEvent = {
      ...baseEvent,
      id: otherEventId,
      title: 'Un autre événement'
    };
    const eventWithForum: EventRepository = {
      ...event,
      findInBounds: async () =>
        [myEvent, someoneElsesEvent] as unknown as Awaited<
          ReturnType<EventRepository['findInBounds']>
        >
    };
    const app = buildApp(
      eventWithForum,
      accountRepositories({
        forumRepository: fakeForumRepository({
          getForumStatsForEvents: async () => new Map()
        }),
        favoritesRepository: fakeFavoritesRepository({
          getFavoriteEventIds: async () => [eventId]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/forums/discover?scope=mine',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { event: myEvent, postCount: 0, memberCount: 0 }
    ]);
    await app.close();
  });

  it('scope=mine also includes events the caller has posted in or explicitly followed', async () => {
    const postedEventId = '00000000-0000-4000-8000-000000000022';
    const followedEventId = '00000000-0000-4000-8000-000000000023';
    const baseEvent = {
      id: eventId,
      title: 'Charlotte Cardin',
      category: 'music',
      status: 'scheduled',
      startsAt: '2026-08-01T23:00:00.000Z',
      timezone: 'America/Toronto',
      price: { kind: 'unknown', currency: 'CAD' },
      accessInformation: 'Billets en vente sur le site officiel.',
      venue: {
        id: '00000000-0000-4000-8000-000000000031',
        name: 'MTELUS',
        address: '59 Rue Sainte-Catherine E, Montréal',
        point: { longitude: -73.5605, latitude: 45.5088 }
      },
      source: {
        name: 'ticketmaster',
        url: 'https://example.com/event',
        observedAt: '2026-07-01T00:00:00.000Z'
      },
      trust: {
        label: 'confirmed',
        freshness: 'fresh',
        locationConfidence: 'confirmed'
      }
    };
    const postedEvent = {
      ...baseEvent,
      id: postedEventId,
      title: 'Posté sans favori'
    };
    const followedEvent = {
      ...baseEvent,
      id: followedEventId,
      title: 'Suivi sans favori'
    };
    const eventWithForum: EventRepository = {
      ...event,
      findInBounds: async () =>
        [postedEvent, followedEvent] as unknown as Awaited<
          ReturnType<EventRepository['findInBounds']>
        >
    };
    const app = buildApp(
      eventWithForum,
      accountRepositories({
        forumRepository: fakeForumRepository({
          getForumStatsForEvents: async () => new Map(),
          getPostedEventIds: async () => [postedEventId],
          getFollowedEventIds: async () => [followedEventId]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/forums/discover?scope=mine',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      { event: postedEvent, postCount: 0, memberCount: 0 },
      { event: followedEvent, postCount: 0, memberCount: 0 }
    ]);
    await app.close();
  });

  it('rejects reading/changing forum follow status without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const getResponse = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/follow`
    });
    expect(getResponse.statusCode).toBe(401);
    const postResponse = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/follow`
    });
    expect(postResponse.statusCode).toBe(401);
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/forum/follow`
    });
    expect(deleteResponse.statusCode).toBe(401);
    await app.close();
  });

  it('follows and unfollows a forum, and reports the current status', async () => {
    let following = false;
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          isFollowingForum: async () => following,
          followForum: async () => {
            following = true;
          },
          unfollowForum: async () => {
            following = false;
          }
        })
      })
    );
    const before = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/follow`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(before.json()).toEqual({ following: false });

    const follow = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/follow`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(follow.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/forum/follow`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(after.json()).toEqual({ following: true });

    const unfollow = await app.inject({
      method: 'DELETE',
      url: `/events/${eventId}/forum/follow`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(unfollow.statusCode).toBe(204);
    await app.close();
  });

  it('returns 404 when following a forum for an event that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        forumRepository: fakeForumRepository({
          followForum: async () => {
            throw new EventNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/forum/follow`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
