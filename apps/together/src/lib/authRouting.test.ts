import { describe, expect, it } from 'vitest';
import { resolveKivelleAccountStage, resolvePostAuthDestination } from './authRouting';

describe('Kivelle account routing', () => {
  it('separates authentication, age confirmation, onboarding, and ready accounts', () => {
    expect(resolvePostAuthDestination({ authenticated: false, snapshot: null })).toBe('/auth?mode=signin');
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: null })).toBeNull();
    expect(resolveKivelleAccountStage(null)).toBe('age_confirmation');
    expect(resolveKivelleAccountStage({ age_verified_at: '2026-08-24', onboarding_completed_at: null })).toBe('onboarding');
    expect(resolveKivelleAccountStage({ age_verified_at: '2026-08-24', onboarding_completed_at: '2026-08-24' })).toBe('ready');
  });

  it('routes new Apple, Google, and password users through the same explicit age gate', () => {
    const newAppleUser = { profile: null };
    const newGoogleUser = { profile: null };
    const newPasswordUser = { profile: null };
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: newAppleUser, requestedNext: '/chat' })).toBe('/age-confirmation');
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: newGoogleUser, requestedNext: '/chat' })).toBe('/age-confirmation');
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: newPasswordUser, requestedNext: '/chat' })).toBe('/age-confirmation');
  });

  it('preserves a protected next route only after onboarding is complete', () => {
    const onboarding = { profile: { age_verified_at: '2026-08-24', onboarding_completed_at: null } };
    const ready = { profile: { age_verified_at: '2026-08-24', onboarding_completed_at: '2026-08-24' } };
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: onboarding, requestedNext: '/chat?conversation=123' })).toBe('/choose-companion');
    expect(resolvePostAuthDestination({ authenticated: true, snapshot: ready, requestedNext: '/chat?conversation=123' })).toBe('/chat?conversation=123');
  });
});
