/**
 * DEC-0022 §1. The payment provider, behind an interface.
 *
 * Same shape as `ImageModerationProvider`: an interface here, one Stripe
 * implementation next to it, and nothing configured by default. With no
 * provider, a priced ticket type stays unbuyable and says so - which is
 * exactly phase 2's behaviour, so an instance with no keys is not broken, it
 * is simply not selling.
 *
 * Everything this interface exposes is scoped to *direct charges on a
 * connected account*. There is deliberately no method that charges the
 * platform account: DEC-0022 §1 makes the organizer the merchant of record,
 * and an API that could do otherwise is an API someone will one day call.
 */

export interface ConnectedAccountStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** Verbatim from Stripe, so the console can say what is actually missing. */
  requirements: unknown;
}

export interface CheckoutRequest {
  accountId: string;
  /** Integer minor units, CAD (DEC-0022 §1). */
  unitAmountCents: number;
  quantity: number;
  productName: string;
  applicationFeeCents: number;
  successUrl: string;
  cancelUrl: string;
  /**
   * Echoed back on the webhook. Carries the order id, which is how a
   * completed session finds the seats it was holding.
   */
  metadata: Record<string, string>;
  /**
   * Stripe deduplicates on this, so a double-submitted checkout produces one
   * session rather than two holds on the same seats.
   */
  idempotencyKey: string;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

/** The only two webhook shapes Pulso acts on. */
export type PaymentEvent =
  | {
      kind: 'checkout_completed';
      id: string;
      orderId: string;
      paymentIntentId: string | undefined;
    }
  | { kind: 'checkout_expired'; id: string; orderId: string }
  | { kind: 'ignored'; id: string; type: string };

export interface PaymentProvider {
  readonly name: string;
  createConnectedAccount(email: string): Promise<string>;
  createOnboardingLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string
  ): Promise<string>;
  getAccountStatus(accountId: string): Promise<ConnectedAccountStatus>;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Issued on the connected account, because that is where the money is. */
  refund(accountId: string, paymentIntentId: string): Promise<void>;
  /**
   * Verifies Stripe's signature over the raw body and classifies the event.
   *
   * Returns undefined when the signature does not verify. A webhook whose
   * signature fails is not a Pulso event: anyone can POST to a public URL,
   * and acting on an unverified body would let them issue themselves tickets.
   */
  readWebhook(rawBody: Buffer, signature: string): PaymentEvent | undefined;
}

/**
 * Refused before any network call, because it is not a Stripe error - it is
 * this deployment having no payment provider at all.
 */
export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('No payment provider is configured.');
    this.name = 'PaymentsNotConfiguredError';
  }
}
