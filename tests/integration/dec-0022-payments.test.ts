import { randomUUID } from 'node:crypto';

import {
  createPool,
  OrganizerCannotAcceptPaymentsError,
  PostgresEventRepository,
  PostgresTicketingRepository,
  TicketsSoldOutError
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0022 §1, against real SQL and without a Stripe key.
 *
 * Everything that can go expensively wrong in a payment integration lives in
 * the database rather than in the API calls: whether a replayed webhook
 * issues a second ticket, whether an open checkout holds its seats, whether
 * an abandoned one gives them back. None of that needs Stripe to be
 * exercised, and all of it needs real transactions.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0022 paid ticketing', () => {
  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let tickets: PostgresTicketingRepository;

  const organizerId = randomUUID();
  const buyerId = randomUUID();
  const otherBuyerId = randomUUID();
  const userIds = [organizerId, buyerId, otherBuyerId];
  const stripeAccountId = `acct_test_${randomUUID().slice(0, 8)}`;

  let eventId: string;
  let venueId: string;

  const createUser = async (id: string, name: string) => {
    await pool.query(
      `INSERT INTO users (id, email, display_name, google_subject, friend_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        `${id}@integration.test`,
        name,
        `integration-${id}`,
        id.replaceAll('-', '').slice(0, 10).toUpperCase()
      ]
    );
  };

  const paidType = async (
    name: string,
    priceCents: number,
    quantity?: number,
    maxPerAccount = 4
  ) =>
    tickets.createTicketType(organizerId, eventId, {
      name,
      priceCents,
      ...(quantity !== undefined ? { quantity } : {}),
      maxPerAccount
    });

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    events = new PostgresEventRepository(pool);
    tickets = new PostgresTicketingRepository(pool);
    for (const id of userIds)
      await createUser(id, `Payments ${id.slice(0, 8)}`);

    const created = await events.createEvent(organizerId, {
      title: 'Soirée payante',
      category: 'nightlife',
      startsAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
      accessInformation: 'Billet requis.',
      isAfter: false,
      price: { kind: 'paid', minimumAmount: 15 },
      venue: {
        kind: 'new',
        name: 'Salle payante',
        address: '77 rue Payante, Montréal',
        point: { longitude: -73.56, latitude: 45.53 }
      }
    });
    eventId = created.id;
    venueId = created.venue.id;
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM stripe_webhook_events WHERE id LIKE 'evt_it_%'`
    );
    await pool.query(
      `DELETE FROM events WHERE created_by_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM venues WHERE id = $1`, [venueId]);
    await pool.query(
      `DELETE FROM stripe_accounts WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('refuses a checkout while the organizer cannot accept payments', async () => {
    const type = await paidType('Prévente', 2000, 10);
    // No Stripe account at all.
    await expect(
      tickets.startPaidOrder(buyerId, type.id, 1, 0, 20)
    ).rejects.toBeInstanceOf(OrganizerCannotAcceptPaymentsError);

    // Connected but not yet enabled: still refused. DEC-0022 §1 takes
    // Stripe's own answer rather than "did they finish the form", because an
    // organizer can complete onboarding and remain disabled.
    await tickets.saveStripeAccount(organizerId, stripeAccountId);
    await expect(
      tickets.startPaidOrder(buyerId, type.id, 1, 0, 20)
    ).rejects.toBeInstanceOf(OrganizerCannotAcceptPaymentsError);

    await tickets.updateStripeStatus(stripeAccountId, {
      chargesEnabled: true,
      payoutsEnabled: true,
      requirements: null
    });
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);
    expect(order.totalCents).toBe(2000);
  });

  it('adds the commission on top of the price rather than taking it out', async () => {
    // DEC-0022 §1, the model the product owner chose: Clébard sets 10.00 and
    // receives 10.00 (less Stripe's own cut); the buyer sees 11.00.
    const type = await paidType('Commission', 1000, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 1000, 20);
    expect(order.organizerPriceCents).toBe(1000);
    expect(order.unitAmountCents).toBe(1100);
    expect(order.applicationFeeCents).toBe(100);
    expect(order.totalCents).toBe(1100);
  });

  it('rounds the fee per ticket, so unit price times quantity is the total', async () => {
    // 10% of 19.99 is 1.999: rounded up to 2.00 per ticket, never
    // under-collected, and the receipt adds up. Computing on the total
    // instead would quote a unit price that does not multiply out.
    const type = await paidType('Arrondi', 1999, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 2, 1000, 20);
    expect(order.unitAmountCents).toBe(2199);
    expect(order.applicationFeeCents).toBe(400);
    expect(order.totalCents).toBe(order.unitAmountCents * 2);
  });

  it('charges nothing extra while the rate is zero', async () => {
    // The default. Nothing changes for anyone until a rate is decided
    // (DEC-0022 §8).
    const type = await paidType('Sans commission', 1500, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);
    expect(order.unitAmountCents).toBe(1500);
    expect(order.applicationFeeCents).toBe(0);
  });

  it('holds the seats an open checkout is waiting on', async () => {
    const type = await paidType('Dernière place', 1000, 1);
    await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);

    // The seat is neither a ticket nor available. Counting only issued
    // tickets here would let a second buyer reach Stripe and pay for a seat
    // that cannot be issued.
    await expect(
      tickets.startPaidOrder(otherBuyerId, type.id, 1, 0, 20)
    ).rejects.toBeInstanceOf(TicketsSoldOutError);
  });

  it('gives the seats back when a checkout expires', async () => {
    const type = await paidType('Abandonnée', 1000, 1);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);

    await expect(
      tickets.startPaidOrder(otherBuyerId, type.id, 1, 0, 20)
    ).rejects.toBeInstanceOf(TicketsSoldOutError);

    // What the checkout.session.expired webhook does.
    expect(await tickets.releaseOrder(order.orderId)).toBe(true);
    const second = await tickets.startPaidOrder(
      otherBuyerId,
      type.id,
      1,
      0,
      20
    );
    expect(second.quantity).toBe(1);
  });

  it('releases a hold that simply timed out, with nothing sweeping it', async () => {
    const type = await paidType('Périmée', 1000, 1);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);
    await pool.query(
      `UPDATE ticket_orders SET expires_at = now() - interval '1 minute'
       WHERE id = $1`,
      [order.orderId]
    );
    // Expired holds fall out of the count on their own: no cron, nothing to
    // forget to run.
    const second = await tickets.startPaidOrder(
      otherBuyerId,
      type.id,
      1,
      0,
      20
    );
    expect(second.quantity).toBe(1);
  });

  it('issues the tickets once, however often the webhook is delivered', async () => {
    const type = await paidType('Idempotence', 1500, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 2, 0, 20);

    const first = await tickets.completePaidOrder(order.orderId, 'pi_test_1');
    expect(first).toHaveLength(2);

    // DEC-0022 acceptance criterion 2. Stripe redelivers on its own retry
    // schedule and whenever a response is slow; the second delivery must
    // change nothing.
    const replay = await tickets.completePaidOrder(order.orderId, 'pi_test_1');
    expect(replay).toEqual([]);

    const stored = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM tickets WHERE order_id = $1`,
      [order.orderId]
    );
    expect(Number(stored.rows[0]?.count)).toBe(2);
  });

  it('issues once even when two deliveries land together', async () => {
    const type = await paidType('Course', 1500, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);
    const [left, right] = await Promise.all([
      tickets.completePaidOrder(order.orderId, 'pi_test_2'),
      tickets.completePaidOrder(order.orderId, 'pi_test_2')
    ]);
    expect(left.length + right.length).toBe(1);
  });

  it('records a webhook delivery exactly once', async () => {
    const id = `evt_it_${randomUUID().slice(0, 8)}`;
    expect(
      await tickets.recordWebhookEvent(id, 'checkout.session.completed')
    ).toBe(true);
    expect(
      await tickets.recordWebhookEvent(id, 'checkout.session.completed')
    ).toBe(false);
  });

  it('takes the tickets back with the money on a refund', async () => {
    const type = await paidType('Remboursée', 1500, 10);
    const order = await tickets.startPaidOrder(buyerId, type.id, 1, 0, 20);
    await tickets.completePaidOrder(order.orderId, 'pi_test_3');

    const refundable = await tickets.findOrderForRefund(
      organizerId,
      order.orderId
    );
    expect(refundable?.paymentIntentId).toBe('pi_test_3');
    // Only the organizer of the event may refund its orders.
    expect(
      await tickets.findOrderForRefund(otherBuyerId, order.orderId)
    ).toBeUndefined();

    await tickets.markOrderRefunded(order.orderId);
    const after = await pool.query<{ status: string }>(
      `SELECT status FROM tickets WHERE order_id = $1`,
      [order.orderId]
    );
    // A refunded ticket that still scanned would admit someone who has been
    // paid back.
    expect(after.rows.map((row) => row.status)).toEqual(['refunded']);
    expect(
      await tickets.findOrderForRefund(organizerId, order.orderId)
    ).toBeUndefined();
  });
});
