import { describe, expect, it } from 'vitest';
import { responsivePlaceGrid } from './responsivePlaceGrid';

describe('responsive place grid', () => {
  it('uses the desktop content area after subtracting the expanded sidebar', () => {
    expect(responsivePlaceGrid({ viewportWidth: 1600, sidebarWidth: 248, outerPadding: 64, gap: 10 })).toEqual({
      cardWidth: 365,
      columns: 3,
      gridWidth: 1116,
    });
  });

  it('keeps two cards per row on typical mobile widths', () => {
    expect(responsivePlaceGrid({ viewportWidth: 390, outerPadding: 40, gap: 10 }).columns).toBe(2);
  });

  it('falls back to one card when two readable cards do not fit', () => {
    expect(responsivePlaceGrid({ viewportWidth: 320, outerPadding: 40, gap: 10 }).columns).toBe(1);
  });

  it('accounts for district padding without leaving desktop space unused', () => {
    const result = responsivePlaceGrid({ viewportWidth: 1440, sidebarWidth: 248, outerPadding: 64, innerPadding: 26, gap: 12 });
    expect(result.columns).toBe(3);
    expect(result.gridWidth).toBe(1090);
  });
});
