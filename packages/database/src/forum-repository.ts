import type { PublicUser } from '@pulso/contracts';
import type { ForumCategory } from '@pulso/domain';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { EventNotFoundError } from './attendance-repository.js';
import {
  publicUserColumns,
  toPublicUser,
  type PublicUserRow
} from './public-user.js';

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export class ForumPostNotFoundError extends Error {
  constructor() {
    super('This post does not exist.');
  }
}

// Replies are just posts with a parentId (DEC-0012 v1.1) - the UI nests
// them one level deep under their parent rather than following an
// arbitrarily deep chain, so replyCount/parentId are enough here without a
// recursive tree structure.
export interface ForumPost {
  id: string;
  eventId: string;
  author: PublicUser;
  category: ForumCategory;
  body: string;
  createdAt: string;
  parentId: string | undefined;
  likeCount: number;
  likedByMe: boolean;
  replyCount: number;
}

export interface ActiveForum {
  eventId: string;
  category: ForumCategory;
  lastPostAt: string;
  lastPostExcerpt: string;
  postCount: number;
}

// Aggregated across all four categories for one event - unlike ActiveForum
// (per-category, used by the "Forums actifs" personal digest), this backs
// the Forums discovery grid (Phase 4.8): one card per event, so it needs
// the event's forum as a whole. memberCount is a real count of distinct
// authors who have posted - there is no membership/join concept (DEC-0012
// unchanged), so this is the only honest "members" number available.
export interface ForumStats {
  postCount: number;
  memberCount: number;
  lastPostAt: string;
  lastPostExcerpt: string;
}

export interface ForumRepository {
  getPosts(
    eventId: string,
    category: ForumCategory,
    viewerId: string
  ): Promise<ForumPost[]>;
  createPost(
    eventId: string,
    authorId: string,
    category: ForumCategory,
    body: string,
    parentId: string | undefined
  ): Promise<ForumPost>;
  // Silent no-op when postId doesn't exist or doesn't belong to authorId -
  // same spirit as the rest of this project's own-resource deletes.
  deletePost(postId: string, authorId: string): Promise<void>;
  likePost(postId: string, userId: string): Promise<void>;
  unlikePost(postId: string, userId: string): Promise<void>;
  // Powers the dashboard's "Forums actifs" widget: the most recently
  // active thread per event, restricted to events the caller already
  // cares about (favorited or attended) - never a public/global feed.
  getRecentActivityForEvents(eventIds: string[]): Promise<ActiveForum[]>;
  // Powers the Forums discovery grid (Phase 4.8) - events with no posts
  // yet simply have no entry in the returned map, left for the caller to
  // default to zero rather than this repository inventing a row.
  getForumStatsForEvents(eventIds: string[]): Promise<Map<string, ForumStats>>;
  // Distinct authors across all categories for one event's forum - backs
  // the "Membres" tab (Phase 4.8).
  getForumMembers(eventId: string): Promise<PublicUser[]>;
  // Real events the user has actually posted in - part of what "Mes
  // forums" means (Phase 4.8 follow-up): having participated in a forum
  // should count as "mine" even if the underlying event was never
  // favorited or marked attended.
  getPostedEventIds(userId: string): Promise<string[]>;
  // Explicit "Suivre ce forum" bookmark (Phase 4.8 follow-up) - lets
  // someone keep a forum in "Mes forums" without posting a message or
  // favoriting/attending the event, a distinct intent from either of
  // those. Idempotent (following twice, or unfollowing when not
  // following, are both no-ops).
  followForum(eventId: string, userId: string): Promise<void>;
  unfollowForum(eventId: string, userId: string): Promise<void>;
  isFollowingForum(eventId: string, userId: string): Promise<boolean>;
  getFollowedEventIds(userId: string): Promise<string[]>;
  // Reverse of getFollowedEventIds - who to notify when someone posts in
  // this event's forum (DEC-0016 trigger 5).
  getForumFollowerIds(eventId: string): Promise<string[]>;
}

// The author's columns come back alongside the post's own, and the post
// owns `id` - hence Omit<..., 'id'> plus the reshape in toForumPost.
interface PostRow extends Omit<PublicUserRow, 'id'> {
  id: string;
  event_id: string;
  category: ForumCategory;
  body: string;
  created_at: string;
  parent_id: string | null;
  author_id: string;
  like_count: string;
  reply_count: string;
  liked_by_me: boolean;
}

function toForumPost(row: PostRow): ForumPost {
  return {
    id: row.id,
    eventId: row.event_id,
    category: row.category,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    parentId: row.parent_id ?? undefined,
    likeCount: Number(row.like_count),
    likedByMe: row.liked_by_me,
    replyCount: Number(row.reply_count),
    author: toPublicUser({ ...row, id: row.author_id })
  };
}

export class PostgresForumRepository implements ForumRepository {
  constructor(private readonly pool: Pool) {}

  async getPosts(
    eventId: string,
    category: ForumCategory,
    viewerId: string
  ): Promise<ForumPost[]> {
    const result = await this.pool.query<PostRow>(
      `SELECT p.id, p.event_id, p.category, p.body, p.created_at, p.parent_id,
              u.id AS author_id, u.display_name, u.avatar_url,
              u.photo_url, u.avatar_style,
              COALESCE(likes.like_count, 0) AS like_count,
              COALESCE(replies.reply_count, 0) AS reply_count,
              (my_like.user_id IS NOT NULL) AS liked_by_me
       FROM forum_posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN (
         SELECT post_id, COUNT(*) AS like_count FROM forum_post_likes GROUP BY post_id
       ) likes ON likes.post_id = p.id
       LEFT JOIN (
         SELECT parent_id, COUNT(*) AS reply_count FROM forum_posts
         WHERE parent_id IS NOT NULL GROUP BY parent_id
       ) replies ON replies.parent_id = p.id
       LEFT JOIN forum_post_likes my_like ON my_like.post_id = p.id AND my_like.user_id = $3
       WHERE p.event_id = $1 AND p.category = $2
       ORDER BY p.created_at ASC`,
      [eventId, category, viewerId]
    );
    return result.rows.map(toForumPost);
  }

