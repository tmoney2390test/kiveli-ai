import type { KivelleAccountStage } from './authRouting';
import { isAgeConfirmationPath, isCompanionOnboardingPath } from './sessionRouting';

export function onboardingRouteRedirect(stage: KivelleAccountStage, pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0]?.replace(/\/+$/, '') || '/';
  if (stage === 'age_confirmation') return isAgeConfirmationPath(path) ? null : '/age-confirmation';
  if (stage === 'onboarding') return isCompanionOnboardingPath(path) || path === '/subscription' ? null : '/choose-companion';
  return isAgeConfirmationPath(path) || isCompanionOnboardingPath(path) ? '/home' : null;
}

export function companionOnboardingHref(world?: string, step: 'world' | 'character' = 'world', companion?: string) {
  const params = new URLSearchParams({ step });
  if (world) params.set('world', world);
  if (companion && step === 'character') params.set('companion', companion);
  return `/choose-companion?${params.toString()}`;
}

/** Incomplete accounts may return only to companion setup, never an arbitrary app route. */
export function onboardingMembershipReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1200 || !value.startsWith('/choose-companion?')) return companionOnboardingHref();
  const params = new URLSearchParams(value.slice(value.indexOf('?') + 1));
  return companionOnboardingHref(params.get('world') || undefined, params.get('step') === 'character' ? 'character' : 'world', params.get('companion') || undefined);
}
