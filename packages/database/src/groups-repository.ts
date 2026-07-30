import type { PublicUser } from '@pulso/contracts';
import type { EventCategory } from '@pulso/domain';
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

// Phase 4.10: the only moderation power a group's creator has (DEC-0013
// v1.2 keeps this narrow) - approving/declining join requests for a
// restricted group. Never content moderation, never kicking a member.
export class NotGroupModeratorError extends Error {
  constructor() {
    super("Only this group's moderator can do that.");
  }
}

export type GroupVisibility = 'open' | 'restricted';
export type GroupMembershipStatus = 'member' | 'pending';
export type AttendanceResponse = 'yes' | 'maybe' | 'no';

export interface GroupMeetupVenue {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
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
  visibility: GroupVisibility;
  // The creator (Phase 4.10, DEC-0013 v1.2) - not a new account concept,
  // just groups.created_by exposed as a real, narrow moderator flag.
  isModerator: boolean;
  // undefined = never requested/joined; 'pending' = restricted-group join
  // request awaiting the moderator; 'member' = same as isMember.
  myStatus: GroupMembershipStatus | undefined;
  // Only populated when isModerator is true - how many people are waiting
  // on this viewer's approval, for a notification-style badge.
  pendingRequestCount: number | undefined;
  // Derived from the linked event's real venue (never entered by hand) -
  // only present for event-linked groups whose event still resolves to a
  // venue.
  meetupVenue?: GroupMeetupVenue;
  // Same event, its title/date - powers the "Groupe lié à {événement}"
  // header badge without a second round trip.
  eventTitle?: string;
  eventStartsAt?: string;
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

export interface DiscoverGroupEntry {
  group: Group;
  // Only set for scope='event' entries.
  event:
    | {
        id: string;
        title: string;
        startsAt: string;
        category: EventCategory;
      }
    | undefined;
}

export interface GroupScheduleItem {
  id: string;
  groupId: string;
  label: string;
  scheduledAt: string;
  createdBy: string;
  createdAt: string;
}

export interface GroupAttendanceSummary {
  yes: number;
  maybe: number;
  no: number;
  myResponse: AttendanceResponse | undefined;
}

export interface GroupChecklistItem {
  id: string;
  groupId: string;
  label: string;
  createdBy: string;
  createdAt: string;
  checkedCount: number;
  totalMembers: number;
  checkedByMe: boolean;
}

export interface GroupsRepository {
  createGroup(
    creatorId: string,
    name: string,
    description: string | undefined,
    visibility: GroupVisibility
  ): Promise<Group>;
  listMyGroups(userId: string): Promise<Group[]>;
  getGroup(groupId: string, viewerId: string): Promise<Group | undefined>;
  // Returns the resulting membership status - 'member' if the group is
  // open (joined immediately, same as before) or 'pending' if restricted
  // (a join request was recorded, awaiting the moderator).
  joinGroup(groupId: string, userId: string): Promise<GroupMembershipStatus>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  // Real accepted members (Phase 4.10's avatar stack) - never a fabricated
  // count, always the actual people who joined.
  getMembers(groupId: string): Promise<PublicUser[]>;
  getJoinRequests(groupId: string, moderatorId: string): Promise<PublicUser[]>;
  respondToJoinRequest(
    groupId: string,
    moderatorId: string,
    targetUserId: string,
    action: 'accept' | 'decline'
  ): Promise<void>;
  discoverGroups(
    viewerId: string,
    scope: 'permanent' | 'event'
  ): Promise<DiscoverGroupEntry[]>;
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
  getScheduleItems(groupId: string): Promise<GroupScheduleItem[]>;
  addScheduleItem(
    groupId: string,
    authorId: string,
    label: string,
    scheduledAt: string
  ): Promise<void>;
  deleteScheduleItem(itemId: string, authorId: string): Promise<void>;
  getAttendanceSummary(
    groupId: string,
    viewerId: string
  ): Promise<GroupAttendanceSummary>;
  setAttendanceResponse(
    groupId: string,
    userId: string,
    response: AttendanceResponse
  ): Promise<void>;
  getChecklistItems(
    groupId: string,
    viewerId: string
  ): Promise<GroupChecklistItem[]>;
  addChecklistItem(
    groupId: string,
    authorId: string,
    label: string
  ): Promise<void>;
  toggleChecklistCheck(
    itemId: string,
    userId: string,
    checked: boolean
  ): Promise<void>;
  deleteChecklistItem(itemId: string, authorId: string): Promise<void>;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  event_id: string | null;
  visibility: GroupVisibility;
  member_count: string;
  my_status: GroupMembershipStatus | null;
  is_moderator: boolean;
  pending_request_count: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_longitude: number | null;
  venue_latitude: number | null;
  event_title: string | null;
  event_starts_at: string | null;
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    eventId: row.event_id ?? undefined,
    visibility: row.visibility,
    memberCount: Number(row.member_count),
    isMember: row.my_status === 'member',
    myStatus: row.my_status ?? undefined,
    isModerator: row.is_moderator,
    pendingRequestCount:
      row.pending_request_count !== null
        ? Number(row.pending_request_count)
        : undefined,
    ...(row.venue_name !== null &&
    row.venue_address !== null &&
    row.venue_longitude !== null &&
    row.venue_latitude !== null
      ? {
          meetupVenue: {
            name: row.venue_name,
            address: row.venue_address,
            longitude: row.venue_longitude,
            latitude: row.venue_latitude
          }
        }
      : {}),
    ...(row.event_title !== null ? { eventTitle: row.event_title } : {}),
    ...(row.event_starts_at !== null
      ? { eventStartsAt: new Date(row.event_starts_at).toISOString() }
      : {})
  };
}

