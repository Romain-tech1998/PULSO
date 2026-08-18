import { randomUUID } from 'node:crypto';

import {
  createPool,
  PostgresEventAccessRepository,
  PostgresEventRepository,
  PostgresTicketingRepository,
  TicketAccessNotApprovedError,
  TicketLimitReachedError,
  TicketPaymentNotAvailableError,
  TicketSalesClosedError,
  TicketsSoldOutError
} from '@pulso/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * DEC-0022 §2 and §3, against real SQL.
 *
 * Two of these cannot be written any other way. "Quantity is enforced in the
 * database, not by an interface that counted" (§2) is a claim about what
 * happens when two clients race, and a fake repository races with nobody.
 * The same goes for a QR scanned at two doors at once: the guarantee is a
 * conditional UPDATE, and only PostgreSQL can be asked whether it holds.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DEC-0022 ticketing', () => {
  let pool: ReturnType<typeof createPool>;
  let events: PostgresEventRepository;
  let tickets: PostgresTicketingRepository;
  let access: PostgresEventAccessRepository;

  const organizerId = randomUUID();
  const holderId = randomUUID();
  const scannerId = organizerId;
  const claimants = Array.from({ length: 8 }, () => randomUUID());
  const userIds = [organizerId, holderId, ...claimants];

  let publicEventId: string;
  let publicVenueId: string;
  let privateEventId: string;
  let privateVenueId: string;

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

  const createEvent = async (disclosure: 'public' | 'on_approval') => {
    const created = await events.createEvent(organizerId, {
      title: `Billetterie ${disclosure}`,
      category: 'nightlife',
      startsAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
      accessInformation: 'Présente ton QR.',
      isAfter: false,
      addressDisclosure: disclosure,
      price: { kind: 'free' },
      venue: {
        kind: 'new',
        name: `Salle ${disclosure}`,
        address: `${disclosure} 12 rue Test, Montréal`,
        point: { longitude: -73.57, latitude: 45.52 }
      }
    });
    return created;
  };

  beforeAll(async () => {
    pool = createPool(databaseUrl);
    events = new PostgresEventRepository(pool);
    tickets = new PostgresTicketingRepository(pool);
    access = new PostgresEventAccessRepository(pool);
    for (const id of userIds)
      await createUser(id, `Ticketing ${id.slice(0, 8)}`);

    const publicEvent = await createEvent('public');
    publicEventId = publicEvent.id;
    publicVenueId = publicEvent.venue.id;
    const privateEvent = await createEvent('on_approval');
    privateEventId = privateEvent.id;
    privateVenueId = privateEvent.venue.id;
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM event_access_requests WHERE event_id = ANY($1::uuid[])`,
      [[publicEventId, privateEventId]]
    );
    await pool.query(
      `DELETE FROM events WHERE created_by_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    await pool.query(`DELETE FROM venues WHERE id = ANY($1::uuid[])`, [
      [publicVenueId, privateVenueId]
    ]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('issues free tickets with no Stripe object involved', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Entrée libre',
      priceCents: 0,
      maxPerAccount: 2
    });

    const issued = await tickets.issueTickets(holderId, type.id, 2);
    expect(issued).toHaveLength(2);
    expect(issued[0]?.status).toBe('valid');
    expect(issued[0]?.priceCents).toBe(0);

    // Acceptance criterion 3: no Stripe object created. The order exists,
    // and carries no session and no payment intent.
    const orders = await pool.query<{
      stripe_checkout_session_id: string | null;
      stripe_payment_intent_id: string | null;
      total_cents: number;
    }>(
      `SELECT stripe_checkout_session_id, stripe_payment_intent_id, total_cents
       FROM ticket_orders WHERE user_id = $1`,
      [holderId]
    );
    expect(orders.rows[0]?.stripe_checkout_session_id).toBeNull();
    expect(orders.rows[0]?.stripe_payment_intent_id).toBeNull();
    expect(orders.rows[0]?.total_cents).toBe(0);
  });

  it('refuses a priced ticket type until the Stripe work exists', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Prévente',
      priceCents: 1500,
      maxPerAccount: 2
    });
    await expect(
      tickets.issueTickets(holderId, type.id, 1)
    ).rejects.toBeInstanceOf(TicketPaymentNotAvailableError);
  });

  it('never oversells, even when every claim lands at once', async () => {
    // Acceptance criterion 4, and the only test here that could not be
    // written against a fake. Eight accounts claim one seat each from a pool
    // of three, concurrently: an implementation that counts and then inserts
    // hands out eight.
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Trois places',
      priceCents: 0,
      quantity: 3,
      maxPerAccount: 1
    });

    const outcomes = await Promise.allSettled(
      claimants.map((claimant) => tickets.issueTickets(claimant, type.id, 1))
    );
    const granted = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled'
    );
    const refused = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(granted).toHaveLength(3);
    expect(refused).toHaveLength(5);
    for (const outcome of refused) {
      expect((outcome as PromiseRejectedResult).reason).toBeInstanceOf(
        TicketsSoldOutError
      );
    }

    const stored = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM tickets WHERE ticket_type_id = $1`,
      [type.id]
    );
    expect(Number(stored.rows[0]?.count)).toBe(3);
  });

  it('refuses a partial fulfilment rather than handing out fewer', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Deux places',
      priceCents: 0,
      quantity: 2,
      maxPerAccount: 4
    });
    // Three asked for, two left: a refusal, not two tickets and a surprise
    // at the door for the third person.
    await expect(
      tickets.issueTickets(holderId, type.id, 3)
    ).rejects.toBeInstanceOf(TicketsSoldOutError);
    const stored = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM tickets WHERE ticket_type_id = $1`,
      [type.id]
    );
    expect(Number(stored.rows[0]?.count)).toBe(0);
  });

  it('enforces the per-account limit across separate claims', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Deux par compte',
      priceCents: 0,
      maxPerAccount: 2
    });
    await tickets.issueTickets(holderId, type.id, 1);
    await tickets.issueTickets(holderId, type.id, 1);
    await expect(
      tickets.issueTickets(holderId, type.id, 1)
    ).rejects.toBeInstanceOf(TicketLimitReachedError);
  });

  it('refuses a claim outside the sales window', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Fermé',
      priceCents: 0,
      maxPerAccount: 2,
      salesCloseAt: new Date(Date.now() - 3600_000).toISOString()
    });
    await expect(
      tickets.issueTickets(holderId, type.id, 1)
    ).rejects.toBeInstanceOf(TicketSalesClosedError);
  });

  it('admits once and refuses the second scan of the same ticket', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Porte',
      priceCents: 0,
      maxPerAccount: 1
    });
    const [ticket] = await tickets.issueTickets(holderId, type.id, 1);

    const first = await tickets.redeem(ticket!.id, publicEventId, scannerId);
    expect(first.result).toBe('admitted');

    // Acceptance criterion 6.
    const second = await tickets.redeem(ticket!.id, publicEventId, scannerId);
    expect(second.result).toBe('already_used');
  });

  it('admits exactly once when two doors scan the same QR together', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Deux portes',
      priceCents: 0,
      maxPerAccount: 1
    });
    const [ticket] = await tickets.issueTickets(holderId, type.id, 1);

    const [left, right] = await Promise.all([
      tickets.redeem(ticket!.id, publicEventId, scannerId),
      tickets.redeem(ticket!.id, publicEventId, scannerId)
    ]);
    const admitted = [left, right].filter(
      (outcome) => outcome.result === 'admitted'
    );
    expect(admitted).toHaveLength(1);
  });

  it('names why a scan failed rather than just refusing', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Diagnostic',
      priceCents: 0,
      maxPerAccount: 1
    });
    const [ticket] = await tickets.issueTickets(holderId, type.id, 1);

    // A valid ticket, wrong night: a door has to tell this apart from a
    // duplicate, because the two mean different things to the person holding
    // the phone.
    expect(
      (await tickets.redeem(ticket!.id, privateEventId, scannerId)).result
    ).toBe('wrong_event');
    expect(
      (await tickets.redeem(randomUUID(), publicEventId, scannerId)).result
    ).toBe('unknown');
  });

  it('will not ticket a withheld-address event for an unapproved account', async () => {
    const type = await tickets.createTicketType(organizerId, privateEventId, {
      name: 'After validé',
      priceCents: 0,
      maxPerAccount: 2
    });

    // DEC-0022 §6 meeting §2: claiming a ticket must not be a way around the
    // organizer's approval, or the address gate is decorative.
    await expect(
      tickets.issueTickets(holderId, type.id, 1)
    ).rejects.toBeInstanceOf(TicketAccessNotApprovedError);

    await access.request(privateEventId, holderId, undefined);
    await access.resolve(privateEventId, holderId, 'approved', organizerId);
    const issued = await tickets.issueTickets(holderId, type.id, 1);
    expect(issued).toHaveLength(1);
  });

  it('refuses to delete a ticket type that already has tickets', async () => {
    const type = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'Déjà émis',
      priceCents: 0,
      maxPerAccount: 1
    });
    expect(await tickets.deleteTicketType(organizerId, type.id)).toBe(true);

    const used = await tickets.createTicketType(organizerId, publicEventId, {
      name: 'En circulation',
      priceCents: 0,
      maxPerAccount: 1
    });
    await tickets.issueTickets(holderId, used.id, 1);
    // Deleting would cascade a live admission away and turn somebody's
    // ticket into a 404 at the door.
    expect(await tickets.deleteTicketType(organizerId, used.id)).toBe(false);
  });

  it('keeps ticket types out of an account that does not own the event', async () => {
    await expect(
      tickets.createTicketType(holderId, publicEventId, {
        name: 'Pas le mien',
        priceCents: 0,
        maxPerAccount: 1
      })
    ).rejects.toThrow();
    expect(await tickets.isEventOrganizer(publicEventId, holderId)).toBe(false);
    expect(await tickets.isEventOrganizer(publicEventId, organizerId)).toBe(
      true
    );
  });
});
