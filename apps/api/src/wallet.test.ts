import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import {
  accountRepositories,
  fakeEventRepository,
  fakeTicketingRepository
} from './test-support.js';
import { createGoogleWalletProvider } from './wallet-google.js';
import { verifyTicketToken } from './ticket-token.js';
import type { WalletPassProvider } from './wallet.js';
import { WalletPassUnavailableError } from './wallet.js';

/**
 * DEC-0022 §4, and its acceptance criterion 7 above all: with no wallet
 * provider configured, tickets work end to end and no "Add to Wallet"
 * affordance is rendered anywhere.
 *
 * The client decides whether to render the button from the `wallet` field, so
 * the field's absence *is* the guarantee, and that is what is pinned here.
 */
const event = fakeEventRepository();
const ticketId = '00000000-0000-4000-8000-000000000080';
const eventId = '00000000-0000-4000-8000-000000000081';
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

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({
  type: 'pkcs8',
  format: 'pem'
}) as string;

const googleProvider = createGoogleWalletProvider({
  issuerId: '3388000000000000000',
  serviceAccountEmail: 'pulso@example.iam.gserviceaccount.com',
  privateKeyPem,
  classId: '3388000000000000000.pulso-event',
  origin: 'https://pulso.example'
});

describe('DEC-0022 §4 wallet passes', () => {
  it('offers no wallet at all when no provider is configured', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          listMyTickets: async () => [heldTicket]
        })
      })
    );
    const tickets = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: 'Bearer valid-token' }
    });
    const pass = await app.inject({
      method: 'GET',
      url: `/me/tickets/${ticketId}/wallet`,
      headers: { authorization: 'Bearer valid-token' }
    });

    // The ticket still works end to end: it is listed, and it carries the QR
    // token that is the actual ticket.
    expect(tickets.statusCode).toBe(200);
    const [listed] = tickets.json().data;
    expect(listed.token).toBeTruthy();
    // No field, so no button anywhere.
    expect(listed.wallet).toBeUndefined();
    expect(pass.statusCode).toBe(404);
    await app.close();
  });

  it('announces the platform once a provider exists', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          listMyTickets: async () => [heldTicket]
        }),
        walletProvider: googleProvider
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.json().data[0].wallet).toBe('google');
    await app.close();
  });

  it('puts the same signed token in the pass as on the screen', async () => {
    const pass = await googleProvider.issue(heldTicket, 'the-signed-token');
    expect(pass.kind).toBe('link');
    const jwt = pass.url?.split('/save/')[1] ?? '';
    const claims = JSON.parse(
      Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')
    );
    const object = claims.payload.eventTicketObjects[0];
    // A pass scanned at the door has to be indistinguishable from a phone
    // screen, so the barcode carries the token rather than the ticket id.
    expect(object.barcode.value).toBe('the-signed-token');
    expect(object.eventName.defaultValue.value).toBe('Soirée test');
  });

  it('hands the route a token the door would accept', async () => {
    let issuedToken: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          findTicketById: async () => heldTicket,
          listMyTickets: async () => [heldTicket]
        }),
        walletProvider: {
          name: 'spy',
          platform: 'google',
          issue: async (_ticket, token) => {
            issuedToken = token;
            return {
              kind: 'link',
              url: 'https://x',
              contentType: 'text/uri-list'
            };
          }
        } satisfies WalletPassProvider
      })
    );
    await app.inject({
      method: 'GET',
      url: `/me/tickets/${ticketId}/wallet`,
      headers: { authorization: 'Bearer valid-token' }
    });
    const verified = verifyTicketToken(issuedToken ?? '', DEV_SECRET);
    expect(verified.ok).toBe(true);
    await app.close();
  });

  it('refuses to export a ticket the caller does not hold', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          findTicketById: async () => heldTicket,
          // Not in the caller's own list.
          listMyTickets: async () => []
        }),
        walletProvider: googleProvider
      })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/me/tickets/${ticketId}/wallet`,
      headers: { authorization: 'Bearer valid-token' }
    });
    // 404 rather than 403: a 403 would confirm which ticket ids exist.
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('leaves the ticket usable when the provider fails', async () => {
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          findTicketById: async () => heldTicket,
          listMyTickets: async () => [heldTicket]
        }),
        walletProvider: {
          name: 'broken',
          platform: 'google',
          issue: async () => {
            throw new WalletPassUnavailableError('expired credential');
          }
        } satisfies WalletPassProvider
      })
    );
    const pass = await app.inject({
      method: 'GET',
      url: `/me/tickets/${ticketId}/wallet`,
      headers: { authorization: 'Bearer valid-token' }
    });
    const tickets = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: 'Bearer valid-token' }
    });

    expect(pass.statusCode).toBe(503);
    // DEC-0022 §4: an outage never invalidates a ticket. The QR was always
    // the real one.
    expect(tickets.statusCode).toBe(200);
    expect(tickets.json().data[0].token).toBeTruthy();
    await app.close();
  });
});
