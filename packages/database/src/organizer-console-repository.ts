import type { Pool } from 'pg';

/**
 * DEC-0023 §2 and §3. The numbers an organizer sees about their own event.
 *
 * Every one of them is an aggregate. Nothing in this file returns a person,
 * and the one table it writes to - `event_view_counts` - has nowhere to put
 * one: an event, a day, a number. That is what makes counting openings
 * allowed at all (§3), so it is worth noticing if a future column here ever
 * carries an account, an address or a session.
 */

/** DEC-0023 §2. Openings, never people - the field is named for that. */
export interface EventViewCounts {
  /** Every opening ever recorded for this event. */
  total: number;
  /** Openings recorded today, Montréal time. */
  today: number;
}

export interface EventConsoleCounts {
  /**
   * DEC-0023 §2: both visibilities counted. `visibility` decides who may be
   * named, never who is counted - an aggregate discloses nobody, and an
   * organizer who cannot see a total cannot plan a room.
   */
  coming: number;
  /** Null where the organizer has set no cap, which is the default. */
  attendanceLimit: number | null;
  views: EventViewCounts;
  /** Absent on an event with no ticket type, which is most of them. */
  tickets?: { issued: number; valid: number; used: number };
  /** Absent unless the event withholds its address (DEC-0022 §6). */
  accessRequests?: { pending: number; approved: number; declined: number };
}

export interface OrganizerConsoleRepository {
  /**
   * Adds one to today's counter. Never called from a route the browser can
   * aim at directly (§3: a counter a page can increment is a counter anyone
   * can inflate).
   */
  recordEventView(eventId: string): Promise<void>;
  /**
   * The console's numbers, or undefined when this account did not create
   * this event.
   *
   * Undefined rather than a thrown "forbidden", so the route answers 404 for
   * both a missing event and somebody else's - the same reasoning as
   * DEC-0022's wallet export, where a 403 would confirm which ids exist.
   */
  getEventConsoleCounts(
    eventId: string,
    organizerId: string
  ): Promise<EventConsoleCounts | undefined>;
}

/**
 * The day a view is filed under is Montréal's, not the server's. A directory
 * for one city that rolled its counters over at UTC midnight would end a
 * Saturday night in the middle of it.
 */
const MONTREAL_TODAY = `(now() AT TIME ZONE 'America/Toronto')::date`;

export class PostgresOrganizerConsoleRepository implements OrganizerConsoleRepository {
  constructor(private readonly pool: Pool) {}

  async recordEventView(eventId: string): Promise<void> {
    // A read that fails to be counted is not worth failing the read for: the
    // caller is serving somebody an event page, and a counter is not what
    // they came for. Swallowed here rather than at each call site so no route
    // has to remember.
    try {
      await this.pool.query(
        `INSERT INTO event_view_counts (event_id, on_day, views)
         VALUES ($1, ${MONTREAL_TODAY}, 1)
         ON CONFLICT (event_id, on_day)
         DO UPDATE SET views = event_view_counts.views + 1`,
        [eventId]
      );
    } catch {
      /* counted or not, the record still gets served */
    }
  }

  async getEventConsoleCounts(
    eventId: string,
    organizerId: string
  ): Promise<EventConsoleCounts | undefined> {
    const owned = await this.pool.query<{
      attendance_limit: number | null;
      address_disclosure: string;
    }>(
      `SELECT attendance_limit, address_disclosure
       FROM events
       WHERE id = $1 AND created_by_user_id = $2`,
      [eventId, organizerId]
    );
    const event = owned.rows[0];
    if (!event) return undefined;

    const [coming, views, tickets, requests] = await Promise.all([
      this.pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM event_attendance WHERE event_id = $1`,
        [eventId]
      ),
      this.pool.query<{ total: string; today: string }>(
        `SELECT coalesce(sum(views), 0) AS total,
                coalesce(sum(views) FILTER (WHERE on_day = ${MONTREAL_TODAY}), 0) AS today
         FROM event_view_counts
         WHERE event_id = $1`,
        [eventId]
      ),
      this.pool.query<{ issued: string; valid: string; used: string }>(
        `SELECT count(*) AS issued,
                count(*) FILTER (WHERE status = 'valid') AS valid,
                count(*) FILTER (WHERE status = 'used') AS used
         FROM tickets
         WHERE event_id = $1`,
        [eventId]
      ),
      this.pool.query<{ pending: string; approved: string; declined: string }>(
        `SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
                count(*) FILTER (WHERE status = 'approved') AS approved,
                count(*) FILTER (WHERE status = 'declined') AS declined
         FROM event_access_requests
         WHERE event_id = $1`,
        [eventId]
      )
    ]);

    const issued = Number(tickets.rows[0]?.issued ?? 0);

    return {
      coming: Number(coming.rows[0]?.count ?? 0),
      attendanceLimit: event.attendance_limit,
      views: {
        total: Number(views.rows[0]?.total ?? 0),
        today: Number(views.rows[0]?.today ?? 0)
      },
      // Omitted rather than zeroed: a row of zeros invites the reader to
      // wonder why nobody bought a ticket for an event that never sold any.
      ...(issued > 0
        ? {
            tickets: {
              issued,
              valid: Number(tickets.rows[0]?.valid ?? 0),
              used: Number(tickets.rows[0]?.used ?? 0)
            }
          }
        : {}),
      ...(event.address_disclosure === 'on_approval'
        ? {
            accessRequests: {
              pending: Number(requests.rows[0]?.pending ?? 0),
              approved: Number(requests.rows[0]?.approved ?? 0),
              declined: Number(requests.rows[0]?.declined ?? 0)
            }
          }
        : {})
    };
  }
}
