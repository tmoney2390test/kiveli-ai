import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { companionOnboardingHref, completedOnboardingChatHref, onboardingMembershipReturnTo, onboardingRouteRedirect, previousCompanionOnboardingStep, resolveCompanionOnboardingStep, companionOnboardingStepNumber, type CompanionOnboardingStep } from './onboardingNavigation';

describe('onboarding membership detour', () => {
  it('keeps account deletion reachable before age confirmation and companion setup', () => {
    for (const stage of ['age_confirmation','onboarding','ready'] as const) {
      expect(onboardingRouteRedirect(stage,'/privacy?delete=1')).toBeNull();
    }
    expect(onboardingRouteRedirect('age_confirmation','/chat')).toBe('/age-confirmation');
    expect(onboardingRouteRedirect('onboarding','/chat')).toBe('/choose-companion');
  });
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

  it('routes completed companion setup to the actual first conversation', () => {
    const snapshot = {
      profile: { active_companion_instance_id: 'selected-instance' },
      activeContinuity: { active_companion_instance_id: 'selected-instance' },
      characters: [{ id: 'other-instance', character_template_id: 'other-template' }, { id: 'selected-instance', character_template_id: 'selected-template' }],
      conversations: [{ id: 'first-meeting', character_instance_id: 'selected-instance', kind: 'first_meeting' }],
    } as Snapshot;
    const chatHref = completedOnboardingChatHref(snapshot, 'selected-template');
    expect(chatHref).toBe('/chat?character=selected-instance&conversationId=first-meeting');
    expect(completedOnboardingChatHref(snapshot)).toBe(chatHref);
    expect(onboardingRouteRedirect('ready', '/choose-companion', chatHref)).toBe(chatHref);
    expect(onboardingRouteRedirect('ready', '/age-confirmation', chatHref)).toBe('/home');
  });

  it('preserves world and companion selection across the membership detour', () => {
    const returnTo = companionOnboardingHref('calders-run', 'character', 'gin');
    expect(onboardingMembershipReturnTo(returnTo)).toBe(returnTo);
    expect(onboardingMembershipReturnTo(companionOnboardingHref('vharadren'))).toBe('/choose-companion?step=world&world=vharadren');
    expect(onboardingMembershipReturnTo(companionOnboardingHref('juniper-city', 'about'))).toBe('/choose-companion?step=about&world=juniper-city');
  });

  it('rejects arbitrary return routes and strips unrelated navigation parameters', () => {
    for (const value of [undefined, '/home', '//example.com', 'https://example.com', '/choose-companion/../home', ['bad']]) {
      expect(onboardingMembershipReturnTo(value)).toBe('/choose-companion?step=world');
    }
    expect(onboardingMembershipReturnTo('/choose-companion?step=invalid&world=test&next=/home&companion=gin')).toBe('/choose-companion?step=world&world=test');
  });
});

describe('onboarding back sequence', () => {
  it('returns from Companion to Name without cycling back to World', () => {
    let step: CompanionOnboardingStep | null = 'character';
    const visited: CompanionOnboardingStep[] = [];
    while(step!==null){
      expect(visited).not.toContain(step);
      visited.push(step);
      step=previousCompanionOnboardingStep(step);
    }
    expect(visited).toEqual(['character','world','about','name']);
    expect(visited.map(companionOnboardingStepNumber)).toEqual([4,3,2,1]);
  });
  it('restores the Name step from route params and membership detours', () => {
    expect(resolveCompanionOnboardingStep('name')).toBe('name');
    expect(resolveCompanionOnboardingStep('invalid')).toBe('world');
    expect(onboardingMembershipReturnTo(companionOnboardingHref('juniper-city','name'))).toBe('/choose-companion?step=name&world=juniper-city');
  });
});
