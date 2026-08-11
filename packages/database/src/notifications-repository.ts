import type { Notification } from '@pulso/contracts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

// How far ahead an attended event counts as "bientôt" for the derived
// reminder kind (DEC-0016 §Authorized triggers).
const REMINDER_WINDOW_HOURS = 24;

export type StoredNotificationKind =
  | 'venue_new_event'
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'message_received'
  | 'forum_reply'
  | 'organizer_request_received'
  | 'organizer_request_resolved'
  | 'group_verification_received'
  | 'group_verification_resolved'
  | 'group_join_request_received'
  | 'group_join_request_accepted';

export interface NotificationsRepository {
  list(userId: string, limit: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  markAllRead(userId: string): Promise<void>;
  markRead(userId: string, notificationId: string): Promise<void>;

  notifyFriendRequestReceived(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void>;
  notifyFriendRequestAccepted(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void>;
  notifyMessageReceived(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void>;
  notifyForumReply(
    recipientUserIds: string[],
    actorUserId: string,
    eventId: string
  ): Promise<void>;
  // Fans an event out to everyone following its venue. Returns how many
  // notifications were actually created so ingestion can report it.
  notifyVenueFollowersOfNewEvent(
    venueId: string,
    eventId: string
  ): Promise<number>;
  // DEC-0018. Every administrator is notified of a new request; the
  // requester is notified of the decision.
  notifyOrganizerRequestReceived(
    adminUserIds: string[],
    actorUserId: string,
    venueId: string
  ): Promise<void>;
  notifyOrganizerRequestResolved(
    recipientUserId: string,
    venueId: string,
    approved: boolean
  ): Promise<void>;
  // Groups. Verification follows DEC-0018's shape exactly (all admins on
  // request, the requester on the decision). The join-request pair closes
  // a gap rather than adding noise: a restricted group's pending queue
  // already existed but nothing announced it to the moderator.
  notifyGroupVerificationReceived(
    adminUserIds: string[],
    actorUserId: string,
    groupId: string
  ): Promise<void>;
  notifyGroupVerificationResolved(
    recipientUserId: string,
    groupId: string,
    approved: boolean
  ): Promise<void>;
  notifyGroupJoinRequestReceived(
    moderatorUserId: string,
    actorUserId: string,
    groupId: string
  ): Promise<void>;
  notifyGroupJoinRequestAccepted(
    recipientUserId: string,
    groupId: string
  ): Promise<void>;
}

interface StoredRow {
  id: string;
  kind: StoredNotificationKind;
  created_at: Date;
  read_at: Date | null;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  event_id: string | null;
  event_title: string | null;
  event_starts_at: Date | null;
  venue_id: string | null;
  venue_name: string | null;
  group_id: string | null;
  group_name: string | null;
}

/**
 * DEC-0016. Five stored kinds plus one derived kind.
 *
 * Nothing here stores display text: every row references an existing event,
 * venue or user and the label is joined at read time, so a renamed venue or
 * a rescheduled event is reflected rather than frozen. The referencing
 * columns are ON DELETE CASCADE, so a deleted event takes its notifications
 * with it instead of leaving a dangling entry.
 */
export class PostgresNotificationsRepository implements NotificationsRepository {
  constructor(private readonly pool: Pool) {}

  async list(userId: string, limit: number): Promise<Notification[]> {
    const [stored, reminders] = await Promise.all([
      this.pool.query<StoredRow>(
        `SELECT n.id, n.kind, n.created_at, n.read_at,
                n.actor_user_id, a.display_name AS actor_display_name,
                a.avatar_url AS actor_avatar_url,
                n.event_id, e.title AS event_title, e.starts_at AS event_starts_at,
                n.venue_id, v.name AS venue_name,
                n.group_id, g.name AS group_name
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_user_id
         LEFT JOIN events e ON e.id = n.event_id
         LEFT JOIN venues v ON v.id = n.venue_id
         LEFT JOIN groups g ON g.id = n.group_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC
         LIMIT $2`,
        [userId, limit]
      ),
      this.listUpcomingReminders(userId)
    ]);

    const mapped = stored.rows
      .map((row) => toNotification(row))
      .filter((entry): entry is Notification => entry !== undefined);

    return [...mapped, ...reminders]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, limit);
  }

  // Derived, never stored (DEC-0016): an event the user is attending that
  // starts within the reminder window. Computing it on read means it can
  // never outlive the fact - it disappears once the event starts, and a
  // withdrawn attendance takes it with it.
  private async listUpcomingReminders(userId: string): Promise<Notification[]> {
    const result = await this.pool.query<{
      event_id: string;
      event_title: string;
      event_starts_at: Date;
      venue_name: string;
    }>(
      `SELECT e.id AS event_id, e.title AS event_title, e.starts_at AS event_starts_at,
              v.name AS venue_name
       FROM event_attendance ea
       JOIN events e ON e.id = ea.event_id
       JOIN venues v ON v.id = e.venue_id
       WHERE ea.user_id = $1
         AND e.starts_at >= now()
         AND e.starts_at <= now() + ($2 || ' hours')::interval
       ORDER BY e.starts_at ASC`,
      [userId, String(REMINDER_WINDOW_HOURS)]
    );
    return result.rows.map((row) => ({
      kind: 'upcoming_event' as const,
      // The reminder's "time" is the event it is about, so it sorts into
      // the list by relevance rather than pinning itself to now().
      createdAt: row.event_starts_at.toISOString(),
      eventId: row.event_id,
      eventTitle: row.event_title,
      eventStartsAt: row.event_starts_at.toISOString(),
      venueName: row.venue_name
    }));
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return Number(result.rows[0]!.count);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND id = $2 AND read_at IS NULL`,
      [userId, notificationId]
    );
  }

  async notifyFriendRequestReceived(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void> {
    await this.insertActorNotification(
      'friend_request_received',
      recipientUserId,
      actorUserId
    );
  }

  async notifyFriendRequestAccepted(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void> {
    await this.insertActorNotification(
      'friend_request_accepted',
      recipientUserId,
      actorUserId
    );
  }

  async notifyMessageReceived(
    recipientUserId: string,
    actorUserId: string
  ): Promise<void> {
    await this.insertActorNotification(
      'message_received',
      recipientUserId,
      actorUserId
    );
  }

  async notifyForumReply(
    recipientUserIds: string[],
    actorUserId: string,
    eventId: string
  ): Promise<void> {
    // Never notify the author of their own post (acceptance criterion 4's
    // rule generalized: a notification is about someone else's action).
    const recipients = recipientUserIds.filter((id) => id !== actorUserId);
    if (recipients.length === 0) return;
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, actor_user_id, event_id)
       SELECT gen_random_uuid(), recipient, 'forum_reply', $2, $3
       FROM unnest($1::uuid[]) AS recipient`,
      [recipients, actorUserId, eventId]
    );
  }

  async notifyVenueFollowersOfNewEvent(
    venueId: string,
    eventId: string
  ): Promise<number> {
    // ON CONFLICT DO NOTHING against notifications_venue_event_unique: a
    // re-run of ingestion over an event Pulso already knows must not notify
    // the same follower twice (acceptance criterion 1).
    const result = await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, venue_id, event_id)
       SELECT gen_random_uuid(), ufv.user_id, 'venue_new_event', $1, $2
       FROM user_favorite_venues ufv
       WHERE ufv.venue_id = $1
       ON CONFLICT DO NOTHING`,
      [venueId, eventId]
    );
    return result.rowCount ?? 0;
  }

  async notifyOrganizerRequestReceived(
    adminUserIds: string[],
    actorUserId: string,
    venueId: string
  ): Promise<void> {
    const recipients = adminUserIds.filter((id) => id !== actorUserId);
    if (recipients.length === 0) return;
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, actor_user_id, venue_id)
       SELECT gen_random_uuid(), recipient, 'organizer_request_received', $2, $3
       FROM unnest($1::uuid[]) AS recipient`,
      [recipients, actorUserId, venueId]
    );
  }

