import type { EventRepository } from '@pulso/database';
import {
  GroupNotFoundError,
  NotGroupMemberError,
  NotGroupModeratorError
} from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeGroup,
  fakeGroupPost,
  fakeGroupsRepository,
  friend,
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

const groupId = '00000000-0000-4000-8000-000000000017';

describe('groups API', () => {
  it('rejects creating a group without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/me/groups',
      payload: { name: 'Randonneurs du Plateau' }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('creates a group as the signed-in creator, who becomes its first member', async () => {
    let received:
      | { creatorId: string; name: string; description: string | undefined }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          createGroup: async (creatorId, name, description) => {
            received = { creatorId, name, description };
            return fakeGroup({ createdBy: creatorId, name, description });
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/me/groups',
      headers: { authorization: 'Bearer valid-token' },
      payload: { name: 'Randonneurs du Plateau' }
    });
    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      creatorId: testUser.id,
      name: 'Randonneurs du Plateau',
      description: undefined
    });
    expect(response.json().data.isMember).toBe(true);
    expect(response.json().data.memberCount).toBe(1);
    await app.close();
  });

  it('lists my groups', async () => {
    const group = fakeGroup();
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          listMyGroups: async () => [group]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/groups',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([group]);
    await app.close();
  });

  it('returns 404 for a group that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getGroup: async () => undefined
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('joins an open group immediately', async () => {
    let received: { groupId: string; userId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          joinGroup: async (id, userId) => {
            received = { groupId: id, userId };
            return 'member';
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'member' });
    expect(received).toEqual({ groupId, userId: testUser.id });
    await app.close();
  });

  it('joining a restricted group records a pending request instead', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          joinGroup: async () => 'pending'
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'pending' });
    await app.close();
  });

  it('returns 404 when joining a group that does not exist', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          joinGroup: async () => {
            throw new GroupNotFoundError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('leaves a group', async () => {
    let received: { groupId: string; userId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          leaveGroup: async (id, userId) => {
            received = { groupId: id, userId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ groupId, userId: testUser.id });
    await app.close();
  });

  it('pins a group to the sidebar shortcut list', async () => {
    let received:
      { groupId: string; userId: string; pinned: boolean } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          setGroupPinned: async (id, userId, pinned) => {
            received = { groupId: id, userId, pinned };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/groups/${groupId}/pin`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { pinned: true }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ groupId, userId: testUser.id, pinned: true });
    await app.close();
  });

  it('rejects pinning a group without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'PUT',
      url: `/groups/${groupId}/pin`,
      payload: { pinned: true }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists posts for a group', async () => {
    const post = fakeGroupPost();
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({ getPosts: async () => [post] })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/posts`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([post]);
    await app.close();
  });

  it('rejects reading posts when not a member of the group', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getPosts: async () => {
            throw new NotGroupMemberError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/posts`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('NOT_GROUP_MEMBER');
    await app.close();
  });

  it('creates a post as a member', async () => {
    let received:
      | {
          groupId: string;
          authorId: string;
          body: string;
          parentId: string | undefined;
        }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          createPost: async (id, authorId, body, parentId) => {
            received = { groupId: id, authorId, body, parentId };
            return fakeGroupPost({ groupId: id, body, parentId });
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/posts`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'On se rejoint à 14h ?' }
    });
    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      groupId,
      authorId: testUser.id,
      body: 'On se rejoint à 14h ?',
      parentId: undefined
    });
    await app.close();
  });

  it('rejects posting when not a member of the group', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          createPost: async () => {
            throw new NotGroupMemberError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/posts`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { body: 'Salut' }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('deletes a post as its author', async () => {
    let received: { postId: string; authorId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          deletePost: async (postId, authorId) => {
            received = { postId, authorId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/posts/00000000-0000-4000-8000-000000000018`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      postId: '00000000-0000-4000-8000-000000000018',
      authorId: testUser.id
    });
    await app.close();
  });

  it('likes and unlikes a post', async () => {
    const likeCalls: Array<{ postId: string; userId: string }> = [];
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          likePost: async (postId, userId) => {
            likeCalls.push({ postId, userId });
          },
          unlikePost: async (postId, userId) => {
            likeCalls.push({ postId, userId });
          }
        })
      })
    );
    const postId = '00000000-0000-4000-8000-000000000018';
    const like = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/posts/${postId}/like`,
      headers: { authorization: 'Bearer valid-token' }
    });
    const unlike = await app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/posts/${postId}/like`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(like.statusCode).toBe(204);
    expect(unlike.statusCode).toBe(204);
    expect(likeCalls).toEqual([
      { postId, userId: testUser.id },
      { postId, userId: testUser.id }
    ]);
    await app.close();
  });

  it('rejects the meetup-group route without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/events/00000000-0000-4000-8000-000000000020/meetup-group'
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 404 for the meetup-group route on an event that does not exist', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'POST',
      url: '/events/00000000-0000-4000-8000-000000000020/meetup-group',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('EVENT_NOT_FOUND');
    await app.close();
  });

  it('finds or creates the one meetup group for an event, named after it', async () => {
    const eventId = '00000000-0000-4000-8000-000000000020';
    const eventWithMatch: EventRepository = {
      ...event,
      findById: async (id) =>
        id === eventId
          ? ({ id: eventId, title: 'Charlotte Cardin' } as unknown as Awaited<
              ReturnType<EventRepository['findById']>
            >)
          : undefined
    };
    let received:
      { eventId: string; eventTitle: string; userId: string } | undefined;
    const app = buildApp(
      eventWithMatch,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          findOrCreateEventGroup: async (id, title, userId) => {
            received = { eventId: id, eventTitle: title, userId };
            return fakeGroup({
              eventId: id,
              name: `Rencontre – ${title}`,
              createdBy: userId
            });
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/meetup-group`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Rencontre – Charlotte Cardin');
    expect(received).toEqual({
      eventId,
      eventTitle: 'Charlotte Cardin',
      userId: testUser.id
    });
    await app.close();
  });

  it('lists pending join requests as the moderator', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getJoinRequests: async () => [friend]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/join-requests`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([friend]);
    await app.close();
  });

  it('rejects listing join requests when not the moderator', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getJoinRequests: async () => {
            throw new NotGroupModeratorError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/join-requests`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('NOT_GROUP_MODERATOR');
    await app.close();
  });

  it('accepts a join request as the moderator', async () => {
    let received:
      | {
          groupId: string;
          moderatorId: string;
          targetUserId: string;
          action: string;
        }
      | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          respondToJoinRequest: async (
            id,
            moderatorId,
            targetUserId,
            action
          ) => {
            received = { groupId: id, moderatorId, targetUserId, action };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'PUT',
      url: `/groups/${groupId}/join-requests/${friend.id}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { action: 'accept' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({
      groupId,
      moderatorId: testUser.id,
      targetUserId: friend.id,
      action: 'accept'
    });
    await app.close();
  });

  it('discovers permanent groups not already joined', async () => {
    const entry = {
      group: fakeGroup({ eventId: undefined }),
      event: undefined
    };
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          discoverGroups: async (_viewerId, scope) =>
            scope === 'permanent' ? [entry] : []
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/groups/discover?scope=permanent',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([entry]);
    await app.close();
  });

  it('discovers event-linked groups with their event attached', async () => {
    const eventEntry = {
      group: fakeGroup({ eventId: '00000000-0000-4000-8000-000000000020' }),
      event: {
        id: '00000000-0000-4000-8000-000000000020',
        title: 'Charlotte Cardin',
        startsAt: '2026-08-01T23:00:00.000Z',
        category: 'music' as const
      }
    };
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          discoverGroups: async (_viewerId, scope) =>
            scope === 'event' ? [eventEntry] : []
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/groups/discover?scope=event',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([eventEntry]);
    await app.close();
  });

  it('adds and lists schedule items', async () => {
    let received:
      | {
          groupId: string;
          authorId: string;
          label: string;
          scheduledAt: string;
        }
      | undefined;
    const item = {
      id: '00000000-0000-4000-8000-000000000030',
      groupId,
      label: 'Rendez-vous au bar',
      scheduledAt: '2026-08-01T23:00:00.000Z',
      createdBy: testUser.id,
      createdAt: '2026-01-01T00:00:00.000Z'
    };
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          addScheduleItem: async (id, authorId, label, scheduledAt) => {
            received = { groupId: id, authorId, label, scheduledAt };
          },
          getScheduleItems: async () => [item]
        })
      })
    );
    const addResponse = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/schedule`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        label: 'Rendez-vous au bar',
        scheduledAt: '2026-08-01T23:00:00.000Z'
      }
    });
    expect(addResponse.statusCode).toBe(204);
    expect(received).toEqual({
      groupId,
      authorId: testUser.id,
      label: 'Rendez-vous au bar',
      scheduledAt: '2026-08-01T23:00:00.000Z'
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/schedule`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(listResponse.json().data).toEqual([item]);
    await app.close();
  });

  it('reads and sets an attendance response', async () => {
    let received:
      { groupId: string; userId: string; response: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getAttendanceSummary: async () => ({
            yes: 4,
            maybe: 1,
            no: 1,
            myResponse: 'yes'
          }),
          setAttendanceResponse: async (id, userId, response) => {
            received = { groupId: id, userId, response };
          }
        })
      })
    );
    const getResponse = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/attendance`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(getResponse.json()).toEqual({
      yes: 4,
      maybe: 1,
      no: 1,
      myResponse: 'yes'
    });
    const putResponse = await app.inject({
      method: 'PUT',
      url: `/groups/${groupId}/attendance`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { response: 'maybe' }
    });
    expect(putResponse.statusCode).toBe(204);
    expect(received).toEqual({
      groupId,
      userId: testUser.id,
      response: 'maybe'
    });
    await app.close();
  });

  it('adds, checks, and lists checklist items', async () => {
    const item = {
      id: '00000000-0000-4000-8000-000000000031',
      groupId,
      label: 'Tickets',
      createdBy: testUser.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      checkedCount: 1,
      totalMembers: 2,
      checkedByMe: true
    };
    let toggled:
      { itemId: string; userId: string; checked: boolean } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          getChecklistItems: async () => [item],
          toggleChecklistCheck: async (itemId, userId, checked) => {
            toggled = { itemId, userId, checked };
          }
        })
      })
    );
    const listResponse = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/checklist`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(listResponse.json().data).toEqual([item]);
    const putResponse = await app.inject({
      method: 'PUT',
      url: `/groups/${groupId}/checklist/${item.id}`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { checked: true }
    });
    expect(putResponse.statusCode).toBe(204);
    expect(toggled).toEqual({
      itemId: item.id,
      userId: testUser.id,
      checked: true
    });
    await app.close();
  });
});
