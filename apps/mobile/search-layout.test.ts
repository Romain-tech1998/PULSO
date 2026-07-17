import { describe, expect, it } from 'vitest';

import { MOBILE_SEARCH_PANEL_LAYOUT } from './search-layout';

describe('native intelligent-search overlay layout', () => {
  it('keeps the expanded explanation scrollable, opaque, and within the map surface', () => {
    expect(
      MOBILE_SEARCH_PANEL_LAYOUT.top +
        MOBILE_SEARCH_PANEL_LAYOUT.expandedMaxHeight
    ).toBeLessThanOrEqual(700);
    expect(MOBILE_SEARCH_PANEL_LAYOUT.contentMaxHeight).toBeLessThan(
      MOBILE_SEARCH_PANEL_LAYOUT.expandedMaxHeight
    );
    expect(MOBILE_SEARCH_PANEL_LAYOUT.backgroundColor).toMatch(
      /^#[\da-f]{6}$/i
    );
    expect(MOBILE_SEARCH_PANEL_LAYOUT.layer).toBeGreaterThan(0);
  });
});
