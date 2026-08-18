import { createSign } from 'node:crypto';

import type { HeldTicket } from '@pulso/database';

import type { WalletPass, WalletPassProvider } from './wallet.js';
import { WalletPassUnavailableError } from './wallet.js';

/**
 * DEC-0022 §4. Google Wallet.
 *
 * Implemented rather than stubbed because it can be: a Google Wallet pass is
 * a JWT signed RS256 with the issuer's service-account key, and Node signs
 * RS256 natively. No new dependency, and nothing here needs a certificate
 * authority - only an issuer account and a service-account key, which is a
 * form somebody fills in rather than a purchase.
 *
 * Apple is deliberately not implemented alongside it. A `.pkpass` needs a
 * detached PKCS#7 signature made with an Apple-issued Pass Type ID
 * certificate; writing that against no certificate would produce code nobody
 * could run, and a provider that cannot be exercised is worse than an absent
 * one - it renders the button.
 */

export interface GoogleWalletConfig {
  /** The Google Wallet issuer id, from the Google Pay & Wallet console. */
  issuerId: string;
  /** Service-account email, used as the JWT issuer. */
  serviceAccountEmail: string;
  /** Its PEM private key. Never logged, never leaves this process. */
  privateKeyPem: string;
  /** The pass class this deployment's tickets belong to. */
  classId: string;
  origin: string;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createGoogleWalletProvider(
  config: GoogleWalletConfig
): WalletPassProvider {
  return {
    name: 'google-wallet',
    platform: 'google',

    async issue(ticket: HeldTicket, token: string): Promise<WalletPass> {
      // The QR carries the same signed token the in-app ticket shows, so the
      // door cannot tell the two apart - and does not need to.
      const object = {
        id: `${config.issuerId}.${ticket.id}`,
        classId: config.classId,
        state: 'ACTIVE',
        ticketHolderName: ticket.ticketTypeName,
        eventName: {
          defaultValue: { language: 'fr', value: ticket.eventTitle }
        },
        venue: {
          name: { defaultValue: { language: 'fr', value: ticket.venueName } }
        },
        dateTime: { start: ticket.eventStartsAt },
        barcode: { type: 'QR_CODE', value: token }
      };

      const claims = {
        iss: config.serviceAccountEmail,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        origins: [config.origin],
        payload: { eventTicketObjects: [object] }
      };

      const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const body = base64url(JSON.stringify(claims));
      let signature: string;
      try {
        const signer = createSign('RSA-SHA256');
        signer.update(`${header}.${body}`);
        signature = signer.sign(config.privateKeyPem, 'base64url');
      } catch (error) {
        // A malformed or rotated key is a configuration problem, not a
        // problem with this ticket. The caller falls back to the QR.
        throw new WalletPassUnavailableError(
          error instanceof Error ? error.message : 'signing failed'
        );
      }

      return {
        kind: 'link',
        url: `https://pay.google.com/gp/v/save/${header}.${body}.${signature}`,
        contentType: 'text/uri-list'
      };
    }
  };
}

/**
 * Reads the provider out of the environment, or returns undefined.
 *
 * Every field is required together: a half-configured issuer would render an
 * "Add to Wallet" button that produces a broken pass, which DEC-0022 §4 calls
 * worse than no button.
 */
export function resolveGoogleWalletProvider(
  env: NodeJS.ProcessEnv,
  origin: string
): WalletPassProvider | undefined {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKeyPem = env.GOOGLE_WALLET_PRIVATE_KEY;
  const classId = env.GOOGLE_WALLET_CLASS_ID;
  if (!issuerId || !serviceAccountEmail || !privateKeyPem || !classId) {
    return undefined;
  }
  return createGoogleWalletProvider({
    issuerId,
    serviceAccountEmail,
    // Environment variables cannot hold real newlines, so a PEM is carried
    // with escaped ones and restored here.
    privateKeyPem: privateKeyPem.replace(/\\n/g, '\n'),
    classId,
    origin
  });
}
