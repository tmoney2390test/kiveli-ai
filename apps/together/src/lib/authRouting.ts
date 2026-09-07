import { safeAppReturnPath } from './sessionRouting';

export type AuthProfile = { age_verified_at?: string | null; onboarding_completed_at?: string | null } | null;

export type KivelleAccountStage = 'age_confirmation' | 'onboarding' | 'ready';

export function resolveKivelleAccountStage(profile: AuthProfile): KivelleAccountStage {
  if (!profile?.age_verified_at) return 'age_confirmation';
  if (!profile.onboarding_completed_at) return 'onboarding';
  return 'ready';
}

export function isFullyOnboarded(profile: AuthProfile) {
  return resolveKivelleAccountStage(profile) === 'ready';
}

export function resolvePostAuthDestination(input: {
  authenticated: boolean;
  snapshot: { profile: AuthProfile } | null;
  requestedNext?: string | string[] | null;
}): string | null {
  if (!input.authenticated) return '/auth?mode=signin';
  if (!input.snapshot) return null;
  const stage = resolveKivelleAccountStage(input.snapshot.profile);
  if (stage === 'age_confirmation') return '/age-confirmation';
  if (stage === 'onboarding') return '/choose-companion';
  return safeAppReturnPath(input.requestedNext) ?? '/home';
}
