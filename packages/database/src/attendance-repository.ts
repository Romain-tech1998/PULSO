import type { PublicUser } from '@pulso/contracts';
import type { Pool } from 'pg';

import {
  publicUserColumns,
  toPublicUser,
  type PublicUserRow
} from './public-user.js';

/**
 * Who may know this account is going. Per event, never a profile setting:
 * saying yes publicly to one night is not saying yes to every night.
 */
export type AttendanceVisibility = 'private' | 'friends' | 'public';

export class EventNotFoundError extends Error {
  constructor() {
    super('This event does not exist.');
  }
}

/** DEC-0023 §4: the attendance limit is reached and this account is not in. */
export class EventFullError extends Error {
  constructor() {
    super('This event has reached its attendance limit.');
  }
}

export interface AttendanceRepository {
  setAttendance(
    userId: string,
    eventId: string,
    visibility: AttendanceVisibility
  ): Promise<void>;
  clearAttendance(userId: string, eventId: string): Promise<void>;
  getMyAttendance(
    userId: string
  ): Promise<Array<{ eventId: string; visibility: AttendanceVisibility }>>;
  // Only ever returns friends of `viewerId` - never a stranger, regardless
  // of what visibility other attendees chose. A friend who chose 'public' is
  // included: public is strictly wider than friends, never narrower.
  getFriendsAttending(viewerId: string, eventId: string): Promise<PublicUser[]>;
  /**
   * The accounts who chose to be named to everyone for this event.
   *
   * Takes no viewer, and that is the point: the answer is the same for a
   * signed-out reader as for a friend, because 'public' was described to the
   * account choosing it as "tout le monde saura que tu participes". Nothing
   * else in this repository names a person without a viewer.
   */
  getPublicAttendees(eventId: string): Promise<PublicUser[]>;
  // Real total attendance per event (both visibilities counted - only an
  // aggregate number is exposed, never who) - the Événements page's "🔥"
  // signal (Phase 4.11), batched for a whole grid of events in one query.
  getAttendanceCountsForEvents(
    eventIds: string[]
  ): Promise<Map<string, number>>;
  // Same privacy semantics as getFriendsAttending above (accepted friends
  // only, visibility='friends' rows only), just batched across many events
  // for the Événements page's grid avatars + "Tes amis y vont" widget.
  getFriendsAttendingForEvents(
    viewerId: string,
    eventIds: string[]
  ): Promise<Map<string, PublicUser[]>>;
  // "Événements en commun" (Phase 4.15) - real events both accounts attend.
  // The viewer's own row counts regardless of visibility (it's their own
  // attendance, they already know it); the friend's row must be
  // visibility='friends' - same privacy rule as getFriendsAttending, just
  // applied to one specific friend instead of "anyone attending this event".
  getMutualEventIds(viewerId: string, friendId: string): Promise<string[]>;
  // "Amis sur la carte" (Phase 4.15) - every accepted friend's real,
  // upcoming, friends-visible attendance, for plotting real venues on a
  // map. Never a live/last-known position - there is no such data.
  getFriendsUpcomingAttendance(
    viewerId: string
  ): Promise<Array<{ friend: PublicUser; eventId: string }>>;
}

const FOREIGN_KEY_VIOLATION = '23503';

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  );
}