  // An approval is recorded by actor_user_id pointing back at the
  // recipient; a refusal leaves it null. That keeps the decision on the row
  // without a column the other six kinds would never use.
  async notifyOrganizerRequestResolved(
    recipientUserId: string,
    venueId: string,
    approved: boolean
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, venue_id, actor_user_id)
       VALUES ($1, $2, 'organizer_request_resolved', $3, $4)`,
      [
        randomUUID(),
        recipientUserId,
        venueId,
        approved ? recipientUserId : null
      ]
    );
  }

  async notifyGroupVerificationReceived(
    adminUserIds: string[],
    actorUserId: string,
    groupId: string
  ): Promise<void> {
    const recipients = adminUserIds.filter((id) => id !== actorUserId);
    if (recipients.length === 0) return;
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, actor_user_id, group_id)
       SELECT gen_random_uuid(), recipient, 'group_verification_received', $2, $3
       FROM unnest($1::uuid[]) AS recipient`,
      [recipients, actorUserId, groupId]
    );
  }

  // Same encoding as notifyOrganizerRequestResolved: approval is
  // actor_user_id pointing back at the recipient, refusal leaves it null.
  async notifyGroupVerificationResolved(
    recipientUserId: string,
    groupId: string,
    approved: boolean
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, group_id, actor_user_id)
       VALUES ($1, $2, 'group_verification_resolved', $3, $4)`,
      [
        randomUUID(),
        recipientUserId,
        groupId,
        approved ? recipientUserId : null
      ]
    );
  }

  async notifyGroupJoinRequestReceived(
    moderatorUserId: string,
    actorUserId: string,
    groupId: string
  ): Promise<void> {
    if (moderatorUserId === actorUserId) return;
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, actor_user_id, group_id)
       VALUES ($1, $2, 'group_join_request_received', $3, $4)`,
      [randomUUID(), moderatorUserId, actorUserId, groupId]
    );
  }

  async notifyGroupJoinRequestAccepted(
    recipientUserId: string,
    groupId: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, group_id)
       VALUES ($1, $2, 'group_join_request_accepted', $3)`,
      [randomUUID(), recipientUserId, groupId]
    );
  }

  private async insertActorNotification(
    kind: StoredNotificationKind,
    recipientUserId: string,
    actorUserId: string
  ): Promise<void> {
    if (recipientUserId === actorUserId) return;
    await this.pool.query(
      `INSERT INTO notifications (id, user_id, kind, actor_user_id)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), recipientUserId, kind, actorUserId]
    );
  }
}

