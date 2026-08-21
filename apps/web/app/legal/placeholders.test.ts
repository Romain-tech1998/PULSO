import { describe, expect, it } from 'vitest';

import { LEGAL_CONTENT, LEGAL_DOCS, OPERATOR } from './content';

/**
 * A ratchet on the facts only the operator can supply (DEC-0026 §4).
 *
 * The four legal documents are written; what is missing is the enterprise's
 * own identity, and no amount of drafting produces it. Each unfilled value
 * carries a visible marker, and this pins how many are left.
 *
 * The budget may only go down. **Zero is a condition of the first
 * invitation**: Google's consent screen links to the privacy policy, and a
 * privacy policy that does not name its enterprise or its person in charge
 * is not one. Until then the pages exist, are reachable, and say plainly
 * which lines are unfinished - which is better than a plausible blank.
 */

const MARKER = 'À COMPLÉTER';
// 6 on 2026-08-20, 2 once the address, contact, person in charge and hosts
// were given. The two left are the enterprise's registered name and its NEQ,
// which the Registraire has not issued yet.
const REMAINING = 2;

describe('legal placeholders (DEC-0026 §4)', () => {
  it(`leaves exactly ${REMAINING} operator facts to fill in`, () => {
    const unfilled = Object.entries(OPERATOR)
      .filter(([, value]) => value.includes(MARKER))
      .map(([key]) => key);

    expect(
      unfilled.length,
      unfilled.length > REMAINING
        ? `${unfilled.length} unfilled: ${unfilled.join(', ')}`
        : `Budget is stale: only ${unfilled.length} left (${unfilled.join(
            ', '
          )}) but the budget says ${REMAINING}. Lower it to ${unfilled.length}.`
    ).toBe(REMAINING);
  });

  it('says so on the page rather than hiding it', () => {
    // A placeholder that never reaches the rendered text would be a blank
    // nobody notices. Every one of them is interpolated into a document.
    const rendered = LEGAL_DOCS.flatMap((doc) =>
      LEGAL_CONTENT.fr[doc].sections.flatMap((section) => [
        ...section.body,
        ...(section.list ?? [])
      ])
    ).join('\n');

    for (const [key, value] of Object.entries(OPERATOR)) {
      if (value.includes(MARKER)) {
        expect(rendered, `${key} is never shown to a reader`).toContain(value);
      }
    }
  });

  it('carries every document in both languages', () => {
    for (const doc of LEGAL_DOCS) {
      expect(LEGAL_CONTENT.fr[doc].sections.length).toBeGreaterThan(0);
      expect(LEGAL_CONTENT.en[doc].sections.length).toBe(
        LEGAL_CONTENT.fr[doc].sections.length
      );
    }
  });
});