export class PostgresAttendanceRepository implements AttendanceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * DEC-0023 §4. The attendance limit, applied here rather than by a
   * constraint.
   *
   * The event row is locked for the length of the transaction, so two
   * accounts taking the last place at the same instant are serialised by
   * PostgreSQL instead of by an application that counted first and inserted
   * afterwards - the same reasoning, and the same shape, as DEC-0022's ticket
   * quantity.
   *
   * Two things the cap deliberately does not do. It never blocks an account
   * that is already coming from changing its visibility, which is a different
   * action that happens to touch the same row. And it is not a CHECK: the
   * limit can be lowered below the number already committed, and when it is,
   * nobody is evicted and nothing here complains. That asymmetry is the whole
   * rule - a limit governs who may join, never who already has.
   */
  async setAttendance(
    userId: string,
    eventId: string,
    visibility: AttendanceVisibility
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{
        attendance_limit: number | null;
        ticketed: boolean;
      }>(
        `SELECT e.attendance_limit,
                EXISTS (
                  SELECT 1 FROM event_ticket_types tt WHERE tt.event_id = e.id
                ) AS ticketed
         FROM events e
         WHERE e.id = $1
         FOR UPDATE`,
        [eventId]
      );
      const event = locked.rows[0];
      if (!event) throw new EventNotFoundError();

      // A ticketed event answers "is there room" with its ticket quantity
      // (DEC-0022 §2). Two caps on one event is two answers to one question,
      // so the limit does not apply where tickets exist.
      if (event.attendance_limit !== null && !event.ticketed) {
        const counted = await client.query<{ total: string; mine: string }>(
          `SELECT count(*) AS total,
                  count(*) FILTER (WHERE user_id = $2) AS mine
           FROM event_attendance
           WHERE event_id = $1`,
          [eventId, userId]
        );
        const row = counted.rows[0];
        const total = Number(row?.total ?? 0);
        const mine = Number(row?.mine ?? 0);
        if (mine === 0 && total >= event.attendance_limit) {
          throw new EventFullError();
        }
      }

      await client.query(
        `INSERT INTO event_attendance (user_id, event_id, visibility)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, event_id) DO UPDATE SET visibility = EXCLUDED.visibility`,
        [userId, eventId, visibility]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
    } finally {
      client.release();
    }
  }

  async clearAttendance(userId: string, eventId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM event_attendance WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId]
    );
  }

  async getMyAttendance(
    userId: string
  ): Promise<Array<{ eventId: string; visibility: AttendanceVisibility }>> {
    const result = await this.pool.query<{
      event_id: string;
      visibility: AttendanceVisibility;
    }>(`SELECT event_id, visibility FROM event_attendance WHERE user_id = $1`, [
      userId
    ]);
    return result.rows.map((row) => ({
      eventId: row.event_id,
      visibility: row.visibility
    }));
  }

  async getFriendsAttending(
    viewerId: string,
    eventId: string
  ): Promise<PublicUser[]> {
    const result = await this.pool.query<PublicUserRow>(
      `SELECT ${publicUserColumns('u')}
       FROM event_attendance ea
       JOIN friendships f
         ON f.status = 'accepted'
        AND ((f.requester_id = $1 AND f.addressee_id = ea.user_id)
          OR (f.addressee_id = $1 AND f.requester_id = ea.user_id))
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = $2
         AND ea.visibility IN ('friends', 'public')
       ORDER BY u.display_name ASC`,
      [viewerId, eventId]
    );
    return result.rows.map(toPublicUser);
  }

  async getPublicAttendees(eventId: string): Promise<PublicUser[]> {
    const result = await this.pool.query<PublicUserRow>(
      `SELECT ${publicUserColumns('u')}
       FROM event_attendance ea
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = $1 AND ea.visibility = 'public'
       ORDER BY u.display_name ASC`,
      [eventId]
    );
    return result.rows.map(toPublicUser);
  }

  async getAttendanceCountsForEvents(
    eventIds: string[]
  ): Promise<Map<string, number>> {
    if (eventIds.length === 0) return new Map();
    const result = await this.pool.query<{ event_id: string; count: string }>(
      `SELECT event_id, COUNT(*) AS count
       FROM event_attendance
       WHERE event_id = ANY($1::uuid[])
       GROUP BY event_id`,
      [eventIds]
    );
    return new Map(result.rows.map((row) => [row.event_id, Number(row.count)]));
  }

  async getFriendsAttendingForEvents(
    viewerId: string,
    eventIds: string[]
  ): Promise<Map<string, PublicUser[]>> {
    if (eventIds.length === 0) return new Map();
    const result = await this.pool.query<PublicUserRow & { event_id: string }>(
      `SELECT ea.event_id, ${publicUserColumns('u')}
       FROM event_attendance ea
       JOIN friendships f
         ON f.status = 'accepted'
        AND ((f.requester_id = $1 AND f.addressee_id = ea.user_id)
          OR (f.addressee_id = $1 AND f.requester_id = ea.user_id))
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = ANY($2::uuid[]) AND ea.visibility = 'friends'
       ORDER BY u.display_name ASC`,
      [viewerId, eventIds]
    );
    const byEvent = new Map<string, PublicUser[]>();
    for (const row of result.rows) {
      const friend = toPublicUser(row);
      const existing = byEvent.get(row.event_id);
      if (existing) existing.push(friend);
      else byEvent.set(row.event_id, [friend]);
    }
    return byEvent;
  }

  async getMutualEventIds(
    viewerId: string,
    friendId: string
  ): Promise<string[]> {
    const result = await this.pool.query<{ event_id: string }>(
      `SELECT ea1.event_id
       FROM event_attendance ea1
       JOIN event_attendance ea2 ON ea2.event_id = ea1.event_id
       WHERE ea1.user_id = $1 AND ea2.user_id = $2 AND ea2.visibility = 'friends'`,
      [viewerId, friendId]
    );
    return result.rows.map((row) => row.event_id);
  }

  async getFriendsUpcomingAttendance(
    viewerId: string
  ): Promise<Array<{ friend: PublicUser; eventId: string }>> {
    const result = await this.pool.query<PublicUserRow & { event_id: string }>(
      `SELECT ea.event_id, ${publicUserColumns('u')}
       FROM event_attendance ea
       JOIN users u ON u.id = ea.user_id
       JOIN events e ON e.id = ea.event_id
       JOIN friendships f
         ON f.status = 'accepted'
        AND ((f.requester_id = $1 AND f.addressee_id = ea.user_id)
          OR (f.addressee_id = $1 AND f.requester_id = ea.user_id))
       WHERE ea.visibility = 'friends' AND e.starts_at > now()
       ORDER BY e.starts_at ASC`,
      [viewerId]
    );
    return result.rows.map((row) => ({
      friend: toPublicUser(row),
      eventId: row.event_id
    }));
  }
}