// A row whose referenced entity is missing is dropped rather than rendered
// with a blank name. The ON DELETE CASCADE constraints make this rare, but
// the LEFT JOINs mean it is still representable.
function toNotification(row: StoredRow): Notification | undefined {
  const createdAt = row.created_at.toISOString();
  const readAt = row.read_at ? row.read_at.toISOString() : null;

  if (row.kind === 'venue_new_event') {
    if (!row.venue_id || !row.venue_name) return undefined;
    if (!row.event_id || !row.event_title || !row.event_starts_at) {
      return undefined;
    }
    return {
      kind: 'venue_new_event',
      id: row.id,
      createdAt,
      readAt,
      venueId: row.venue_id,
      venueName: row.venue_name,
      eventId: row.event_id,
      eventTitle: row.event_title,
      eventStartsAt: row.event_starts_at.toISOString()
    };
  }

  // DEC-0018: the requester's own decision notification has no actor to
  // announce - approval is encoded by actor_user_id pointing back at the
  // recipient - so it is resolved before the actor guard below.
  if (row.kind === 'group_verification_resolved') {
    if (!row.group_id || !row.group_name) return undefined;
    return {
      kind: 'group_verification_resolved',
      id: row.id,
      createdAt,
      readAt,
      groupId: row.group_id,
      groupName: row.group_name,
      approved: row.actor_user_id !== null
    };
  }

  if (row.kind === 'group_join_request_accepted') {
    if (!row.group_id || !row.group_name) return undefined;
    return {
      kind: 'group_join_request_accepted',
      id: row.id,
      createdAt,
      readAt,
      groupId: row.group_id,
      groupName: row.group_name
    };
  }

  if (row.kind === 'organizer_request_resolved') {
    if (!row.venue_id || !row.venue_name) return undefined;
    return {
      kind: 'organizer_request_resolved',
      id: row.id,
      createdAt,
      readAt,
      venueId: row.venue_id,
      venueName: row.venue_name,
      approved: row.actor_user_id !== null
    };
  }

  if (!row.actor_user_id || !row.actor_display_name) return undefined;
  const actor = {
    actorUserId: row.actor_user_id,
    actorDisplayName: row.actor_display_name,
    ...(row.actor_avatar_url ? { actorAvatarUrl: row.actor_avatar_url } : {})
  };

  if (
    row.kind === 'group_verification_received' ||
    row.kind === 'group_join_request_received'
  ) {
    if (!row.group_id || !row.group_name) return undefined;
    return {
      kind: row.kind,
      id: row.id,
      createdAt,
      readAt,
      ...actor,
      groupId: row.group_id,
      groupName: row.group_name
    };
  }

  if (row.kind === 'organizer_request_received') {
    if (!row.venue_id || !row.venue_name) return undefined;
    return {
      kind: 'organizer_request_received',
      id: row.id,
      createdAt,
      readAt,
      ...actor,
      venueId: row.venue_id,
      venueName: row.venue_name
    };
  }

  if (row.kind === 'forum_reply') {
    if (!row.event_id || !row.event_title) return undefined;
    return {
      kind: 'forum_reply',
      id: row.id,
      createdAt,
      readAt,
      ...actor,
      eventId: row.event_id,
      eventTitle: row.event_title
    };
  }

  return {
    kind: row.kind,
    id: row.id,
    createdAt,
    readAt,
    ...actor
  };
}
