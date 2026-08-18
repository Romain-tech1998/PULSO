import { TicketsSoldOutError } from '@pulso/database';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventRepository,
  fakeTicketingRepository,
  testUser
} from './test-support.js';
import { issueTicketToken } from './ticket-token.js';

/**
 * DEC-0022 §2 and §3 route wiring.
 *
 * Inventory and redemption races are pinned against real SQL in
 * tests/integration/dec-0022-ticketing.test.ts - a fake repository races with
 * nobody. What this file covers is what the routes do: who may call them, how
 * a refusal is named, and the one decision the route layer genuinely owns,
 * which is what happens to a QR whose signature does not verify.
 */
const event = fakeEventRepository();
const eventId = '00000000-0000-4000-8000-000000000060';
const ticketId = '00000000-0000-4000-8000-000000000061';
const ticketTypeId = '00000000-0000-4000-8000-000000000062';

// Matches config.ts's development default, which is what buildApp resolves
// under test.
const DEV_SECRET = 'pulso-development-ticket-secret';

const heldTicket = {
  id: ticketId,
  eventId,
  eventTitle: 'Soirée test',
  eventStartsAt: '2026-09-01T02:00:00.000Z',
  venueName: 'Salle test',
  ticketTypeName: 'Entrée libre',
  priceCents: 0,
  status: 'valid' as const,
  issuedAt: '2026-08-01T00:00:00.000Z'
};

describe('DEC-0022 ticketing API', () => {
  it('refuses every ticketing route without a bearer token', async () => {
    const app = buildApp(event, accountRepositories());
    for (const call of [
      app.inject({ method: 'GET', url: `/events/${eventId}/ticket-types` }),
      app.inject({
        method: 'POST',
        url: `/events/${eventId}/tickets`,
        payload: { ticketTypeId, quantity: 1 }
      }),
      app.inject({ method: 'GET', url: '/me/tickets' }),
      app.inject({
        method: 'POST',
        url: `/me/events/${eventId}/scan`,
        payload: { token: 'x' }
      })
    ]) {
      expect((await call).statusCode).toBe(401);
    }
    await app.close();
  });

  it('returns a signed token with every ticket, and never stores one', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          listMyTickets: async () => [heldTicket]
        })
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    const [ticket] = response.json().data;
    // Derived on read from the row, so rotating the secret invalidates every
    // outstanding QR instead of leaving stale ones that still verify.
    expect(ticket.token).toBe(
      issueTicketToken(
        {
          ticketId,
          eventId,
          issuedAt: new Date(heldTicket.issuedAt).getTime()
        },
        DEV_SECRET
      )
    );
    await app.close();
  });

  it('names each issuance refusal rather than collapsing them into one', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          issueTickets: async () => {
            throw new TicketsSoldOutError();
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/tickets`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { ticketTypeId, quantity: 1 }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SOLD_OUT');
    await app.close();
  });

  it('reports a QR Pulso did not sign as forged, without looking it up', async () => {
    let lookedUp = false;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          isEventOrganizer: async () => true,
          redeem: async () => {
            lookedUp = true;
            return { result: 'admitted', holderName: 'x', ticketTypeName: 'y' };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/scan`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        token: issueTicketToken(
          { ticketId, eventId, issuedAt: 1 },
          'somebody-elses-secret'
        )
      }
    });
    expect(response.json().data).toEqual({ result: 'forged' });
    // There is nothing trustworthy to look up with, so nothing is looked up.
    expect(lookedUp).toBe(false);
    await app.close();
  });

  it('admits a genuine token and passes the ticket id through', async () => {
    let scanned:
      { ticketId: string; eventId: string; scanner: string } | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          isEventOrganizer: async () => true,
          redeem: async (id, forEvent, scanner) => {
            scanned = { ticketId: id, eventId: forEvent, scanner };
            return {
              result: 'admitted',
              holderName: 'Camille',
              ticketTypeName: 'Entrée libre'
            };
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/scan`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        token: issueTicketToken({ ticketId, eventId, issuedAt: 1 }, DEV_SECRET)
      }
    });
    expect(response.json().data.result).toBe('admitted');
    expect(scanned).toEqual({
      ticketId,
      eventId,
      scanner: testUser.id
    });
    await app.close();
  });

  it('hides the door from anyone but the organizer of that event', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          isEventOrganizer: async () => false
        })
      })
    );
    const scan = await app.inject({
      method: 'POST',
      url: `/me/events/${eventId}/scan`,
      headers: { authorization: 'Bearer valid-token' },
      payload: {
        token: issueTicketToken({ ticketId, eventId, issuedAt: 1 }, DEV_SECRET)
      }
    });
    const admissions = await app.inject({
      method: 'GET',
      url: `/me/events/${eventId}/admissions`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(scan.statusCode).toBe(404);
    expect(admissions.statusCode).toBe(404);
    await app.close();
  });

  it('refuses to delete a ticket type that already has tickets', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          deleteTicketType: async () => false
        })
      })
    );
    const response = await app.inject({
      method: 'DELETE',
      url: `/me/ticket-types/${ticketTypeId}`,
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('TICKET_TYPE_IN_USE');
    await app.close();
  });
});
