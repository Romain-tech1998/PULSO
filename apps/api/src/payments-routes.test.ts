import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import type { PaymentEvent, PaymentProvider } from './payments.js';
import {
  accountRepositories,
  fakeEventRepository,
  fakeTicketingRepository
} from './test-support.js';

/**
 * DEC-0022 §1 route wiring.
 *
 * The money-shaped guarantees - held seats, idempotent issuance, refunds
 * taking their tickets with them - are pinned against real SQL in
 * tests/integration/dec-0022-payments.test.ts. What this file covers is the
 * route layer's own decisions: an instance with no Stripe keys, and a webhook
 * body whose signature does not verify.
 */
const event = fakeEventRepository();
const eventId = '00000000-0000-4000-8000-000000000070';
const ticketTypeId = '00000000-0000-4000-8000-000000000071';
const orderId = '00000000-0000-4000-8000-000000000072';

function fakeProvider(
  overrides: Partial<PaymentProvider> = {}
): PaymentProvider {
  return {
    name: 'fake',
    createConnectedAccount: async () => 'acct_fake',
    createOnboardingLink: async () => 'https://connect.stripe.test/setup',
    getAccountStatus: async () => ({
      accountId: 'acct_fake',
      chargesEnabled: true,
      payoutsEnabled: true,
      requirements: null
    }),
    createCheckout: async () => ({
      sessionId: 'cs_fake',
      url: 'https://checkout.stripe.test/pay'
    }),
    refund: async () => undefined,
    readWebhook: () => undefined,
    ...overrides
  };
}

describe('DEC-0022 payments API', () => {
  it('says payments are unavailable rather than failing, with no provider', async () => {
    const app = buildApp(event, accountRepositories());
    const onboarding = await app.inject({
      method: 'POST',
      url: '/me/payments/onboarding',
      headers: { authorization: 'Bearer valid-token' }
    });
    const checkout = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/checkout`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { ticketTypeId, quantity: 1 }
    });
    // 503, not 500: the instance is working, it simply does not sell.
    expect(onboarding.statusCode).toBe(503);
    expect(checkout.statusCode).toBe(503);
    expect(checkout.json().error.code).toBe('PAYMENTS_NOT_CONFIGURED');
    await app.close();
  });

  it('still reports the account surface without a provider', async () => {
    const app = buildApp(event, accountRepositories());
    const response = await app.inject({
      method: 'GET',
      url: '/me/payments/account',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      configured: false,
      connected: false
    });
    await app.close();
  });

  it('refuses a webhook whose signature does not verify, and touches nothing', async () => {
    let recorded = 0;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          recordWebhookEvent: async () => {
            recorded += 1;
            return true;
          }
        }),
        paymentProvider: fakeProvider({ readWebhook: () => undefined })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: {
        'stripe-signature': 't=1,v1=nope',
        'content-type': 'application/json'
      },
      payload: JSON.stringify({ id: 'evt_forged' })
    });
    expect(response.statusCode).toBe(400);
    // Anyone can POST to a public URL; an unverified body is not an event.
    expect(recorded).toBe(0);
    await app.close();
  });

  it('refuses a webhook with no signature header at all', async () => {
    const app = buildApp(
      event,
      accountRepositories({ paymentProvider: fakeProvider() })
    );
    const response = await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ id: 'evt' })
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('hands the verifier the raw bytes Stripe signed', async () => {
    let seen: unknown;
    const body = JSON.stringify({ id: 'evt_raw', hello: 'wörld' });
    const app = buildApp(
      event,
      accountRepositories({
        paymentProvider: fakeProvider({
          readWebhook: (raw) => {
            seen = raw;
            return {
              kind: 'ignored',
              id: 'evt_raw',
              type: 'x'
            } as PaymentEvent;
          }
        })
      })
    );
    await app.inject({
      method: 'POST',
      url: '/stripe/webhook',
      headers: {
        'stripe-signature': 't=1,v1=x',
        'content-type': 'application/json'
      },
      payload: body
    });
    // A re-serialised object would not produce the bytes Stripe signed, and
    // every genuine delivery would then fail verification.
    expect(Buffer.isBuffer(seen)).toBe(true);
    expect((seen as Buffer).toString('utf8')).toBe(body);
    await app.close();
  });

  it('acts once on a delivery and not at all on its replay', async () => {
    let completed = 0;
    let fresh = true;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          recordWebhookEvent: async () => {
            const answer = fresh;
            fresh = false;
            return answer;
          },
          completePaidOrder: async () => {
            completed += 1;
            return [];
          }
        }),
        paymentProvider: fakeProvider({
          readWebhook: () => ({
            kind: 'checkout_completed',
            id: 'evt_dup',
            orderId,
            paymentIntentId: 'pi_1'
          })
        })
      })
    );
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/stripe/webhook',
        headers: {
          'stripe-signature': 't=1,v1=x',
          'content-type': 'application/json'
        },
        payload: JSON.stringify({ id: 'evt_dup' })
      });
    const first = await send();
    const second = await send();
    expect(first.statusCode).toBe(200);
    // Still 2xx: Stripe retries anything else, forever.
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(completed).toBe(1);
    await app.close();
  });

  it('releases the seats when Stripe refuses the checkout', async () => {
    let released: string | undefined;
    const app = buildApp(
      event,
      accountRepositories({
        ticketingRepository: fakeTicketingRepository({
          startPaidOrder: async () => ({
            orderId,
            eventId,
            ticketTypeId,
            quantity: 1,
            unitAmountCents: 2200,
            organizerPriceCents: 2000,
            totalCents: 2200,
            applicationFeeCents: 0,
            stripeAccountId: 'acct_fake',
            ticketTypeName: 'Prévente'
          }),
          releaseOrder: async (id) => {
            released = id;
            return true;
          }
        }),
        paymentProvider: fakeProvider({
          createCheckout: async () => {
            throw new Error('stripe is down');
          }
        })
      })
    );
    const response = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/checkout`,
      headers: { authorization: 'Bearer valid-token' },
      payload: { ticketTypeId, quantity: 1 }
    });
    expect(response.statusCode).toBe(500);
    // Otherwise the seats stay held by a checkout that will never happen.
    expect(released).toBe(orderId);
    await app.close();
  });
});
