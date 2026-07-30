import type { PublicUser } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { EventNotFoundError } from './attendance-repository.js';

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export class GroupNotFoundError extends Error {
  constructor() {
    super('This group does not exist.');
  }
}

export class NotGroupMemberError extends Error {
  constructor() {
    super('You must join this group before reading or posting in its feed.');
  }
}

export interface Group {
  id: string;
  name: string;
  description: string | undefined;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
  // Set only for the one meetup group findOrCreateEventGroup creates/finds
  // per event (Phase 4.8's "Rencontrer avant l'événement") - undefined for
  // every group created the normal way (DEC-0013, no event tie-in).
  eventId: string | undefined;
}

export interface GroupPost {
  id: string;
  groupId: string;
  author: PublicUser;
  body: string;
  createdAt: string;
  parentId: string | undefined;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
}

export interface GroupsRepository {
  createGroup(
    creatorId: string,
    name: string,
    description: string | undefined
  ): Promise<Group>;
  listMyGroups(userId: string): Promise<Group[]>;
  getGroup(groupId: string, viewerId: string): Promise<Group | undefined>;
  joinGroup(groupId: string, userId: string): Promise<void>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  // "Rencontrer avant l'événement" (Phase 4.8): find-or-create so everyone
  // clicking this button for the same event lands in the same group rather
  // than each spawning their own - the first caller creates it (and is
  // auto-joined as its first member, same as createGroup), every
  // subsequent caller for that event id just gets joined to the existing
  // one. Relies on a unique index on groups.event_id (migration 0022) to
  // stay race-safe under concurrent first clicks.
  findOrCreateEventGroup(
    eventId: string,
    eventTitle: string,
    userId: string
  ): Promise<Group>;
  getPosts(groupId: string, viewerId: string): Promise<GroupPost[]>;
  createPost(
    groupId: string,
    authorId: string,
    body: string,
    parentId: string | undefined
  ): Promise<GroupPost>;
  deletePost(postId: string, authorId: string): Promise<void>;
  likePost(postId: string, userId: string): Promise<void>;
  unlikePost(postId: string, userId: string): Promise<void>;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  member_count: string;
  is_member: boolean;
  event_id: string | null;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    memberCount: Number(row.member_count),
    isMember: row.is_member,
    eventId: row.event_id ?? undefined
  };
}

interface PostRow {
  id: string;
  group_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  author_id: string;
  display_name: string;
  avatar_url: string | null;
  like_count: string;
  reply_count: string;
  liked_by_me: boolean;
}

function toGroupPost(row: PostRow): GroupPost {
  return {
    id: row.id,
    groupId: row.group_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    parentId: row.parent_id ?? undefined,
    likeCount: Number(row.like_count),
    likedByMe: row.liked_by_me,
    replyCount: Number(row.reply_count),
    author: {
      id: row.author_id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }
  };
}

export class PostgresGroupsRepository implements GroupsRepository {
  constructor(private readonly pool: Pool) {}

