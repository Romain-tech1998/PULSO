import { describe, expect, it } from 'vitest';

import { issueTicketToken, verifyTicketToken } from './ticket-token.js';

const SECRET = 'test-ticket-signing-secret';
const payload = {
  ticketId: '00000000-0000-4000-8000-000000000050',
  eventId: '00000000-0000-4000-8000-000000000051',
  issuedAt: 1_767_000_000_000
};

describe('DEC-0022 §3 ticket token', () => {
  it('round-trips a payload it signed', () => {
    const result = verifyTicketToken(issueTicketToken(payload, SECRET), SECRET);
    expect(result).toEqual({ ok: true, payload });
  });

  it('rejects a payload altered by one byte', () => {
    // Acceptance criterion 5. Every position in the payload is flipped in
    // turn rather than one arbitrary character, so this cannot pass by
    // landing on a byte the encoding happens to ignore.
    const token = issueTicketToken(payload, SECRET);
    const [version, body, signature] = token.split('.') as [
      string,
      string,
      string
    ];
    for (let index = 0; index < body.length; index += 1) {
      const character = body[index] as string;
      const replacement = character === 'A' ? 'B' : 'A';
      const mutated = `${version}.${body.slice(0, index)}${replacement}${body.slice(index + 1)}.${signature}`;
      if (mutated === token) continue;
      expect(verifyTicketToken(mutated, SECRET).ok).toBe(false);
    }
  });

  it('rejects a signature that is not ours', () => {
    const token = issueTicketToken(payload, SECRET);
    expect(verifyTicketToken(token, 'a-different-secret')).toEqual({
      ok: false,
      reason: 'bad_signature'
    });
  });

  it('rejects a forged token built without the secret', () => {
    // What someone who has seen a printed ticket can attempt: keep the shape,
    // swap in another ticket id. Without the secret there is no signature to
    // put on it.
    const forged = `PULSO1.${Buffer.from('other|other|1', 'utf8').toString('base64url')}.${'A'.repeat(32)}`;
    expect(verifyTicketToken(forged, SECRET).ok).toBe(false);
  });

  it('rejects malformed and unknown-version tokens without throwing', () => {
    expect(verifyTicketToken('', SECRET)).toEqual({
      ok: false,
      reason: 'malformed'
    });
    expect(verifyTicketToken('not-a-token', SECRET)).toEqual({
      ok: false,
      reason: 'malformed'
    });
    const [, body, signature] = issueTicketToken(payload, SECRET).split(
      '.'
    ) as [string, string, string];
    expect(verifyTicketToken(`PULSO2.${body}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: 'unknown_version'
    });
  });

  it('gives a different token to a ticket re-issued at another moment', () => {
    const first = issueTicketToken(payload, SECRET);
    const second = issueTicketToken(
      { ...payload, issuedAt: payload.issuedAt + 1 },
      SECRET
    );
    expect(first).not.toBe(second);
  });
});
