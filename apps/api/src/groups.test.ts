import type { EventRepository } from '@pulso/database';
import { GroupNotFoundError, NotGroupMemberError } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeGroup,
  fakeGroupPost,
  fakeGroupsRepository,
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
    let received: { creatorId: string; name: string; description: string | undefined } | undefined;
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
        groupsRepository: fakeGroupsRepository({ listMyGroups: async () => [group] })
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
        groupsRepository: fakeGroupsRepository({ getGroup: async () => undefined })
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

  it('joins a group', async () => {
    let received: { groupId: string; userId: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        groupsRepository: fakeGroupsRepository({
          joinGroup: async (id, userId) => {
            received = { groupId: id, userId };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(204);
    expect(received).toEqual({ groupId, userId: testUser.id });
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
      | { groupId: string; authorId: string; body: string; parentId: string | undefined }
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
});
