import { describe, expect, it } from 'vitest';
import { isLifeSetupPath, isPublicAppPath, safeAppReturnPath, signInPathFor } from './sessionRouting';

describe('session routing', () => {
  it('recognizes only routes that can safely render without a session', () => {
    expect(isPublicAppPath('/auth')).toBe(true);
    expect(isPublicAppPath('/auth/callback')).toBe(true);
    expect(isPublicAppPath('/home')).toBe(false);
    expect(isPublicAppPath('/character/maya')).toBe(false);
  });

  it('keeps valid in-app deep links and rejects external or auth loops', () => {
    expect(safeAppReturnPath('/character/maya?from=home')).toBe('/character/maya?from=home');
    expect(safeAppReturnPath('/auth')).toBeNull();
    expect(safeAppReturnPath('//example.com/home')).toBeNull();
    expect(safeAppReturnPath('https://example.com/home')).toBeNull();
  });

  it('builds a sign-in route that preserves the protected destination', () => {
    expect(signInPathFor('/home')).toBe('/auth?mode=signin&next=%2Fhome');
    expect(signInPathFor('/auth')).toBe('/auth?mode=signin');
  });

  it('allows first-life setup routes to finish after bootstrap', () => {
    expect(isLifeSetupPath('/choose-companion')).toBe(true);
    expect(isLifeSetupPath('/create/companion')).toBe(true);
    expect(isLifeSetupPath('/home')).toBe(false);
  });
});
