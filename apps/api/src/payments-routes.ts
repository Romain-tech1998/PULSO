import type { AuthRepository, TicketingRepository } from '@pulso/database';
import {
  OrganizerCannotAcceptPaymentsError,
  TicketAccessNotApprovedError,
  TicketLimitReachedError,
  TicketSalesClosedError,
  TicketsSoldOutError
} from '@pulso/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import type { PaymentProvider } from './payments.js';

const checkoutRequestSchema = z.object({
  ticketTypeId: z.uuid(),
  quantity: z.number().int().positive().max(20)
});
const orderParamsSchema = z.object({ orderId: z.uuid() });

export interface PaymentsRoutesOptions {
  webUrl: string;
  applicationFeeBps: number;
  checkoutHoldMinutes: number;
}

/**
 * DEC-0022 §1. Connect onboarding, paid checkout, the webhook, and refunds.
 *
 * `provider` is optional on purpose. With none configured the routes still
 * exist and answer "payments are not available", which is what an instance
 * with no Stripe keys should say - the free ticketing of phase 2 keeps
 * working around it.
 */
export function registerPaymentsRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  ticketingRepository: TicketingRepository,
  options: PaymentsRoutesOptions,
  provider?: PaymentProvider
) {
  const unavailable = {
    error: {
      code: 'PAYMENTS_NOT_CONFIGURED',
      message: 'Paid ticketing is not available on this instance.'
    }
  };

  app.get('/me/payments/account', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const account = await ticketingRepository.findStripeAccount(user.id);
    return {
      data: {
        configured: Boolean(provider),
        ...(account
          ? {
              connected: true,
              chargesEnabled: account.chargesEnabled,
              payoutsEnabled: account.payoutsEnabled
            }
          : { connected: false })
      }
    };
  });

  /**
   * Creates the connected account if needed and hands back an onboarding
   * link. Stripe's links are single-use and short-lived, so this is called
   * again rather than stored.
   */
  app.post('/me/payments/onboarding', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!provider) return reply.status(503).send(unavailable);

    let account = await ticketingRepository.findStripeAccount(user.id);
    if (!account) {
      const accountId = await provider.createConnectedAccount(user.email);
      await ticketingRepository.saveStripeAccount(user.id, accountId);
      account = await ticketingRepository.findStripeAccount(user.id);
    }
    if (!account) return reply.status(503).send(unavailable);

    const url = await provider.createOnboardingLink(
      account.stripeAccountId,
      `${options.webUrl}/?stripe=refresh`,
      `${options.webUrl}/?stripe=return`
    );
    return { data: { url } };
  });

  /** Asks Stripe what it currently thinks, and stores the answer. */
  app.post('/me/payments/refresh', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!provider) return reply.status(503).send(unavailable);
    const account = await ticketingRepository.findStripeAccount(user.id);
    if (!account) {
      return reply.status(404).send({
        error: { code: 'NO_STRIPE_ACCOUNT', message: 'No connected account.' }
      });
    }
    const status = await provider.getAccountStatus(account.stripeAccountId);
    await ticketingRepository.updateStripeStatus(account.stripeAccountId, {
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      requirements: status.requirements
    });
    return {
      data: {
        connected: true,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled
      }
    };
  });

  app.post('/events/:eventId/checkout', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!provider) return reply.status(503).send(unavailable);
    const { ticketTypeId, quantity } = checkoutRequestSchema.parse(
      request.body
    );

    let order;
    try {
      order = await ticketingRepository.startPaidOrder(
        user.id,
        ticketTypeId,
        quantity,
        options.applicationFeeBps,
        options.checkoutHoldMinutes
      );
    } catch (error) {
      if (error instanceof OrganizerCannotAcceptPaymentsError) {
        return reply.status(409).send({
          error: {
            code: 'ORGANIZER_NOT_PAYABLE',
            message: 'This organizer cannot accept payments yet.'
          }
        });
      }
      if (error instanceof TicketsSoldOutError) {
        return reply.status(409).send({
          error: {
            code: 'SOLD_OUT',
            message: 'There are not enough tickets left.'
          }
        });
      }
      if (error instanceof TicketLimitReachedError) {
        return reply.status(409).send({
          error: {
            code: 'LIMIT_REACHED',
            message: `This account may hold at most ${error.maxPerAccount} of this ticket type.`
          }
        });
      }
      if (error instanceof TicketSalesClosedError) {
        return reply.status(409).send({
          error: {
            code: 'SALES_CLOSED',
            message: 'This ticket type is not on sale right now.'
          }
        });
      }
      if (error instanceof TicketAccessNotApprovedError) {
        return reply.status(403).send({
          error: {
            code: 'ACCESS_NOT_APPROVED',
            message: 'The organizer must approve you before you can buy.'
          }
        });
      }
      throw error;
    }

    try {
      const session = await provider.createCheckout({
        accountId: order.stripeAccountId,
        unitAmountCents: order.unitAmountCents,
        quantity: order.quantity,
        productName: order.ticketTypeName,
        applicationFeeCents: order.applicationFeeCents,
        successUrl: `${options.webUrl}/?checkout=success`,
        cancelUrl: `${options.webUrl}/?checkout=cancelled`,
        metadata: { orderId: order.orderId },
        idempotencyKey: order.orderId
      });
      await ticketingRepository.attachCheckoutSession(
        order.orderId,
        session.sessionId
      );
      return { data: { url: session.url } };
    } catch (error) {
      // Stripe refused or was unreachable: release the seats immediately
      // rather than leaving them held by a checkout that will never happen.
      await ticketingRepository.releaseOrder(order.orderId);
      throw error;
    }
  });

  app.post('/me/orders/:orderId/refund', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    if (!provider) return reply.status(503).send(unavailable);
    const { orderId } = orderParamsSchema.parse(request.params);
    const order = await ticketingRepository.findOrderForRefund(
      user.id,
      orderId
    );
    if (!order) {
      return reply.status(404).send({
        error: { code: 'ORDER_NOT_FOUND', message: 'No refundable order.' }
      });
    }
    // DEC-0022 §1: the refund is issued on the organizer's own connected
    // account, because that is where the money is. Pulso records the outcome.
    await provider.refund(order.stripeAccountId, order.paymentIntentId);
    await ticketingRepository.markOrderRefunded(orderId);
    return { data: { refunded: true } };
  });

  /**
   * The webhook, in its own encapsulated scope so its raw-body parser applies
   * to this route and nothing else.
   *
   * Stripe signs the exact bytes it sent. Fastify's default JSON parser hands
   * back a re-serialised object, whose bytes differ, and the signature check
   * would then fail on every genuine delivery - so this route needs the
   * Buffer, and only this route.
   */
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body)
    );

    scope.post('/stripe/webhook', async (request, reply) => {
      if (!provider) return reply.status(503).send(unavailable);
      const signature = request.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        return reply.status(400).send({
          error: { code: 'BAD_SIGNATURE', message: 'Missing signature.' }
        });
      }
      const event = provider.readWebhook(request.body as Buffer, signature);
      if (!event) {
        // Anyone can POST to a public URL. An unverified body is not a Pulso
        // event, and acting on one would let a stranger issue themselves
        // tickets.
        return reply.status(400).send({
          error: { code: 'BAD_SIGNATURE', message: 'Invalid signature.' }
        });
      }

      // Recorded before the work. A redelivery - which Stripe does on its own
      // schedule, and whenever a response is slow - finds the id already
      // present and does nothing (DEC-0022 acceptance criterion 2).
      const fresh = await ticketingRepository.recordWebhookEvent(
        event.id,
        event.kind === 'ignored' ? event.type : event.kind
      );
      if (!fresh) return { received: true, duplicate: true };

      if (event.kind === 'checkout_completed') {
        await ticketingRepository.completePaidOrder(
          event.orderId,
          event.paymentIntentId
        );
      } else if (event.kind === 'checkout_expired') {
        await ticketingRepository.releaseOrder(event.orderId);
      }
      // Always 2xx once the signature verified: Stripe retries anything else,
      // and a handled-but-ignored type must not be retried forever.
      return { received: true };
    });
  });
}
