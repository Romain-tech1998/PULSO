import { describe, expect, it } from 'vitest';

import { EVENT_CATEGORIES, MONTREAL_TIMEZONE } from './index.js';

describe('MVP domain vocabulary', () => {
  it('keeps the accepted compact category family and Montréal timezone', () => {
    expect(EVENT_CATEGORIES).toHaveLength(6);
    expect(MONTREAL_TIMEZONE).toBe('America/Toronto');
  });
});
