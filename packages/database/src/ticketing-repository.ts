import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * DEC-0022 §2 and §3. Ticket types, issuance, and the door.
 *
 * Nothing here signs anything. The QR's secret never leaves the API
 * (DEC-0022 §3), so this layer deals in rows and states and the route layer
 * turns a row into a token. That split is also what lets issuance be tested
 * against real SQL without a signing key.
 */

export class NotTicketOrganizerError extends Error {
  constructor() {
    super('This event does not belong to this account.');
    this.name = 'NotTicketOrganizerError';
  }
}

export class TicketSalesClosedError extends Error {
  constructor() {
    super('This ticket type is not on sale right now.');
    this.name = 'TicketSalesClosedError';
  }
}

export class TicketsSoldOutError extends Error {
  constructor() {
    super('There are not enough tickets left.');
    this.name = 'TicketsSoldOutError';
  }
}

export class TicketLimitReachedError extends Error {
  constructor(public readonly maxPerAccount: number) {
    super('This account already holds the maximum for this ticket type.');
    this.name = 'TicketLimitReachedError';
  }
}

/**
 * DEC-0022 §8. Phase 2 issues free tickets only; a priced type needs the
 * Stripe work, and refusing is the honest answer until it exists.
 */
export class TicketPaymentNotAvailableError extends Error {
  constructor() {
    super('Paid ticketing is not available yet.');
    this.name = 'TicketPaymentNotAvailableError';
  }
}

/**
 * DEC-0022 §6 meeting §2: an event that withholds its address also withholds
 * admission. Claiming a ticket to a private after would otherwise be a way
 * around the organizer's decision.
 */
export class TicketAccessNotApprovedError extends Error {
  constructor() {
    super('This event admits approved attendees only.');
    this.name = 'TicketAccessNotApprovedError';
  }
}

export interface TicketTypeInput {
  name: string;
  priceCents: number;
  quantity?: number | undefined;
  maxPerAccount: number;
  salesOpenAt?: string | undefined;
  salesCloseAt?: string | undefined;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  priceCents: number;
  quantity?: number;
  maxPerAccount: number;
  salesOpenAt?: string;
  salesCloseAt?: string;
  /** Issued and not cancelled, so an organizer sees what is actually gone. */
  issuedCount: number;
}

export type TicketStatus = 'valid' | 'used' | 'refunded' | 'cancelled';

export interface HeldTicket {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  venueName: string;
  ticketTypeName: string;
  priceCents: number;
  status: TicketStatus;
  issuedAt: string;
  usedAt?: string;
}

export type RedemptionOutcome =
  | { result: 'admitted'; holderName: string; ticketTypeName: string }
  | { result: 'already_used'; holderName: string; usedAt: string }
  | { result: 'not_valid'; status: TicketStatus }
  | { result: 'wrong_event' }
  | { result: 'unknown' };

export interface TicketingRepository {
  listTicketTypes(eventId: string): Promise<TicketType[]>;
  createTicketType(
    userId: string,
    eventId: string,
    input: TicketTypeInput
  ): Promise<TicketType>;
  deleteTicketType(userId: string, ticketTypeId: string): Promise<boolean>;
  /**
   * Issues `quantity` tickets of one type to one account, or throws. Never
   * partially fulfils: three requested with two left is a refusal, not two
   * tickets and a surprise.
   */
  issueTickets(
    userId: string,
    ticketTypeId: string,
    quantity: number
  ): Promise<HeldTicket[]>;
  listMyTickets(userId: string): Promise<HeldTicket[]>;
  findTicketById(ticketId: string): Promise<HeldTicket | undefined>;
  /** The organizer's door: admits, or says precisely why not. */
  redeem(
    ticketId: string,
    eventId: string,
    scannerUserId: string
  ): Promise<RedemptionOutcome>;
  isEventOrganizer(eventId: string, userId: string): Promise<boolean>;
  countAdmissions(eventId: string): Promise<{ used: number; valid: number }>;
}

interface TicketTypeRow {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  quantity: number | null;
  max_per_account: number;
  sales_open_at: Date | null;
  sales_close_at: Date | null;
  issued_count: string;
}

function toTicketType(row: TicketTypeRow): TicketType {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    ...(row.quantity !== null ? { quantity: row.quantity } : {}),
    maxPerAccount: row.max_per_account,
    ...(row.sales_open_at !== null
      ? { salesOpenAt: row.sales_open_at.toISOString() }
      : {}),
    ...(row.sales_close_at !== null
      ? { salesCloseAt: row.sales_close_at.toISOString() }
      : {}),
    issuedCount: Number(row.issued_count)
  };
}

interface HeldTicketRow {
  id: string;
  event_id: string;
  event_title: string;
  event_starts_at: Date;
  venue_name: string;
  ticket_type_name: string;
  price_cents: number;
  status: TicketStatus;
  issued_at: Date;
  used_at: Date | null;
}

