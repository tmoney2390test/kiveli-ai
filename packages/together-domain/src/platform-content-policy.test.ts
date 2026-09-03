import { describe, expect, it } from 'vitest';
import {
  applyPrivateAdultTextRollout,
  resolveAdultEligibility,
  resolveCharacterAdultStatus,
  resolveParticipantAdultEligibility,
  resolvePlatformContentPolicy,
  type ClientSurface,
  type ContentCapability,
} from './platform-content-policy.ts';

const adult = { allowed: true, reason: 'verified_adult' as const };
const participants = resolveParticipantAdultEligibility([
  resolveCharacterAdultStatus({ characterId: 'adult-1', declaredAge: 26, descriptiveFields: ['An adult architect.'] }),
]);
const base = { privacyScope: 'private' as const, sexualContentLevel: 'explicit' as const, userAdultEligibility: adult, participantAdultEligibility: participants, safetyDecision: { allowed: true } };

describe('platform content policy', () => {
  it.each(['web', 'ios', 'android'] as ClientSurface[])('%s allows eligible explicit private text', (clientSurface) => {
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability: 'private_text', conversationMode: 'direct' })).toMatchObject({ allowed: true, providerRoute: 'explicit_dialogue' });
  });
  it.each(['general', 'mature_nonexplicit'] as const)('allows %s private text without adult eligibility', (sexualContentLevel) => {
    expect(resolvePlatformContentPolicy({
      ...base,
      clientSurface: 'android',
      capability: 'private_text',
      sexualContentLevel,
      userAdultEligibility: { allowed: false, reason: 'age_unknown' },
    }).allowed).toBe(true);
  });
  it.each([
    ['ios', 'image_generation'], ['android', 'image_generation'], ['ios', 'video_generation'], ['android', 'video_generation'],
  ] as Array<[ClientSurface, ContentCapability]>)('%s blocks explicit %s', (clientSurface, capability) => {
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability }).reasonCode).toBe('native_explicit_media_blocked');
  });
  it.each(['web', 'ios', 'android'] as ClientSurface[])('%s blocks explicit public and notification content', (clientSurface) => {
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability: 'public_post', privacyScope: 'public' }).allowed).toBe(false);
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability: 'public_character', privacyScope: 'public' }).allowed).toBe(false);
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability: 'conversation_share', privacyScope: 'shared' }).allowed).toBe(false);
    expect(resolvePlatformContentPolicy({ ...base, clientSurface, capability: 'notification_preview' }).reasonCode).toBe('notification_redacted');
  });
  it('keeps web adult media available to the separate media entitlement policy', () => {
    expect(resolvePlatformContentPolicy({ ...base, clientSurface: 'web', capability: 'image_generation' }).allowed).toBe(true);
    expect(resolvePlatformContentPolicy({ ...base, clientSurface: 'web', capability: 'video_generation' }).allowed).toBe(true);
  });
  it('does not use subscription data in an adult-content decision', () => {
    expect('subscriptionTier' in base).toBe(false);
  });
});

describe('adult eligibility and character adulthood', () => {
  it('requires durable server age fields', () => {
    expect(resolveAdultEligibility({ adultEligibleAt: '2026-01-01T00:00:00Z', ageVerifiedAt: '2026-01-01T00:00:00Z' }).allowed).toBe(true);
    expect(resolveAdultEligibility({ adultEligibleAt: null, ageVerifiedAt: null }).reason).toBe('age_unknown');
    expect(resolveAdultEligibility({ adultEligibleAt: '2026-01-01T00:00:00Z', ageVerifiedAt: '2026-01-01T00:00:00Z', accountRestricted: true }).reason).toBe('account_restricted');
  });
  it('fails closed when a stored birthdate is under 18 even if stale verification timestamps exist', () => {
    expect(resolveAdultEligibility({
      adultEligibleAt: '2026-01-01T00:00:00Z', ageVerifiedAt: '2026-01-01T00:00:00Z',
      dateOfBirth: '2010-09-03', now: new Date('2026-09-02T12:00:00Z'),
    })).toEqual({ allowed: false, reason: 'underage' });
  });
  it('accepts a valid adult birthdate with durable verification timestamps', () => {
    expect(resolveAdultEligibility({
      adultEligibleAt: '2026-01-01T00:00:00Z', ageVerifiedAt: '2026-01-01T00:00:00Z',
      dateOfBirth: '2008-09-02', now: new Date('2026-09-02T12:00:00Z'),
    })).toEqual({ allowed: true, reason: 'verified_adult' });
  });
  it('fails closed for missing, minor, and deceptively youth-coded character ages', () => {
    expect(resolveCharacterAdultStatus({ characterId: 'unknown' }).ageStatus).toBe('unknown');
    expect(resolveCharacterAdultStatus({ characterId: 'minor', declaredAge: 17 }).ageStatus).toBe('confirmed_minor');
    expect(resolveCharacterAdultStatus({ characterId: 'conflict', declaredAge: 24, descriptiveFields: ['A high school student'] }).ageStatus).toBe('ambiguous');
    expect(resolveCharacterAdultStatus({ characterId: 'adult', declaredAge: 24, descriptiveFields: ['An adult journalist'] }).ageStatus).toBe('confirmed_adult');
  });
  it('recomputes all-adult group eligibility from the current roster', () => {
    const oneAdult = [resolveCharacterAdultStatus({ characterId: 'a', declaredAge: 22 })];
    const withUnknown = [...oneAdult, resolveCharacterAdultStatus({ characterId: 'b' })];
    expect(resolveParticipantAdultEligibility(oneAdult).allAdults).toBe(true);
    expect(resolveParticipantAdultEligibility(withUnknown).allAdults).toBe(false);
    expect(resolveParticipantAdultEligibility(oneAdult).allAdults).toBe(true);
  });
});

describe('private adult text rollout', () => {
  const allowed = resolvePlatformContentPolicy({ ...base, clientSurface: 'ios', capability: 'private_text' });
  it('supports off, metadata-only shadow, and production-on behavior', () => {
    expect(applyPrivateAdultTextRollout(allowed, 'off')).toMatchObject({ generationAllowed: false, shadowEligible: false });
    expect(applyPrivateAdultTextRollout(allowed, 'shadow')).toMatchObject({ generationAllowed: false, shadowEligible: true });
    expect(applyPrivateAdultTextRollout(allowed, 'on')).toMatchObject({ generationAllowed: true, shadowEligible: false });
  });
});
