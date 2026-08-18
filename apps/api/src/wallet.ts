import type { HeldTicket } from '@pulso/database';

/**
 * DEC-0022 §4. Apple Wallet and Google Wallet, behind a provider.
 *
 * The Pulso in-app ticket and its QR are the ticket. A wallet pass is an
 * *export* of it, never the system of record: the door verifies the same
 * signed token either way (§3), and nothing here can make a ticket valid or
 * invalid.
 *
 * That is what lets the whole feature be absent. With no provider configured
 * - which is the default, and the only state that exists today - tickets work
 * end to end and no "Add to Wallet" affordance is rendered anywhere
 * (acceptance criterion 7).
 */

export interface WalletPass {
  /**
   * How the client should hand the pass over. A `.pkpass` is a file the
   * browser downloads; a Google pass is a URL the browser opens.
   */
  kind: 'file' | 'link';
  /** For `file`: the bytes. For `link`: unused. */
  body?: Buffer;
  /** For `link`: where to send the browser. For `file`: unused. */
  url?: string;
  contentType: string;
  fileName?: string;
}

export interface WalletPassProvider {
  readonly name: string;
  /** Shown to the client so it can label the button honestly. */
  readonly platform: 'apple' | 'google';
  /**
   * Builds a pass for one ticket.
   *
   * `token` is the same signed QR payload the in-app ticket carries, so a
   * pass scanned at the door is indistinguishable from a phone screen.
   */
  issue(ticket: HeldTicket, token: string): Promise<WalletPass>;
}

/**
 * A provider that failed is not a ticket that failed.
 *
 * DEC-0022 §4: an outage, a missing certificate or an expired credential
 * never invalidates a ticket, never blocks a purchase and never blocks entry.
 * So every call site catches this and falls back to the QR, which was always
 * the real ticket.
 */
export class WalletPassUnavailableError extends Error {
  constructor(reason: string) {
    super(`The wallet pass could not be built: ${reason}`);
    this.name = 'WalletPassUnavailableError';
  }
}