function toHeldTicket(row: HeldTicketRow): HeldTicket {
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventStartsAt: row.event_starts_at.toISOString(),
    venueName: row.venue_name,
    ticketTypeName: row.ticket_type_name,
    priceCents: row.price_cents,
    status: row.status,
    issuedAt: row.issued_at.toISOString(),
    ...(row.used_at !== null ? { usedAt: row.used_at.toISOString() } : {})
  };
}

const heldTicketSelect = `
  SELECT t.id, t.event_id, e.title AS event_title, e.starts_at AS event_starts_at,
         v.name AS venue_name, tt.name AS ticket_type_name,
         tt.price_cents, t.status, t.issued_at, t.used_at
  FROM tickets t
  JOIN events e ON e.id = t.event_id
  JOIN venues v ON v.id = e.venue_id
  JOIN event_ticket_types tt ON tt.id = t.ticket_type_id
`;

export class PostgresTicketingRepository implements TicketingRepository {
  constructor(private readonly pool: Pool) {}

  async isEventOrganizer(eventId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM events
       WHERE id = $1 AND created_by_user_id = $2 AND origin <> 'directory'`,
      [eventId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTicketTypes(eventId: string): Promise<TicketType[]> {
    const result = await this.pool.query<TicketTypeRow>(
      `SELECT tt.*, (
         SELECT count(*) FROM tickets t
         WHERE t.ticket_type_id = tt.id AND t.status <> 'cancelled'
       ) AS issued_count
       FROM event_ticket_types tt
       WHERE tt.event_id = $1
       ORDER BY tt.price_cents, tt.created_at`,
      [eventId]
    );
    return result.rows.map(toTicketType);
  }

  async createTicketType(
    userId: string,
    eventId: string,
    input: TicketTypeInput
  ): Promise<TicketType> {
    if (!(await this.isEventOrganizer(eventId, userId)))
      throw new NotTicketOrganizerError();
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO event_ticket_types
         (id, event_id, name, price_cents, quantity, max_per_account,
          sales_open_at, sales_close_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        eventId,
        input.name,
        input.priceCents,
        input.quantity ?? null,
        input.maxPerAccount,
        input.salesOpenAt ?? null,
        input.salesCloseAt ?? null
      ]
    );
    const created = await this.pool.query<TicketTypeRow>(
      `SELECT tt.*, 0 AS issued_count FROM event_ticket_types tt WHERE tt.id = $1`,
      [id]
    );
    return toTicketType(created.rows[0]!);
  }

  async deleteTicketType(
    userId: string,
    ticketTypeId: string
  ): Promise<boolean> {
    // Only while nothing has been issued. Deleting a type with live tickets
    // would cascade them away and turn somebody's admission into a 404 at
    // the door.
    const result = await this.pool.query(
      `DELETE FROM event_ticket_types tt
       USING events e
       WHERE tt.id = $1
         AND e.id = tt.event_id
         AND e.created_by_user_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM tickets t
           WHERE t.ticket_type_id = tt.id AND t.status <> 'cancelled'
         )`,
      [ticketTypeId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * DEC-0022 §2: "Quantity is enforced when the ticket is issued, not when
   * checkout opens. Overselling is prevented in the database."
   *
   * The ticket type row is locked FOR UPDATE for the length of the
   * transaction, so two accounts claiming the last seat at the same instant
   * are serialised by PostgreSQL rather than by an application that counted
   * first and inserted afterwards. Counting outside a lock is exactly how an
   * oversell happens, and it happens under precisely the load that matters.
   */
  async issueTickets(
    userId: string,
    ticketTypeId: string,
    quantity: number
  ): Promise<HeldTicket[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const locked = await client.query<{
        id: string;
        event_id: string;
        price_cents: number;
        quantity: number | null;
        max_per_account: number;
        sales_open_at: Date | null;
        sales_close_at: Date | null;
        address_disclosure: string;
        organizer_id: string | null;
      }>(
        `SELECT tt.id, tt.event_id, tt.price_cents, tt.quantity,
                tt.max_per_account, tt.sales_open_at, tt.sales_close_at,
                e.address_disclosure, e.created_by_user_id AS organizer_id
         FROM event_ticket_types tt
         JOIN events e ON e.id = tt.event_id
         WHERE tt.id = $1
         FOR UPDATE OF tt`,
        [ticketTypeId]
      );
      const type = locked.rows[0];
      if (!type) throw new TicketSalesClosedError();

      if (type.price_cents > 0) throw new TicketPaymentNotAvailableError();

      const now = new Date();
      if (type.sales_open_at && now < type.sales_open_at)
        throw new TicketSalesClosedError();
      if (type.sales_close_at && now > type.sales_close_at)
        throw new TicketSalesClosedError();

      if (
        type.address_disclosure !== 'public' &&
        type.organizer_id !== userId
      ) {
        const approved = await client.query(
          `SELECT 1 FROM event_access_requests
           WHERE event_id = $1 AND user_id = $2 AND status = 'approved'`,
          [type.event_id, userId]
        );
        if ((approved.rowCount ?? 0) === 0)
          throw new TicketAccessNotApprovedError();
      }

      const counts = await client.query<{ total: string; mine: string }>(
        `SELECT
           count(*) FILTER (WHERE status <> 'cancelled') AS total,
           count(*) FILTER (WHERE status <> 'cancelled' AND user_id = $2) AS mine
         FROM tickets WHERE ticket_type_id = $1`,
        [ticketTypeId, userId]
      );
      const total = Number(counts.rows[0]?.total ?? 0);
      const mine = Number(counts.rows[0]?.mine ?? 0);

      if (type.quantity !== null && total + quantity > type.quantity)
        throw new TicketsSoldOutError();
      if (mine + quantity > type.max_per_account)
        throw new TicketLimitReachedError(type.max_per_account);

      const orderId = randomUUID();
      await client.query(
        `INSERT INTO ticket_orders
           (id, event_id, user_id, status, total_cents, paid_at)
         VALUES ($1, $2, $3, 'paid', 0, now())`,
        [orderId, type.event_id, userId]
      );

      const ids: string[] = [];
      for (let issued = 0; issued < quantity; issued += 1) {
        const ticketId = randomUUID();
        ids.push(ticketId);
        await client.query(
          `INSERT INTO tickets
             (id, order_id, ticket_type_id, event_id, user_id, status)
           VALUES ($1, $2, $3, $4, $5, 'valid')`,
          [ticketId, orderId, ticketTypeId, type.event_id, userId]
        );
      }

      const created = await client.query<HeldTicketRow>(
        `${heldTicketSelect} WHERE t.id = ANY($1::uuid[]) ORDER BY t.issued_at`,
        [ids]
      );
      await client.query('COMMIT');
      return created.rows.map(toHeldTicket);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listMyTickets(userId: string): Promise<HeldTicket[]> {
    const result = await this.pool.query<HeldTicketRow>(
      `${heldTicketSelect}
       WHERE t.user_id = $1 AND t.status <> 'cancelled'
       ORDER BY e.starts_at DESC`,
      [userId]
    );
    return result.rows.map(toHeldTicket);
  }

  async findTicketById(ticketId: string): Promise<HeldTicket | undefined> {
    const result = await this.pool.query<HeldTicketRow>(
      `${heldTicketSelect} WHERE t.id = $1`,
      [ticketId]
    );
    const row = result.rows[0];
    return row ? toHeldTicket(row) : undefined;
  }

  /**
   * DEC-0022 §3: redemption is authoritative here, because only the server
   * can know that a ticket has already been used.
   *
   * The transition to 'used' is a conditional UPDATE, not a read followed by
   * a write: two doors scanning the same QR at the same moment must produce
   * one admission and one refusal, and a check-then-set produces two
   * admissions often enough to matter at a busy entrance.
   */
  async redeem(
    ticketId: string,
    eventId: string,
    scannerUserId: string
  ): Promise<RedemptionOutcome> {
    const admitted = await this.pool.query<{
      holder_name: string;
      ticket_type_name: string;
    }>(
      `UPDATE tickets t
       SET status = 'used', used_at = now(), used_by_user_id = $3
       FROM users u, event_ticket_types tt
       WHERE t.id = $1
         AND t.event_id = $2
         AND t.status = 'valid'
         AND u.id = t.user_id
         AND tt.id = t.ticket_type_id
       RETURNING u.display_name AS holder_name, tt.name AS ticket_type_name`,
      [ticketId, eventId, scannerUserId]
    );
    const row = admitted.rows[0];
    if (row) {
      return {
        result: 'admitted',
        holderName: row.holder_name,
        ticketTypeName: row.ticket_type_name
      };
    }

    // Nothing was admitted, so say precisely why. A door needs to tell a
    // duplicate apart from a wrong night.
    const existing = await this.pool.query<{
      event_id: string;
      status: TicketStatus;
      used_at: Date | null;
      holder_name: string;
    }>(
      `SELECT t.event_id, t.status, t.used_at, u.display_name AS holder_name
       FROM tickets t JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [ticketId]
    );
    const ticket = existing.rows[0];
    if (!ticket) return { result: 'unknown' };
    if (ticket.event_id !== eventId) return { result: 'wrong_event' };
    if (ticket.status === 'used') {
      return {
        result: 'already_used',
        holderName: ticket.holder_name,
        usedAt: (ticket.used_at ?? new Date()).toISOString()
      };
    }
    return { result: 'not_valid', status: ticket.status };
  }

  async countAdmissions(
    eventId: string
  ): Promise<{ used: number; valid: number }> {
    const result = await this.pool.query<{ used: string; valid: string }>(
      `SELECT count(*) FILTER (WHERE status = 'used') AS used,
              count(*) FILTER (WHERE status = 'valid') AS valid
       FROM tickets WHERE event_id = $1`,
      [eventId]
    );
    return {
      used: Number(result.rows[0]?.used ?? 0),
      valid: Number(result.rows[0]?.valid ?? 0)
    };
  }
}
