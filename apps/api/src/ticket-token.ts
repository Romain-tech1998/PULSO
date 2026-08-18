import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * DEC-0022 §3. The QR is a signature, not an identifier.
 *
 * A bare ticket id in a QR would be a bearer token: guessable by enumeration
 * and forgeable by anyone who has ever seen one printed. What travels instead
 * is a payload signed with a secret that never leaves the API, so a door can
 * establish that Pulso issued this exact ticket without the door holding
 * anything that would let it mint another.
 *
 * Kept as pure functions with no database and no Fastify, for two reasons:
 * they are the part that has to be exactly right, and `verifyTicketToken` is
 * what an offline scanner would run (DEC-0022 §3) once one exists.
 */

/** Bumped if the payload layout ever changes; an old token then fails loudly. */
const TOKEN_VERSION = 'PULSO1';

/**
 * 192 bits of the HMAC. Full SHA-256 would make the QR denser to no purpose -
 * this is a forgery bound, not a collision bound, and 2^192 is not a number
 * anyone works around.
 */
const SIGNATURE_BYTES = 24;

export interface TicketTokenPayload {
  ticketId: string;
  eventId: string;
  /** Epoch milliseconds, so a re-issued ticket produces a different token. */
  issuedAt: number;
}

export type TicketTokenFailure =
  'malformed' | 'unknown_version' | 'bad_signature';

function base64url(value: Buffer): string {
  return value.toString('base64url');
}

function sign(body: string, secret: string): string {
  return base64url(
    createHmac('sha256', secret)
      .update(body)
      .digest()
      .subarray(0, SIGNATURE_BYTES)
  );
}

function encodePayload(payload: TicketTokenPayload): string {
  // Positional and delimiter-free of user input: all three fields are a uuid
  // or a number, so no value can contain the separator and shift the others.
  return base64url(
    Buffer.from(
      `${payload.ticketId}|${payload.eventId}|${payload.issuedAt}`,
      'utf8'
    )
  );
}

export function issueTicketToken(
  payload: TicketTokenPayload,
  secret: string
): string {
  const body = encodePayload(payload);
  return `${TOKEN_VERSION}.${body}.${sign(`${TOKEN_VERSION}.${body}`, secret)}`;
}

/**
 * Establishes only that Pulso signed this payload. Whether the ticket is
 * still valid, already used, refunded, or for a different event is a question
 * about a row, and DEC-0022 §3 makes the server authoritative on it.
 */
export function verifyTicketToken(
  token: string,
  secret: string
):
  | { ok: true; payload: TicketTokenPayload }
  | { ok: false; reason: TicketTokenFailure } {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [version, body, signature] = parts as [string, string, string];
  if (version !== TOKEN_VERSION)
    return { ok: false, reason: 'unknown_version' };

  const expected = Buffer.from(sign(`${version}.${body}`, secret), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  // Compared in constant time, and length-guarded first because
  // timingSafeEqual throws on a length mismatch rather than returning false.
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }

  const decoded = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (decoded.length !== 3) return { ok: false, reason: 'malformed' };
  const [ticketId, eventId, issuedAt] = decoded as [string, string, string];
  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return { ok: false, reason: 'malformed' };

  return { ok: true, payload: { ticketId, eventId, issuedAt: issuedAtMs } };
}