  async createPost(
    eventId: string,
    authorId: string,
    category: ForumCategory,
    body: string,
    parentId: string | undefined
  ): Promise<ForumPost> {
    const id = randomUUID();
    try {
      const result = await this.pool.query<PostRow>(
        `WITH inserted AS (
           INSERT INTO forum_posts (id, event_id, author_id, category, body, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, event_id, category, body, created_at, author_id, parent_id
         )
         SELECT inserted.*, u.display_name, u.avatar_url,
                u.photo_url, u.avatar_style,
                0 AS like_count, 0 AS reply_count, false AS liked_by_me
         FROM inserted
         JOIN users u ON u.id = inserted.author_id`,
        [id, eventId, authorId, category, body, parentId ?? null]
      );
      return toForumPost(result.rows[0]!);
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    }
  }

  async deletePost(postId: string, authorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM forum_posts WHERE id = $1 AND author_id = $2`,
      [postId, authorId]
    );
  }

  async likePost(postId: string, userId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO forum_post_likes (post_id, user_id) VALUES ($1, $2)
         ON CONFLICT (post_id, user_id) DO NOTHING`,
        [postId, userId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new ForumPostNotFoundError();
      throw error;
    }
  }

  async unlikePost(postId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM forum_post_likes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
  }

  async getRecentActivityForEvents(eventIds: string[]): Promise<ActiveForum[]> {
    if (eventIds.length === 0) return [];
    const result = await this.pool.query<{
      event_id: string;
      category: ForumCategory;
      body: string;
      created_at: string;
      post_count: string;
    }>(
      `SELECT event_id, category, body, created_at, post_count
       FROM (
         SELECT event_id, category, body, created_at,
                COUNT(*) OVER (PARTITION BY event_id) AS post_count,
                ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at DESC) AS rn
         FROM forum_posts
         WHERE event_id = ANY($1::uuid[])
       ) latest
       WHERE rn = 1
       ORDER BY created_at DESC
       LIMIT 10`,
      [eventIds]
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      category: row.category,
      lastPostAt: new Date(row.created_at).toISOString(),
      lastPostExcerpt: row.body,
      postCount: Number(row.post_count)
    }));
  }

  async getForumStatsForEvents(
    eventIds: string[]
  ): Promise<Map<string, ForumStats>> {
    if (eventIds.length === 0) return new Map();
    const result = await this.pool.query<{
      event_id: string;
      body: string;
      created_at: string;
      post_count: string;
      member_count: string;
    }>(
      // COUNT(DISTINCT ...) isn't allowed inside a window function in
      // Postgres, so member_count/post_count are a plain GROUP BY here
      // (regular aggregates support DISTINCT fine) and the latest post's
      // body/created_at come from a separate LATERAL join instead of
      // window-functioning the whole thing in one pass like
      // getRecentActivityForEvents above does.
      `SELECT s.event_id, s.post_count, s.member_count, latest.body, latest.created_at
       FROM (
         SELECT event_id, COUNT(*) AS post_count, COUNT(DISTINCT author_id) AS member_count
         FROM forum_posts
         WHERE event_id = ANY($1::uuid[])
         GROUP BY event_id
       ) s
       JOIN LATERAL (
         SELECT body, created_at
         FROM forum_posts p
         WHERE p.event_id = s.event_id
         ORDER BY created_at DESC
         LIMIT 1
       ) latest ON true`,
      [eventIds]
    );
    const stats = new Map<string, ForumStats>();
    for (const row of result.rows) {
      stats.set(row.event_id, {
        postCount: Number(row.post_count),
        memberCount: Number(row.member_count),
        lastPostAt: new Date(row.created_at).toISOString(),
        lastPostExcerpt: row.body
      });
    }
    return stats;
  }

  async getForumMembers(eventId: string): Promise<PublicUser[]> {
    const result = await this.pool.query<PublicUserRow>(
      `SELECT DISTINCT ${publicUserColumns('u')}
       FROM forum_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.event_id = $1
       ORDER BY u.display_name ASC`,
      [eventId]
    );
    return result.rows.map(toPublicUser);
  }

  async getPostedEventIds(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ event_id: string }>(
      `SELECT DISTINCT event_id FROM forum_posts WHERE author_id = $1`,
      [userId]
    );
    return result.rows.map((row) => row.event_id);
  }

  async followForum(eventId: string, userId: string): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO forum_follows (user_id, event_id) VALUES ($1, $2)
         ON CONFLICT (user_id, event_id) DO NOTHING`,
        [userId, eventId]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    }
  }

  async getForumFollowerIds(eventId: string): Promise<string[]> {
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM forum_follows WHERE event_id = $1`,
      [eventId]
    );
    return result.rows.map((row) => row.user_id);
  }

  async unfollowForum(eventId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM forum_follows WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId]
    );
  }

  async isFollowingForum(eventId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM forum_follows WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getFollowedEventIds(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ event_id: string }>(
      `SELECT event_id FROM forum_follows WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map((row) => row.event_id);
  }
}
