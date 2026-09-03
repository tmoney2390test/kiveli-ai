import {
  applyPrivateAdultTextRollout,
  PRIVATE_ADULT_TEXT_POLICY_VERSION,
  resolveCharacterAdultStatus,
  resolveParticipantAdultEligibility,
  resolvePlatformContentPolicy,
  type CharacterAdultStatus,
  type ConversationMode,
  type DialogueContentMode,
  type PlatformContentPolicyDecision,
  type PrivateAdultTextRolloutDecision,
} from '../../../packages/together-domain/src/index.ts';
import type { AdultAccessContext } from './web-adult-access.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, any>;

export type PrivateDialoguePolicy = {
  requestedMode: DialogueContentMode;
  effectiveMode: DialogueContentMode;
  characterStatuses: CharacterAdultStatus[];
  allParticipantsAdults: boolean;
  policy: PlatformContentPolicyDecision;
  rollout: PrivateAdultTextRolloutDecision;
};

export function characterAdultStatusFromInstance(value: unknown): CharacterAdultStatus {
  const instance = row(value);
  const template = row(instance.together_character_templates);
  const version = row(instance.together_character_versions);
  return resolveCharacterAdultStatus({
    characterId: String(instance.id ?? instance.character_instance_id ?? template.id ?? 'unknown'),
    declaredAge: template.age ?? version.age,
    descriptiveFields: [
      template.description,
      template.short_bio,
      template.biography,
      template.tagline,
      template.backstory,
      version.description,
      version.biography,
      version.personality_config,
      version.communication_style,
      version.boundaries,
    ],
  });
}

export function characterAdultStatusFromGroupParticipant(value: unknown): CharacterAdultStatus {
  const participant = row(value);
  return characterAdultStatusFromInstance(participant.together_character_instances ?? participant);
}

export function resolvePrivateDialoguePolicy(input: {
  access: AdultAccessContext;
  requestedMode: DialogueContentMode;
  conversationMode: ConversationMode;
  participants: unknown[];
  safetyAllowed: boolean;
}): PrivateDialoguePolicy {
  const characterStatuses = input.participants.map(input.conversationMode === 'group' ? characterAdultStatusFromGroupParticipant : characterAdultStatusFromInstance);
  const participantAdultEligibility = resolveParticipantAdultEligibility(characterStatuses);
  const policy = resolvePlatformContentPolicy({
    clientSurface: input.access.client_surface,
    capability: 'private_text',
    sexualContentLevel: input.requestedMode === 'explicit' ? 'explicit' : input.requestedMode === 'standard' ? 'general' : 'mature_nonexplicit',
    privacyScope: 'private',
    conversationMode: input.conversationMode,
    userAdultEligibility: input.access.adult_eligibility,
    participantAdultEligibility,
    safetyDecision: { allowed: input.safetyAllowed },
  });
  const rollout = applyPrivateAdultTextRollout(policy, input.access.private_adult_text_mode);
  const effectiveMode: DialogueContentMode = input.requestedMode !== 'explicit'
    ? input.requestedMode
    : rollout.generationAllowed
    ? 'explicit'
    : input.access.adult_eligibility.allowed
    ? 'mature'
    : 'romance';
  return {
    requestedMode: input.requestedMode,
    effectiveMode,
    characterStatuses,
    allParticipantsAdults: participantAdultEligibility.allAdults,
    policy,
    rollout,
  };
}

export function privateDialoguePolicyMetadata(input: {
  policy: PrivateDialoguePolicy;
  access: AdultAccessContext;
  conversationMode: ConversationMode;
  safetyDisposition?: 'allowed' | 'redirected' | 'blocked';
  providerRoute?: string;
}): Record<string, unknown> {
  const explicitApplied = input.policy.effectiveMode === 'explicit' && input.policy.rollout.generationAllowed;
  return {
    sexualContentLevel: explicitApplied ? 'explicit' : input.policy.effectiveMode === 'standard' ? 'general' : 'mature_nonexplicit',
    privacyScope: 'private',
    clientSurface: input.access.client_surface,
    conversationMode: input.conversationMode,
    contentPolicyVersion: PRIVATE_ADULT_TEXT_POLICY_VERSION,
    adultEligibilityApplied: explicitApplied,
    allParticipantsAdults: input.policy.allParticipantsAdults,
    safetyDisposition: input.safetyDisposition ?? 'allowed',
    ...(input.providerRoute ? { providerRoute: input.providerRoute } : {}),
  };
}

export function privateAdultTextTelemetry(input: {
  policy: PrivateDialoguePolicy;
  access: AdultAccessContext;
  conversationMode: ConversationMode;
  providerRoute?: string;
}): Record<string, unknown> {
  return {
    clientSurface: input.access.client_surface,
    conversationMode: input.conversationMode,
    contentMode: input.policy.requestedMode,
    decision: input.policy.rollout.generationAllowed ? 'allowed' : input.policy.rollout.shadowEligible ? 'shadow' : 'blocked',
    reasonCode: input.policy.rollout.reasonCode,
    allParticipantsAdults: input.policy.allParticipantsAdults,
    providerRoute: input.providerRoute ?? null,
    policyVersion: PRIVATE_ADULT_TEXT_POLICY_VERSION,
  };
}

export async function privateTextProjectionAuthorizedForConversation(input: {
  db: SupabaseClient;
  userId: string;
  continuityId: string;
  conversation: Row;
  access: AdultAccessContext;
}): Promise<boolean> {
  if (input.access.private_adult_text_mode !== 'on' || !input.access.adult_eligibility.allowed) return false;
  let participants: unknown[] = [];
  if (input.conversation.kind === 'group') {
    const { data, error } = await input.db.from('together_conversation_participants')
      .select('character_instance_id,together_character_instances(id,together_character_templates(*),together_character_versions(personality_config,communication_style,boundaries))')
      .eq('conversation_id', input.conversation.id).eq('user_id', input.userId).eq('continuity_id', input.continuityId).is('left_at', null);
    if (error) return false;
    participants = data ?? [];
  } else {
    const characterInstanceId = String(input.conversation.character_instance_id ?? '');
    if (!characterInstanceId) return false;
    const { data, error } = await input.db.from('together_character_instances')
      .select('id,together_character_templates(*),together_character_versions(personality_config,communication_style,boundaries)')
      .eq('id', characterInstanceId).eq('user_id', input.userId).eq('continuity_id', input.continuityId).maybeSingle();
    if (error || !data) return false;
    participants = [data];
  }
  return resolvePrivateDialoguePolicy({ access: input.access, requestedMode: 'explicit', conversationMode: input.conversation.kind === 'group' ? 'group' : 'direct', participants, safetyAllowed: true }).rollout.generationAllowed;
}

function row(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