  async createGroup(
    creatorId: string,
    name: string,
    description: string | undefined
  ): Promise<Group> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const inserted = await client.query<{
        id: string;
        name: string;
        description: string | null;
        created_by: string;
        created_at: string;
        event_id: string | null;
      }>(
        `INSERT INTO groups (id, name, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, created_by, created_at, event_id`,
        [id, name, description ?? null, creatorId]
      );
      await client.query(
        `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)`,
        [id, creatorId]
      );
      await client.query('COMMIT');
      const row = inserted.rows[0]!;
      return toGroup({ ...row, member_count: '1', is_member: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMyGroups(userId: string): Promise<Group[]> {
    const result = await this.pool.query<GroupRow>(
      `SELECT g.id, g.name, g.description, g.created_by, g.created_at, g.event_id,
              (SELECT COUNT(*) FROM group_memberships gm2 WHERE gm2.group_id = g.id) AS member_count,
              true AS is_member
       FROM groups g
       JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows.map(toGroup);
  }

  async getGroup(
    groupId: string,
    viewerId: string
  ): Promise<Group | undefined> {
    const result = await this.pool.query<GroupRow>(
      `SELECT g.id, g.name, g.description, g.created_by, g.created_at, g.event_id,
              (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) AS member_count,
              EXISTS(
                SELECT 1 FROM group_memberships gm
                WHERE gm.group_id = g.id AND gm.user_id = $2
              ) AS is_member
       FROM groups g
       WHERE g.id = $1`,
      [groupId, viewerId]
    );
    return result.rows[0] ? toGroup(result.rows[0]) : undefined;
  }

  async findOrCreateEventGroup(
    eventId: string,
    eventTitle: string,
    userId: string
  ): Promise<Group> {
    const client = await this.pool.connect();
    let groupId: string;
    try {
      await client.query('BEGIN');
      // ON CONFLICT DO NOTHING makes this a no-op if another caller already
      // created the group for this event (concurrent first click) - either
      // way, the SELECT below then finds the single row that actually won.
      await client.query(
        `INSERT INTO groups (id, name, description, created_by, event_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [randomUUID(), `Rencontre – ${eventTitle}`, null, userId, eventId]
      );
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM groups WHERE event_id = $1`,
        [eventId]
      );
      groupId = existing.rows[0]!.id;
      await client.query(
        `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, userId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    } finally {
      client.release();
    }
    const group = await this.getGroup(groupId, userId);
    return group!;
  }

  async joinGroup(groupId: string, userId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2) ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, userId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new GroupNotFoundError();
      throw error;
    }
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
  }

  private async requireMembership(
    groupId: string,
    userId: string
  ): Promise<void> {
    const membership = await this.pool.query(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (membership.rows.length === 0) {
      const group = await this.pool.query(
        `SELECT 1 FROM groups WHERE id = $1`,
        [groupId]
      );
      if (group.rows.length === 0) throw new GroupNotFoundError();
      throw new NotGroupMemberError();
    }
  }

  async getPosts(groupId: string, viewerId: string): Promise<GroupPost[]> {
    await this.requireMembership(groupId, viewerId);
    const result = await this.pool.query<PostRow>(
      `SELECT p.id, p.group_id, p.body, p.created_at, p.parent_id,
              u.id AS author_id, u.display_name, u.avatar_url,
              COALESCE(likes.like_count, 0) AS like_count,
              COALESCE(replies.reply_count, 0) AS reply_count,
              (my_like.user_id IS NOT NULL) AS liked_by_me
       FROM group_posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN (SELECT post_id, COUNT(*) AS like_count FROM group_post_likes GROUP BY post_id) likes ON likes.post_id = p.id
       LEFT JOIN (SELECT parent_id, COUNT(*) AS reply_count FROM group_posts WHERE parent_id IS NOT NULL GROUP BY parent_id) replies ON replies.parent_id = p.id
       LEFT JOIN group_post_likes my_like ON my_like.post_id = p.id AND my_like.user_id = $2
       WHERE p.group_id = $1
       ORDER BY p.created_at ASC`,
      [groupId, viewerId]
    );
    return result.rows.map(toGroupPost);
  }

  async createPost(
    groupId: string,
    authorId: string,
    body: string,
    parentId: string | undefined
  ): Promise<GroupPost> {
    await this.requireMembership(groupId, authorId);
    const id = randomUUID();
    try {
      const result = await this.pool.query<PostRow>(
        `WITH inserted AS (
           INSERT INTO group_posts (id, group_id, author_id, body, parent_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, group_id, body, created_at, author_id, parent_id
         )
         SELECT inserted.*, u.display_name, u.avatar_url, 0 AS like_count, 0 AS reply_count, false AS liked_by_me
         FROM inserted JOIN users u ON u.id = inserted.author_id`,
        [id, groupId, authorId, body, parentId ?? null]
      );
      return toGroupPost(result.rows[0]!);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new GroupNotFoundError();
      throw error;
    }
  }

  async deletePost(postId: string, authorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_posts WHERE id = $1 AND author_id = $2`,
      [postId, authorId]
    );
  }

  async likePost(postId: string, userId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO group_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING`,
        [postId, userId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new GroupNotFoundError();
      throw error;
    }
  }

  async unlikePost(postId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
  }
}
