export const PRIVATE_ADULT_TEXT_POLICY_VERSION = 'private-adult-text-v1';

export type ClientSurface = 'web' | 'ios' | 'android' | 'native_or_unknown';
export type ConversationMode = 'direct' | 'group';
export type ContentCapability =
  | 'private_text'
  | 'image_generation'
  | 'video_generation'
  | 'voice_generation'
  | 'public_character'
  | 'public_post'
  | 'conversation_share'
  | 'notification_preview';
export type SexualContentLevel = 'general' | 'mature_nonexplicit' | 'explicit';
export type PrivacyScope = 'private' | 'shared' | 'public';
export type PrivateAdultTextMode = 'off' | 'shadow' | 'on';

export type AdultEligibilityReason =
  | 'verified_adult'
  | 'age_unknown'
  | 'underage'
  | 'restricted_region'
  | 'account_restricted'
  | 'verification_expired';

export interface AdultEligibility {
  allowed: boolean;
  reason: AdultEligibilityReason;
}

export interface CharacterAdultStatus {
  characterId: string;
  declaredAge?: number;
  ageStatus: 'confirmed_adult' | 'confirmed_minor' | 'ambiguous' | 'unknown';
}

export interface ParticipantAdultEligibility {
  allAdults: boolean;
  statuses: CharacterAdultStatus[];
}

export interface PlatformContentPolicyInput {
  clientSurface: ClientSurface;
  capability: ContentCapability;
  sexualContentLevel: SexualContentLevel;
  privacyScope: PrivacyScope;
  conversationMode?: ConversationMode;
  userAdultEligibility: AdultEligibility;
  participantAdultEligibility?: ParticipantAdultEligibility;
  safetyDecision?: { allowed: boolean };
}

export type PlatformContentReasonCode =
  | 'allowed'
  | 'adult_eligibility_required'
  | 'adult_participants_required'
  | 'prohibited_content'
  | 'private_scope_required'
  | 'native_explicit_media_blocked'
  | 'explicit_voice_policy_unchanged'
  | 'public_explicit_content_blocked'
  | 'notification_redacted';

export interface PlatformContentPolicyDecision {
  allowed: boolean;
  reasonCode: PlatformContentReasonCode;
  effectiveContentLevel: SexualContentLevel;
  providerRoute?: 'standard_dialogue' | 'explicit_dialogue';
}

export interface PrivateAdultTextRolloutDecision {
  policyAllowed: boolean;
  generationAllowed: boolean;
  shadowEligible: boolean;
  reasonCode: PlatformContentReasonCode | 'feature_off' | 'feature_shadow';
}

const CURRENT_MINOR_CODING = [
  /\b(?:a|an|the)\s+(?:child|minor|preteen|schoolchild|schoolgirl|schoolboy|young teen(?:ager)?)\b/i,
  /\b(?:middle|high)\s+school\s+(?:student|girl|boy|pupil)\b/i,
  /\b(?:looks|appears|coded|presented|presents)\s+(?:as\s+|like\s+)?(?:a\s+)?(?:child|minor|preteen|schoolchild|young teen(?:ager)?)\b/i,
  /\b(?:age(?:d)?|is)\s+(?:[0-9]|1[0-7])(?:\s+years?\s+old)?\b/i,
];

export function resolveAdultEligibility(input: {
  adultEligibleAt?: string | null;
  ageVerifiedAt?: string | null;
  dateOfBirth?: string | null;
  accountRestricted?: boolean;
  restrictedRegion?: boolean;
  verificationExpiresAt?: string | null;
  now?: Date;
}): AdultEligibility {
  if (input.accountRestricted) return { allowed: false, reason: 'account_restricted' };
  if (input.restrictedRegion) return { allowed: false, reason: 'restricted_region' };
  if (input.dateOfBirth) {
    const birthDate = parseIsoBirthDate(input.dateOfBirth);
    if (!birthDate) return { allowed: false, reason: 'age_unknown' };
    if (!isAtLeastAgeOn(birthDate, 18, input.now ?? new Date())) return { allowed: false, reason: 'underage' };
  }
  if (!input.adultEligibleAt || !input.ageVerifiedAt) return { allowed: false, reason: 'age_unknown' };
  const verifiedAt = Date.parse(input.adultEligibleAt);
  if (!Number.isFinite(verifiedAt)) return { allowed: false, reason: 'age_unknown' };
  if (input.verificationExpiresAt) {
    const expiresAt = Date.parse(input.verificationExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) {
      return { allowed: false, reason: 'verification_expired' };
    }
  }
  return { allowed: true, reason: 'verified_adult' };
}

function parseIsoBirthDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function isAtLeastAgeOn(birthDate: { year: number; month: number; day: number }, age: number, now: Date): boolean {
  const cutoffYear = now.getUTCFullYear() - age;
  if (birthDate.year !== cutoffYear) return birthDate.year < cutoffYear;
  const currentMonth = now.getUTCMonth() + 1;
  return birthDate.month < currentMonth || (birthDate.month === currentMonth && birthDate.day <= now.getUTCDate());
}

export function resolveCharacterAdultStatus(input: {
  characterId: string;
  declaredAge?: unknown;
  descriptiveFields?: unknown[];
}): CharacterAdultStatus {
  const age = Number(input.declaredAge);
  const declaredAge = Number.isInteger(age) && age > 0 ? age : undefined;
  const description = (input.descriptiveFields ?? [])
    .flatMap((value) => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value as Record<string, unknown>).filter((item): item is string => typeof item === 'string') : [])
    .join('\n');
  const youthCoded = CURRENT_MINOR_CODING.some((pattern) => pattern.test(description));
  if (declaredAge !== undefined && declaredAge < 18) {
    return { characterId: input.characterId, declaredAge, ageStatus: 'confirmed_minor' };
  }
  if (youthCoded) {
    return { characterId: input.characterId, ...(declaredAge ? { declaredAge } : {}), ageStatus: declaredAge && declaredAge >= 18 ? 'ambiguous' : 'confirmed_minor' };
  }
  if (declaredAge !== undefined && declaredAge >= 18) {
    return { characterId: input.characterId, declaredAge, ageStatus: 'confirmed_adult' };
  }
  return { characterId: input.characterId, ageStatus: 'unknown' };
}

export function resolveParticipantAdultEligibility(statuses: CharacterAdultStatus[]): ParticipantAdultEligibility {
  return { allAdults: statuses.length > 0 && statuses.every((status) => status.ageStatus === 'confirmed_adult'), statuses };
}

export function resolvePlatformContentPolicy(input: PlatformContentPolicyInput): PlatformContentPolicyDecision {
  if (input.sexualContentLevel !== 'explicit') {
    return {
      allowed: true,
      reasonCode: 'allowed',
      effectiveContentLevel: input.sexualContentLevel,
      ...(input.capability === 'private_text' ? { providerRoute: 'standard_dialogue' as const } : {}),
    };
  }
  if (input.capability === 'notification_preview') return blocked('notification_redacted', 'general');
  if (input.capability === 'public_character' || input.capability === 'public_post' || input.capability === 'conversation_share') {
    return blocked('public_explicit_content_blocked', 'general');
  }
  if (input.privacyScope !== 'private') return blocked('private_scope_required', 'general');
  if (!input.userAdultEligibility.allowed) return blocked('adult_eligibility_required', 'mature_nonexplicit');
  if (!input.participantAdultEligibility?.allAdults) return blocked('adult_participants_required', 'mature_nonexplicit');
  if (input.safetyDecision?.allowed !== true) return blocked('prohibited_content', 'mature_nonexplicit');
  if ((input.capability === 'image_generation' || input.capability === 'video_generation') && input.clientSurface !== 'web') {
    return blocked('native_explicit_media_blocked', 'mature_nonexplicit');
  }
  if (input.capability === 'voice_generation') return blocked('explicit_voice_policy_unchanged', 'mature_nonexplicit');
  return {
    allowed: true,
    reasonCode: 'allowed',
    effectiveContentLevel: 'explicit',
    ...(input.capability === 'private_text' ? { providerRoute: 'explicit_dialogue' as const } : {}),
  };
}

export function normalizePrivateAdultTextMode(value: unknown): PrivateAdultTextMode {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'on' || normalized === 'shadow' ? normalized : 'off';
}

export function applyPrivateAdultTextRollout(
  policy: PlatformContentPolicyDecision,
  mode: PrivateAdultTextMode,
): PrivateAdultTextRolloutDecision {
  if (!policy.allowed) return { policyAllowed: false, generationAllowed: false, shadowEligible: false, reasonCode: policy.reasonCode };
  if (mode === 'off') return { policyAllowed: true, generationAllowed: false, shadowEligible: false, reasonCode: 'feature_off' };
  if (mode === 'shadow') return { policyAllowed: true, generationAllowed: false, shadowEligible: true, reasonCode: 'feature_shadow' };
  return { policyAllowed: true, generationAllowed: true, shadowEligible: false, reasonCode: policy.reasonCode };
}

function blocked(reasonCode: PlatformContentReasonCode, effectiveContentLevel: SexualContentLevel): PlatformContentPolicyDecision {
  return { allowed: false, reasonCode, effectiveContentLevel };
}
