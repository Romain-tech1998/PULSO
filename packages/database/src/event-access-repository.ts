import type { Pool } from 'pg';

import { publicUserColumns, toPublicUser } from './public-user.js';
import type { PublicUserRow } from './public-user.js';
import type { PublicUser } from '@pulso/contracts';

/**
 * DEC-0022 §6. Asking an organizer to disclose the exact location of an event
 * they chose to withhold, and the organizer's decision on that request.
 */

export class EventNotOnApprovalError extends Error {
  constructor() {
    super('This event does not withhold its address.');
    this.name = 'EventNotOnApprovalError';
  }
}

/**
 * Raised on a second request from an account already refused.
 *
 * DEC-0022 §6 makes a decline final: without that, "no" is an invitation to
 * ask again, and the organizer of a private after ends up re-deciding the
 * same person every week.
 */
export class EventAccessDeclinedError extends Error {
  constructor() {
    super('This organizer has already declined this account.');
    this.name = 'EventAccessDeclinedError';
  }
}

export class CannotRequestOwnEventError extends Error {
  constructor() {
    super('An organizer already has the address of their own event.');
    this.name = 'CannotRequestOwnEventError';
  }
}

export type EventAccessStatus = 'pending' | 'approved' | 'declined';

export interface EventAccessRequester {
  user: PublicUser;
  status: EventAccessStatus;
  requestedAt: string;
  resolvedAt?: string;
  message?: string;
}

export interface EventAccessRepository {
  /**
   * Returns the organizer's account id, or undefined when the event does not
   * exist. Callers use it both to authorize and to address a notification.
   */
  findOrganizerId(eventId: string): Promise<string | undefined>;
  request(
    eventId: string,
    userId: string,
    message: string | undefined
  ): Promise<EventAccessStatus>;
  /** The organizer's queue for one of their own events. */
  list(eventId: string): Promise<EventAccessRequester[]>;
  /**
   * Approve or refuse. Also the revocation path: deciding 'declined' on an
   * already-approved row returns that account to the offset point.
   * Returns false when there is nothing to decide.
   */
  resolve(
    eventId: string,
    userId: string,
    decision: 'approved' | 'declined',
    resolvedBy: string
  ): Promise<boolean>;
  /** Every event of this account that still has someone waiting. */
  countPendingForOrganizer(organizerId: string): Promise<number>;
}

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export class PostgresEventAccessRepository implements EventAccessRepository {
  constructor(private readonly pool: Pool) {}

  async findOrganizerId(eventId: string): Promise<string | undefined> {
    const result = await this.pool.query<{ created_by_user_id: string | null }>(
      `SELECT created_by_user_id FROM events
       WHERE id = $1 AND address_disclosure = 'on_approval'`,
      [eventId]
    );
    return result.rows[0]?.created_by_user_id ?? undefined;
  }

  async request(
    eventId: string,
    userId: string,
    message: string | undefined
  ): Promise<EventAccessStatus> {
    const organizerId = await this.findOrganizerId(eventId);
    if (organizerId === undefined) throw new EventNotOnApprovalError();
    if (organizerId === userId) throw new CannotRequestOwnEventError();

    // ON CONFLICT DO NOTHING rather than an upsert: a row that already exists
    // is an answer, and re-asking must not overwrite it. A pending request
    // repeated is idempotent; a declined one is refused below.
    try {
      const inserted = await this.pool.query(
        `INSERT INTO event_access_requests (event_id, user_id, status, message)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (event_id, user_id) DO NOTHING`,
        [eventId, userId, message ?? null]
      );
      if ((inserted.rowCount ?? 0) > 0) return 'pending';
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }

    const existing = await this.pool.query<{ status: EventAccessStatus }>(
      `SELECT status FROM event_access_requests
       WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );
    const status = existing.rows[0]?.status;
    if (status === undefined) return 'pending';
    if (status === 'declined') throw new EventAccessDeclinedError();
    return status;
  }

  async list(eventId: string): Promise<EventAccessRequester[]> {
    const result = await this.pool.query<
      PublicUserRow & {
        status: EventAccessStatus;
        requested_at: Date;
        resolved_at: Date | null;
        message: string | null;
      }
    >(
      `SELECT ${publicUserColumns('u')}, r.status, r.requested_at,
              r.resolved_at, r.message
       FROM event_access_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.event_id = $1
       -- Whoever is still waiting comes first: the queue exists to be
       -- worked, not to be a history of decisions already taken.
       ORDER BY (r.status = 'pending') DESC, r.requested_at`,
      [eventId]
    );
    return result.rows.map((row) => ({
      user: toPublicUser(row),
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      ...(row.resolved_at !== null
        ? { resolvedAt: row.resolved_at.toISOString() }
        : {}),
      ...(row.message !== null ? { message: row.message } : {})
    }));
  }

  async resolve(
    eventId: string,
    userId: string,
    decision: 'approved' | 'declined',
    resolvedBy: string
  ): Promise<boolean> {
    // No status filter in the WHERE clause, so an approval can be revoked
    // later (DEC-0022 acceptance criterion 10). The one transition refused is
    // re-approving a declined account, which criterion 11 makes final.
    const result = await this.pool.query(
      `UPDATE event_access_requests
       SET status = $3, resolved_at = now(), resolved_by_user_id = $4
       WHERE event_id = $1 AND user_id = $2
         AND NOT (status = 'declined' AND $3 = 'approved')`,
      [eventId, userId, decision, resolvedBy]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countPendingForOrganizer(organizerId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*) AS count
       FROM event_access_requests r
       JOIN events e ON e.id = r.event_id
       WHERE e.created_by_user_id = $1 AND r.status = 'pending'`,
      [organizerId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}
