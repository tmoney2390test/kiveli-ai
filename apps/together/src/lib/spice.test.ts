import { describe, expect, it } from 'vitest';
import { normalizeSpiceLevel, spiceLabel } from './spice';

describe('character spice level', () => {
  it('keeps authored levels and safely normalizes invalid data', () => {
    expect(normalizeSpiceLevel(1)).toBe(1);
    expect(normalizeSpiceLevel(3)).toBe(3);
    expect(normalizeSpiceLevel(9)).toBe(2);
  });

  it('uses clear non-permission language', () => {
    expect(spiceLabel(1)).toBe('Mild chemistry');
    expect(spiceLabel(2)).toBe('Flirty chemistry');
    expect(spiceLabel(3)).toBe('Bold chemistry');
  });
});