const GROUP_SELECT_FIELDS = `
  g.id, g.name, g.description, g.created_by, g.created_at, g.event_id, g.visibility,
  (SELECT COUNT(*) FROM group_memberships gm2 WHERE gm2.group_id = g.id AND gm2.status = 'member') AS member_count,
  (SELECT gm3.status FROM group_memberships gm3 WHERE gm3.group_id = g.id AND gm3.user_id = $VIEWER) AS my_status,
  (g.created_by = $VIEWER) AS is_moderator,
  CASE WHEN g.created_by = $VIEWER
    THEN (SELECT COUNT(*) FROM group_memberships gm4 WHERE gm4.group_id = g.id AND gm4.status = 'pending')
    ELSE NULL
  END AS pending_request_count,
  v.name AS venue_name, v.address AS venue_address,
  ST_X(v.location) AS venue_longitude, ST_Y(v.location) AS venue_latitude,
  e.title AS event_title, e.starts_at AS event_starts_at
`;

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
    description: string | undefined,
    visibility: GroupVisibility
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
        visibility: GroupVisibility;
      }>(
        `INSERT INTO groups (id, name, description, created_by, visibility)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, description, created_by, created_at, event_id, visibility`,
        [id, name, description ?? null, creatorId, visibility]
      );
      await client.query(
        `INSERT INTO group_memberships (group_id, user_id, status) VALUES ($1, $2, 'member')`,
        [id, creatorId]
      );
      await client.query('COMMIT');
      const row = inserted.rows[0]!;
      return toGroup({
        ...row,
        member_count: '1',
        my_status: 'member',
        is_moderator: true,
        pending_request_count: '0',
        venue_name: null,
        venue_address: null,
        venue_longitude: null,
        venue_latitude: null,
        event_title: null,
        event_starts_at: null
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMyGroups(userId: string): Promise<Group[]> {
    const result = await this.pool.query<GroupRow>(
      `SELECT ${GROUP_SELECT_FIELDS.replaceAll('$VIEWER', '$1')}
       FROM groups g
       JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.status = 'member'
       LEFT JOIN events e ON e.id = g.event_id
       LEFT JOIN venues v ON v.id = e.venue_id
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
      `SELECT ${GROUP_SELECT_FIELDS.replaceAll('$VIEWER', '$2')}
       FROM groups g
       LEFT JOIN events e ON e.id = g.event_id
       LEFT JOIN venues v ON v.id = e.venue_id
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
        `INSERT INTO groups (id, name, description, created_by, event_id, visibility)
         VALUES ($1, $2, $3, $4, $5, 'open')
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [randomUUID(), `Rencontre – ${eventTitle}`, null, userId, eventId]
      );
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM groups WHERE event_id = $1`,
        [eventId]
      );
      groupId = existing.rows[0]!.id;
      await client.query(
        `INSERT INTO group_memberships (group_id, user_id, status) VALUES ($1, $2, 'member')
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

  async joinGroup(
    groupId: string,
    userId: string
  ): Promise<GroupMembershipStatus> {
    const groupResult = await this.pool.query<{ visibility: GroupVisibility }>(
      `SELECT visibility FROM groups WHERE id = $1`,
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group) throw new GroupNotFoundError();
    const status: GroupMembershipStatus =
      group.visibility === 'restricted' ? 'pending' : 'member';
    await this.pool.query(
      `INSERT INTO group_memberships (group_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, userId, status]
    );
    return status;
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
  }

  async getMembers(groupId: string): Promise<PublicUser[]> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id, u.display_name, u.avatar_url
       FROM group_memberships gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.status = 'member'
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }));
  }

  async getJoinRequests(
    groupId: string,
    moderatorId: string
  ): Promise<PublicUser[]> {
    await this.requireModerator(groupId, moderatorId);
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id, u.display_name, u.avatar_url
       FROM group_memberships gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.status = 'pending'
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }));
  }

  async respondToJoinRequest(
    groupId: string,
    moderatorId: string,
    targetUserId: string,
    action: 'accept' | 'decline'
  ): Promise<void> {
    await this.requireModerator(groupId, moderatorId);
    if (action === 'accept') {
      await this.pool.query(
        `UPDATE group_memberships SET status = 'member'
         WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
        [groupId, targetUserId]
      );
    } else {
      await this.pool.query(
        `DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
        [groupId, targetUserId]
      );
    }
  }

  async discoverGroups(
    viewerId: string,
    scope: 'permanent' | 'event'
  ): Promise<DiscoverGroupEntry[]> {
    if (scope === 'permanent') {
      const result = await this.pool.query<GroupRow>(
        `SELECT ${GROUP_SELECT_FIELDS.replaceAll('$VIEWER', '$1')}
         FROM groups g
         LEFT JOIN events e ON e.id = g.event_id
         LEFT JOIN venues v ON v.id = e.venue_id
         WHERE g.event_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM group_memberships gm
             WHERE gm.group_id = g.id AND gm.user_id = $1 AND gm.status = 'member'
           )
         ORDER BY member_count DESC
         LIMIT 50`,
        [viewerId]
      );
      return result.rows.map((row) => ({
        group: toGroup(row),
        event: undefined
      }));
    }
    const result = await this.pool.query<
      GroupRow & {
        ev_id: string;
        ev_title: string;
        ev_starts_at: string;
        ev_category: EventCategory;
      }
    >(
      `SELECT ${GROUP_SELECT_FIELDS.replaceAll('$VIEWER', '$1')},
              e.id AS ev_id, e.title AS ev_title, e.starts_at AS ev_starts_at, e.category AS ev_category
       FROM groups g
       JOIN events e ON e.id = g.event_id
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE g.event_id IS NOT NULL
       ORDER BY e.starts_at ASC
       LIMIT 50`,
      [viewerId]
    );
    return result.rows.map((row) => ({
      group: toGroup(row),
      event: {
        id: row.ev_id,
        title: row.ev_title,
        startsAt: new Date(row.ev_starts_at).toISOString(),
        category: row.ev_category
      }
    }));
  }

  private async requireMembership(
    groupId: string,
    userId: string
  ): Promise<void> {
    const membership = await this.pool.query(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'member'`,
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

  private async requireModerator(
    groupId: string,
    userId: string
  ): Promise<void> {
    const result = await this.pool.query<{ created_by: string }>(
      `SELECT created_by FROM groups WHERE id = $1`,
      [groupId]
    );
    const group = result.rows[0];
    if (!group) throw new GroupNotFoundError();
    if (group.created_by !== userId) throw new NotGroupModeratorError();
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

  async getScheduleItems(groupId: string): Promise<GroupScheduleItem[]> {
    const result = await this.pool.query<{
      id: string;
      group_id: string;
      label: string;
      scheduled_at: string;
      created_by: string;
      created_at: string;
    }>(
      `SELECT id, group_id, label, scheduled_at, created_by, created_at
       FROM group_schedule_items WHERE group_id = $1 ORDER BY scheduled_at ASC`,
      [groupId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      label: row.label,
      scheduledAt: new Date(row.scheduled_at).toISOString(),
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString()
    }));
  }

  async addScheduleItem(
    groupId: string,
    authorId: string,
    label: string,
    scheduledAt: string
  ): Promise<void> {
    await this.requireMembership(groupId, authorId);
    await this.pool.query(
      `INSERT INTO group_schedule_items (id, group_id, label, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), groupId, label, scheduledAt, authorId]
    );
  }

  async deleteScheduleItem(itemId: string, authorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_schedule_items WHERE id = $1 AND created_by = $2`,
      [itemId, authorId]
    );
  }

  async getAttendanceSummary(
    groupId: string,
    viewerId: string
  ): Promise<GroupAttendanceSummary> {
    const counts = await this.pool.query<{
      response: AttendanceResponse;
      count: string;
    }>(
      `SELECT response, COUNT(*) AS count FROM group_attendance_responses
       WHERE group_id = $1 GROUP BY response`,
      [groupId]
    );
    const mine = await this.pool.query<{ response: AttendanceResponse }>(
      `SELECT response FROM group_attendance_responses WHERE group_id = $1 AND user_id = $2`,
      [groupId, viewerId]
    );
    const summary = { yes: 0, maybe: 0, no: 0 };
    for (const row of counts.rows) summary[row.response] = Number(row.count);
    return { ...summary, myResponse: mine.rows[0]?.response };
  }

  async setAttendanceResponse(
    groupId: string,
    userId: string,
    response: AttendanceResponse
  ): Promise<void> {
    await this.requireMembership(groupId, userId);
    await this.pool.query(
      `INSERT INTO group_attendance_responses (group_id, user_id, response) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET response = EXCLUDED.response, created_at = now()`,
      [groupId, userId, response]
    );
  }

  async getChecklistItems(
    groupId: string,
    viewerId: string
  ): Promise<GroupChecklistItem[]> {
    const result = await this.pool.query<{
      id: string;
      group_id: string;
      label: string;
      created_by: string;
      created_at: string;
      checked_count: string;
      total_members: string;
      checked_by_me: boolean;
    }>(
      `SELECT ci.id, ci.group_id, ci.label, ci.created_by, ci.created_at,
              COALESCE(checks.checked_count, 0) AS checked_count,
              (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = ci.group_id AND gm.status = 'member') AS total_members,
              (my_check.user_id IS NOT NULL) AS checked_by_me
       FROM group_checklist_items ci
       LEFT JOIN (SELECT item_id, COUNT(*) AS checked_count FROM group_checklist_checks GROUP BY item_id) checks ON checks.item_id = ci.id
       LEFT JOIN group_checklist_checks my_check ON my_check.item_id = ci.id AND my_check.user_id = $2
       WHERE ci.group_id = $1
       ORDER BY ci.created_at ASC`,
      [groupId, viewerId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      label: row.label,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      checkedCount: Number(row.checked_count),
      totalMembers: Number(row.total_members),
      checkedByMe: row.checked_by_me
    }));
  }

  async addChecklistItem(
    groupId: string,
    authorId: string,
    label: string
  ): Promise<void> {
    await this.requireMembership(groupId, authorId);
    await this.pool.query(
      `INSERT INTO group_checklist_items (id, group_id, label, created_by) VALUES ($1, $2, $3, $4)`,
      [randomUUID(), groupId, label, authorId]
    );
  }

  async toggleChecklistCheck(
    itemId: string,
    userId: string,
    checked: boolean
  ): Promise<void> {
    if (checked) {
      await this.pool.query(
        `INSERT INTO group_checklist_checks (item_id, user_id) VALUES ($1, $2) ON CONFLICT (item_id, user_id) DO NOTHING`,
        [itemId, userId]
      );
    } else {
      await this.pool.query(
        `DELETE FROM group_checklist_checks WHERE item_id = $1 AND user_id = $2`,
        [itemId, userId]
      );
    }
  }

  async deleteChecklistItem(itemId: string, authorId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM group_checklist_items WHERE id = $1 AND created_by = $2`,
      [itemId, authorId]
    );
  }
}
