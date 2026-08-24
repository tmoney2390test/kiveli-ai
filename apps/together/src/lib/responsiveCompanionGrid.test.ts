import { describe, expect, it } from 'vitest';
import { responsiveCompanionGrid } from './responsiveCompanionGrid';

describe('responsive companion grid', () => {
  it('uses three portrait-shaped cards on a full desktop canvas', () => {
    expect(responsiveCompanionGrid({ viewportWidth: 1600, sidebarWidth: 92, desktop: true })).toEqual({
      cardHeight: 455,
      cardWidth: 364,
      columns: 3,
      gridWidth: 1116,
    });
  });

  it('keeps two cards when three would make portraits too narrow', () => {
    expect(responsiveCompanionGrid({ viewportWidth: 1024, sidebarWidth: 92, desktop: true }).columns).toBe(2);
  });

  it('keeps the established single-column phone layout', () => {
    const result = responsiveCompanionGrid({ viewportWidth: 390, desktop: false });
    expect(result.columns).toBe(1);
    expect(result.cardWidth / result.cardHeight).toBeCloseTo(.8, 2);
  });
});
