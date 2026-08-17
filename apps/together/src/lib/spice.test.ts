import { describe, expect, it } from 'vitest';
import { chemistryLabel, normalizeSpiceLevel, spiceChemistryMultiplier, spiceLabel } from './spice';

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

  it('makes spice materially change chemistry velocity', () => {
    expect(spiceChemistryMultiplier(1)).toBe(0.6);
    expect(spiceChemistryMultiplier(2)).toBe(1);
    expect(spiceChemistryMultiplier(3)).toBe(1.8);
  });

  it('presents chemistry qualitatively', () => {
    expect(chemistryLabel(0)).toBe('No spark yet');
    expect(chemistryLabel(35)).toBe('Flirty energy');
    expect(chemistryLabel(85)).toBe('Electric');
  });
});
