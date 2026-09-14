import { describe, expect, it } from 'vitest';
import { companionOnboardingHref, onboardingMembershipReturnTo, onboardingRouteRedirect } from './onboardingNavigation';

describe('onboarding membership detour', () => {
  it('allows membership after age verification without opening other app routes', () => {
    expect(onboardingRouteRedirect('onboarding', '/subscription')).toBeNull();
    expect(onboardingRouteRedirect('age_confirmation', '/subscription')).toBe('/age-confirmation');
    for (const path of ['/home', '/chat', '/settings', '/explore', '/subscription/other']) {
      expect(onboardingRouteRedirect('onboarding', path)).toBe('/choose-companion');
    }
  });

  it('keeps every setup stage gated until completion', () => {
    expect(onboardingRouteRedirect('age_confirmation', '/age-confirmation')).toBeNull();
    expect(onboardingRouteRedirect('onboarding', '/choose-companion?step=character')).toBeNull();
    expect(onboardingRouteRedirect('ready', '/choose-companion')).toBe('/home');
    expect(onboardingRouteRedirect('ready', '/subscription')).toBeNull();
  });

  it('preserves world and companion selection across the membership detour', () => {
    const returnTo = companionOnboardingHref('calders-run', 'character', 'gin');
    expect(onboardingMembershipReturnTo(returnTo)).toBe(returnTo);
    expect(onboardingMembershipReturnTo(companionOnboardingHref('vharadren'))).toBe('/choose-companion?step=world&world=vharadren');
  });

  it('rejects arbitrary return routes and strips unrelated navigation parameters', () => {
    for (const value of [undefined, '/home', '//example.com', 'https://example.com', '/choose-companion/../home', ['bad']]) {
      expect(onboardingMembershipReturnTo(value)).toBe('/choose-companion?step=world');
    }
    expect(onboardingMembershipReturnTo('/choose-companion?step=invalid&world=test&next=/home&companion=gin')).toBe('/choose-companion?step=world&world=test');
  });
});
