import type { PublicUser } from '@pulso/contracts';
import type { Pool } from 'pg';

export type AttendanceVisibility = 'private' | 'friends';

export class EventNotFoundError extends Error {
  constructor() {
    super('This event does not exist.');
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
  // of what visibility other attendees chose.
  getFriendsAttending(viewerId: string, eventId: string): Promise<PublicUser[]>;
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

  async setAttendance(
    userId: string,
    eventId: string,
    visibility: AttendanceVisibility
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO event_attendance (user_id, event_id, visibility)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, event_id) DO UPDATE SET visibility = EXCLUDED.visibility`,
        [userId, eventId, visibility]
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new EventNotFoundError();
      throw error;
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
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      avatar_url: string | null;
    }>(
      `SELECT u.id, u.display_name, u.avatar_url
       FROM event_attendance ea
       JOIN friendships f
         ON f.status = 'accepted'
        AND ((f.requester_id = $1 AND f.addressee_id = ea.user_id)
          OR (f.addressee_id = $1 AND f.requester_id = ea.user_id))
       JOIN users u ON u.id = ea.user_id
       WHERE ea.event_id = $2 AND ea.visibility = 'friends'
       ORDER BY u.display_name ASC`,
      [viewerId, eventId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      ...(row.avatar_url !== null ? { avatarUrl: row.avatar_url } : {})
    }));
  }
}
