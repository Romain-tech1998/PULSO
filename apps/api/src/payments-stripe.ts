import Stripe from 'stripe';

import type {
  CheckoutRequest,
  CheckoutSession,
  ConnectedAccountStatus,
  PaymentEvent,
  PaymentProvider
} from './payments.js';

/**
 * DEC-0022 §1. Stripe Connect Express, direct charges, test mode.
 *
 * Direct charges rather than destination charges is the structural choice of
 * the whole document: the charge is created *on the connected account*, so
 * the organizer is named on the cardholder's statement, owes the refund and
 * carries the chargeback. Every call below therefore carries
 * `stripeAccount` - dropping it would quietly make Pulso the merchant of
 * record for every ticket sold in Montréal.
 */
export function createStripePaymentProvider(
  secretKey: string,
  webhookSecret: string
): PaymentProvider {
  const stripe = new Stripe(secretKey, {
    // Pinned rather than floating: an API version that moves under a payment
    // integration changes shapes nobody re-read.
    apiVersion: '2026-07-29.dahlia',
    appInfo: { name: 'Pulso' }
  });

  return {
    name: 'stripe',

    async createConnectedAccount(email: string): Promise<string> {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        // Montréal. DEC-0022 scopes Pulso to one city, and an organizer
        // elsewhere is a question this document has not answered.
        country: 'CA',
        default_currency: 'cad',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        }
      });
      return account.id;
    },

    async createOnboardingLink(
      accountId: string,
      refreshUrl: string,
      returnUrl: string
    ): Promise<string> {
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding'
      });
      return link.url;
    },

    async getAccountStatus(accountId: string): Promise<ConnectedAccountStatus> {
      const account = await stripe.accounts.retrieve(accountId);
      return {
        accountId: account.id,
        // Stripe's own answer, never inferred from "did they finish the
        // form": an organizer can complete onboarding and still be disabled
        // pending verification, and publishing a paid event on a guess sells
        // tickets whose checkout fails.
        chargesEnabled: account.charges_enabled === true,
        payoutsEnabled: account.payouts_enabled === true,
        requirements: account.requirements ?? null
      };
    },

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: request.quantity,
              price_data: {
                currency: 'cad',
                unit_amount: request.unitAmountCents,
                product_data: { name: request.productName }
              }
            }
          ],
          payment_intent_data: {
            // Pulso's cut. The rest settles on the organizer's account.
            application_fee_amount: request.applicationFeeCents
          },
          metadata: request.metadata,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl
        },
        {
          stripeAccount: request.accountId,
          idempotencyKey: request.idempotencyKey
        }
      );
      if (!session.url) {
        // Stripe returns a session with no URL only in modes Pulso does not
        // use; treated as a failure rather than handing the client a null.
        throw new Error('Stripe returned a checkout session with no URL.');
      }
      return { sessionId: session.id, url: session.url };
    },

    async refund(accountId: string, paymentIntentId: string): Promise<void> {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId },
        { stripeAccount: accountId }
      );
    },

    readWebhook(rawBody: Buffer, signature: string): PaymentEvent | undefined {
      let event: Stripe.Event;
      try {
        // Over the *raw* body. A re-serialised JSON object does not produce
        // the same bytes Stripe signed, and the check would fail on every
        // genuine delivery while passing nothing extra.
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret
        );
      } catch {
        return undefined;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId)
          return { kind: 'ignored', id: event.id, type: event.type };
        return {
          kind: 'checkout_completed',
          id: event.id,
          orderId,
          paymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? undefined)
        };
      }

      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (!orderId)
          return { kind: 'ignored', id: event.id, type: event.type };
        return { kind: 'checkout_expired', id: event.id, orderId };
      }

      // Everything else is acknowledged and ignored. Stripe retries anything
      // it does not get a 2xx for, so an unhandled type must still be
      // answered rather than errored.
      return { kind: 'ignored', id: event.id, type: event.type };
    }
  };
}
