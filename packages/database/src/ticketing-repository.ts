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
 * DEC-0022 §1: "An organizer cannot publish a paid event until their Connect
 * account reports `charges_enabled`." Refusal rather than a checkout that
 * fails at the card form, which is where the buyer would otherwise find out.
 */
export class OrganizerCannotAcceptPaymentsError extends Error {
  constructor() {
    super('This organizer cannot accept payments yet.');
    this.name = 'OrganizerCannotAcceptPaymentsError';
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

/** DEC-0022 §1. The organizer's Stripe Connect Express account. */
export interface StripeAccount {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements?: unknown;
}

/**
 * A checkout that has been opened but not paid. Holds its seats until
 * `expiresAt`, so an abandoned payment releases them instead of taking them
 * out of sale forever.
 */
export interface PendingOrder {
  orderId: string;
  eventId: string;
  ticketTypeId: string;
  quantity: number;
  /** What the buyer pays per ticket: organizer price plus Pulso's fee. */
  unitAmountCents: number;
  /** What the organizer set, before Pulso's fee and before Stripe's. */
  organizerPriceCents: number;
  totalCents: number;
  applicationFeeCents: number;
  stripeAccountId: string;
  ticketTypeName: string;
}

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

  // DEC-0022 §1. Connect Express.
  findStripeAccount(userId: string): Promise<StripeAccount | undefined>;
  saveStripeAccount(userId: string, stripeAccountId: string): Promise<void>;
  updateStripeStatus(
    stripeAccountId: string,
    status: {
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      requirements: unknown;
    }
  ): Promise<void>;

  /**
   * Reserves seats and opens a pending order, or throws for the same reasons
   * free issuance throws. The seats are held until the order expires, so the
   * count that decides "sold out" has to include them - a checkout that holds
   * nothing is an oversell waiting for two people to pay at once.
   */
  startPaidOrder(
    userId: string,
    ticketTypeId: string,
    quantity: number,
    applicationFeeBps: number,
    holdMinutes: number
  ): Promise<PendingOrder>;
  attachCheckoutSession(orderId: string, sessionId: string): Promise<void>;
  /**
   * Marks the order paid and issues its tickets, exactly once.
   *
   * Returns the tickets issued, or an empty array when the order was already
   * paid - which is what makes a replayed webhook harmless (DEC-0022
   * acceptance criterion 2).
   */
  completePaidOrder(
    orderId: string,
    paymentIntentId: string | undefined
  ): Promise<HeldTicket[]>;
  releaseOrder(orderId: string): Promise<boolean>;
  /**
   * Records a webhook delivery, returning false when it has been seen before.
   * The record is written before the work and in the same transaction, so a
   * redelivery cannot slip between the check and the effect.
   */
  recordWebhookEvent(eventId: string, type: string): Promise<boolean>;
  findOrderForRefund(
    organizerId: string,
    orderId: string
  ): Promise<
    | {
        stripeAccountId: string;
        paymentIntentId: string;
      }
    | undefined
  >;
  markOrderRefunded(orderId: string): Promise<void>;
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

/**
 * Issued tickets plus the seats an open checkout is holding.
 *
 * The held half is what makes a paid sale safe: between opening a Stripe
 * session and the webhook coming back, those seats are neither tickets nor
 * available, and counting only `tickets` would sell them twice. Expired holds
 * fall out of the count on their own, so an abandoned checkout releases its
 * seats without anything having to sweep it.
 */
const countIssuedAndHeld = `
  SELECT
    (
      (SELECT count(*) FROM tickets
       WHERE ticket_type_id = $1 AND status <> 'cancelled')
      + coalesce((SELECT sum(quantity) FROM ticket_orders
                  WHERE ticket_type_id = $1
                    AND status = 'pending'
                    AND expires_at > now()), 0)
    ) AS total,
    (
      (SELECT count(*) FROM tickets
       WHERE ticket_type_id = $1 AND status <> 'cancelled' AND user_id = $2)
      + coalesce((SELECT sum(quantity) FROM ticket_orders
                  WHERE ticket_type_id = $1
                    AND user_id = $2
                    AND status = 'pending'
                    AND expires_at > now()), 0)
    ) AS mine
`;

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
        countIssuedAndHeld,
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

  async findStripeAccount(userId: string): Promise<StripeAccount | undefined> {
    const result = await this.pool.query<{
      stripe_account_id: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      requirements: unknown;
    }>(
      `SELECT stripe_account_id, charges_enabled, payouts_enabled, requirements
       FROM stripe_accounts WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      stripeAccountId: row.stripe_account_id,
      chargesEnabled: row.charges_enabled,
      payoutsEnabled: row.payouts_enabled,
      ...(row.requirements !== null ? { requirements: row.requirements } : {})
    };
  }

  async saveStripeAccount(
    userId: string,
    stripeAccountId: string
  ): Promise<void> {
    // The account starts disabled whatever Stripe will later say. Defaulting
    // to enabled would let an organizer publish a paid event in the window
    // before the first status refresh.
    await this.pool.query(
      `INSERT INTO stripe_accounts (user_id, stripe_account_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET stripe_account_id = EXCLUDED.stripe_account_id,
             charges_enabled = false,
             payouts_enabled = false,
             refreshed_at = now()`,
      [userId, stripeAccountId]
    );
  }

  async updateStripeStatus(
    stripeAccountId: string,
    status: {
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      requirements: unknown;
    }
  ): Promise<void> {
    await this.pool.query(
      `UPDATE stripe_accounts
       SET charges_enabled = $2, payouts_enabled = $3,
           requirements = $4, refreshed_at = now()
       WHERE stripe_account_id = $1`,
      [
        stripeAccountId,
        status.chargesEnabled,
        status.payoutsEnabled,
        status.requirements === undefined
          ? null
          : JSON.stringify(status.requirements)
      ]
    );
  }

  /**
   * DEC-0022 §1 and §2. Opens a checkout and holds its seats.
   *
   * Same lock as free issuance, and deliberately the same refusals in the
   * same order: an organizer whose Stripe account is not enabled is refused
   * here, before the buyer ever sees a card form.
   */
  async startPaidOrder(
    userId: string,
    ticketTypeId: string,
    quantity: number,
    applicationFeeBps: number,
    holdMinutes: number
  ): Promise<PendingOrder> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<{
        id: string;
        event_id: string;
        name: string;
        price_cents: number;
        quantity: number | null;
        max_per_account: number;
        sales_open_at: Date | null;
        sales_close_at: Date | null;
        address_disclosure: string;
        organizer_id: string | null;
        stripe_account_id: string | null;
        charges_enabled: boolean | null;
      }>(
        `SELECT tt.id, tt.event_id, tt.name, tt.price_cents, tt.quantity,
                tt.max_per_account, tt.sales_open_at, tt.sales_close_at,
                e.address_disclosure, e.created_by_user_id AS organizer_id,
                sa.stripe_account_id, sa.charges_enabled
         FROM event_ticket_types tt
         JOIN events e ON e.id = tt.event_id
         LEFT JOIN stripe_accounts sa ON sa.user_id = e.created_by_user_id
         WHERE tt.id = $1
         FOR UPDATE OF tt`,
        [ticketTypeId]
      );
      const type = locked.rows[0];
      if (!type) throw new TicketSalesClosedError();
      if (type.price_cents <= 0) throw new TicketSalesClosedError();
      if (!type.stripe_account_id || type.charges_enabled !== true)
        throw new OrganizerCannotAcceptPaymentsError();

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
        countIssuedAndHeld,
        [ticketTypeId, userId]
      );
      const total = Number(counts.rows[0]?.total ?? 0);
      const mine = Number(counts.rows[0]?.mine ?? 0);
      if (type.quantity !== null && total + quantity > type.quantity)
        throw new TicketsSoldOutError();
      if (mine + quantity > type.max_per_account)
        throw new TicketLimitReachedError(type.max_per_account);

      // DEC-0022 §1: the commission is added on top of the organizer's
      // price, not taken out of it. The organizer sets 10.00 and receives
      // 10.00 less Stripe's own processing fee; the buyer sees 11.00.
      //
      // Computed per ticket rather than on the total, so unit price ×
      // quantity equals the total exactly - a receipt that does not add up is
      // a support ticket. Rounded up, so a rate is never under-collected; the
      // most that costs a buyer is one cent per ticket.
      const feePerTicketCents = Math.ceil(
        (type.price_cents * applicationFeeBps) / 10_000
      );
      const unitAmountCents = type.price_cents + feePerTicketCents;
      const totalCents = unitAmountCents * quantity;
      const applicationFeeCents = feePerTicketCents * quantity;
      const orderId = randomUUID();
      await client.query(
        `INSERT INTO ticket_orders
           (id, event_id, user_id, status, total_cents, stripe_account_id,
            application_fee_cents, ticket_type_id, quantity, expires_at)
         VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8,
                 now() + ($9 || ' minutes')::interval)`,
        [
          orderId,
          type.event_id,
          userId,
          totalCents,
          type.stripe_account_id,
          applicationFeeCents,
          ticketTypeId,
          quantity,
          String(holdMinutes)
        ]
      );
      await client.query('COMMIT');
      return {
        orderId,
        eventId: type.event_id,
        ticketTypeId,
        quantity,
        // What Stripe charges per ticket: the organizer's price plus Pulso's
        // fee. `PendingOrder.unitAmountCents` is therefore the buyer's unit
        // price, not the organizer's.
        unitAmountCents,
        organizerPriceCents: type.price_cents,
        totalCents,
        applicationFeeCents,
        stripeAccountId: type.stripe_account_id,
        ticketTypeName: type.name
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async attachCheckoutSession(
    orderId: string,
    sessionId: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE ticket_orders SET stripe_checkout_session_id = $2 WHERE id = $1`,
      [orderId, sessionId]
    );
  }

  /**
   * DEC-0022 acceptance criterion 2: a replayed or duplicated webhook issues
   * no extra ticket.
   *
   * The status transition is the guard. `WHERE status = 'pending'` means the
   * second delivery updates nothing, returns no row, and issues nothing -
   * rather than a check-then-issue that two concurrent deliveries both pass.
   */
  async completePaidOrder(
    orderId: string,
    paymentIntentId: string | undefined
  ): Promise<HeldTicket[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query<{
        event_id: string;
        user_id: string;
        ticket_type_id: string | null;
        quantity: number | null;
      }>(
        `UPDATE ticket_orders
         SET status = 'paid', paid_at = now(),
             stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id),
             expires_at = NULL
         WHERE id = $1 AND status = 'pending'
         RETURNING event_id, user_id, ticket_type_id, quantity`,
        [orderId, paymentIntentId ?? null]
      );
      const order = claimed.rows[0];
      if (!order || !order.ticket_type_id || !order.quantity) {
        await client.query('COMMIT');
        return [];
      }

      const ids: string[] = [];
      for (let issued = 0; issued < order.quantity; issued += 1) {
        const ticketId = randomUUID();
        ids.push(ticketId);
        await client.query(
          `INSERT INTO tickets
             (id, order_id, ticket_type_id, event_id, user_id, status)
           VALUES ($1, $2, $3, $4, $5, 'valid')`,
          [
            ticketId,
            orderId,
            order.ticket_type_id,
            order.event_id,
            order.user_id
          ]
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

  async releaseOrder(orderId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ticket_orders SET status = 'cancelled', expires_at = NULL
       WHERE id = $1 AND status = 'pending'`,
      [orderId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordWebhookEvent(eventId: string, type: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO stripe_webhook_events (id, type) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [eventId, type]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findOrderForRefund(
    organizerId: string,
    orderId: string
  ): Promise<{ stripeAccountId: string; paymentIntentId: string } | undefined> {
    // Joined through the event's creator, so an organizer can only refund
    // orders placed on their own events.
    const result = await this.pool.query<{
      stripe_account_id: string | null;
      stripe_payment_intent_id: string | null;
    }>(
      `SELECT o.stripe_account_id, o.stripe_payment_intent_id
       FROM ticket_orders o
       JOIN events e ON e.id = o.event_id
       WHERE o.id = $1
         AND e.created_by_user_id = $2
         AND o.status = 'paid'
         AND o.refunded_at IS NULL`,
      [orderId, organizerId]
    );
    const row = result.rows[0];
    if (!row?.stripe_account_id || !row.stripe_payment_intent_id)
      return undefined;
    return {
      stripeAccountId: row.stripe_account_id,
      paymentIntentId: row.stripe_payment_intent_id
    };
  }

  async markOrderRefunded(orderId: string): Promise<void> {
    // The tickets go with the money. A refunded ticket that still scanned
    // would admit someone who has been paid back.
    await this.pool.query(
      `UPDATE ticket_orders SET status = 'refunded', refunded_at = now()
       WHERE id = $1`,
      [orderId]
    );
    await this.pool.query(
      `UPDATE tickets SET status = 'refunded'
       WHERE order_id = $1 AND status = 'valid'`,
      [orderId]
    );
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
