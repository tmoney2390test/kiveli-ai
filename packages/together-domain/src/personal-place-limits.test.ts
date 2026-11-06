import { describe, expect, it } from 'vitest';
import { personalPlaceLimit } from './personal-place-limits';

describe('personal place limits', () => {
  it('allows 3 Free, 20 Plus, and 50 Max places', () => {
    expect(personalPlaceLimit('free')).toBe(3);
    expect(personalPlaceLimit('kivelle_plus')).toBe(20);
    expect(personalPlaceLimit('kivelle_max')).toBe(50);
  });

  it('defaults unknown or absent access to Free', () => {
    expect(personalPlaceLimit(null)).toBe(3);
    expect(personalPlaceLimit('unknown')).toBe(3);
  });
});
