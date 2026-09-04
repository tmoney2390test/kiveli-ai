import { describe, expect, it } from 'vitest';
import { isLifeSetupPath, isPublicAppPath, joinPathFor, safeAppReturnPath, shouldHoldPrivateWebRouteForHydration, shouldKeepAuthTransitionMounted, signInPathFor } from './sessionRouting';

describe('session routing', () => {
  it('keeps auth handoff routes mounted when a session appears',()=>{
    expect(shouldKeepAuthTransitionMounted('/auth')).toBe(true);
    expect(shouldKeepAuthTransitionMounted('/auth/callback/')).toBe(true);
    expect(shouldKeepAuthTransitionMounted('/reset-password')).toBe(true);
    expect(shouldKeepAuthTransitionMounted('/home')).toBe(false);
  });

  it('recognizes only routes that can safely render without a session', () => {
    expect(isPublicAppPath('/')).toBe(true);
    expect(isPublicAppPath('/auth')).toBe(true);
    expect(isPublicAppPath('/auth/callback')).toBe(true);
    expect(isPublicAppPath('/terms')).toBe(true);
    expect(isPublicAppPath('/privacy-policy')).toBe(true);
    expect(isPublicAppPath('/community-guidelines')).toBe(true);
    expect(isPublicAppPath('/help')).toBe(true);
    expect(isPublicAppPath('/onboarding')).toBe(true);
    expect(isPublicAppPath('/home')).toBe(false);
    expect(isPublicAppPath('/character/maya')).toBe(false);
  });

  it('holds private static web routes until browser hydration is complete', () => {
    expect(shouldHoldPrivateWebRouteForHydration({ platform: 'web', hydrated: false, pathname: '/settings' })).toBe(true);
    expect(shouldHoldPrivateWebRouteForHydration({ platform: 'web', hydrated: true, pathname: '/settings' })).toBe(false);
    expect(shouldHoldPrivateWebRouteForHydration({ platform: 'web', hydrated: false, pathname: '/auth' })).toBe(false);
    expect(shouldHoldPrivateWebRouteForHydration({ platform: 'ios', hydrated: false, pathname: '/settings' })).toBe(false);
  });

  it('keeps valid in-app deep links and rejects external or auth loops', () => {
    expect(safeAppReturnPath('/home')).toBe('/home');
    expect(safeAppReturnPath('/chat?conversation=123')).toBe('/chat?conversation=123');
    expect(safeAppReturnPath('/character/maya?from=home')).toBe('/character/maya?from=home');
    expect(safeAppReturnPath('/auth')).toBeNull();
    expect(safeAppReturnPath('/auth/callback?code=secret')).toBeNull();
    expect(safeAppReturnPath('/age-confirmation')).toBeNull();
    expect(safeAppReturnPath('//example.com/home')).toBeNull();
    expect(safeAppReturnPath('/\\evil.example')).toBeNull();
    expect(safeAppReturnPath('/%5C%5Cevil.example')).toBeNull();
    expect(safeAppReturnPath('/%2F%2Fevil.example')).toBeNull();
    expect(safeAppReturnPath('/%252F%252Fevil.example')).toBeNull();
    expect(safeAppReturnPath('https://example.com/home')).toBeNull();
  });

  it('builds a sign-in route that preserves the protected destination', () => {
    expect(signInPathFor('/home')).toBe('/auth?mode=signin&next=%2Fhome');
    expect(signInPathFor('/singles?world=neon-kyo')).toBe(
      '/auth?mode=signin&next=%2Fsingles%3Fworld%3Dneon-kyo',
    );
    expect(signInPathFor('/auth')).toBe('/auth?mode=signin');
  });

  it('builds a join route that can preserve a landing-page destination', () => {
    expect(joinPathFor()).toBe('/auth?mode=signup');
    expect(joinPathFor('/singles?world=juniper-city')).toBe(
      '/auth?mode=signup&next=%2Fsingles%3Fworld%3Djuniper-city',
    );
    expect(joinPathFor('/')).toBe('/auth?mode=signup');
  });

  it('allows first-life setup routes to finish after bootstrap', () => {
    expect(isLifeSetupPath('/choose-companion')).toBe(true);
    expect(isLifeSetupPath('/quick-start')).toBe(true);
    expect(isLifeSetupPath('/age-confirmation')).toBe(true);
    expect(isLifeSetupPath('/create/companion')).toBe(true);
    expect(isLifeSetupPath('/home')).toBe(false);
  });
});
