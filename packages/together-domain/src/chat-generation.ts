import { conversationResponseTokenBudget, type ConversationResponseLength, type ConversationStyle } from './conversation-style.ts';

export const CHAT_DYNAMISM_VALUES = [0, 25, 50, 75, 100] as const;
export type ChatDynamism = (typeof CHAT_DYNAMISM_VALUES)[number];

export const REASONING_PREFERENCES = ['auto', 'none', 'low', 'medium', 'high'] as const;
export type ReasoningPreference = (typeof REASONING_PREFERENCES)[number];
export const REASONING_ORDER = ['none', 'low', 'medium', 'high'] as const;
export type EffectiveReasoningEffort = (typeof REASONING_ORDER)[number];

export type ChatGenerationControlsMode = 'off' | 'shadow' | 'on';
export type DialogueSubscriptionTier = 'free' | 'plus' | 'max';
export type ReasoningReasonCode =
  | 'explicit_user_preference'
  | 'lightweight_turn'
  | 'routine_turn'
  | 'simple_logistics'
  | 'meaningful_interaction'
  | 'major_interaction'
  | 'critical_interaction'
  | 'active_conflict'
  | 'repair_opportunity'
  | 'pending_milestone'
  | 'important_memory'
  | 'open_thread_resolution'
  | 'story_complexity'
  | 'multi_character_coordination'
  | 'director_guided_turn'
  | 'subscription_cap'
  | 'provider_capability_clamp'
  | 'secondary_group_speaker_cap'
  | 'provider_output_token_clamp';

export interface ChatGenerationPreferences {
  chatDynamism: ChatDynamism;
  reasoningPreference: ReasoningPreference;
}

export const DEFAULT_CHAT_GENERATION_PREFERENCES = {
  chatDynamism: 50,
  reasoningPreference: 'auto',
} as const satisfies ChatGenerationPreferences;

export const CHAT_DYNAMISM_TEMPERATURE: Record<ChatDynamism, number> = {
  0: 0.55,
  25: 0.70,
  50: 0.85,
  75: 1.00,
  100: 1.15,
};

export const REASONING_TOKEN_RESERVES: Record<EffectiveReasoningEffort, number> = {
  none: 0,
  low: 384,
  medium: 1024,
  high: 2048,
};

export const MAX_REASONING_BY_PLAN: Record<DialogueSubscriptionTier, EffectiveReasoningEffort> = {
  free: 'low',
  plus: 'medium',
  max: 'high',
};

export const DIALOGUE_GENERATION_PROFILE_VERSION = 'chat-generation-v1';

export interface DialogueReasoningSignals {
  isGreetingOrAcknowledgement: boolean;
  isSimpleLogistics: boolean;
  interactionQuality: 'routine' | 'meaningful' | 'major' | 'critical';
  hasActiveConflict: boolean;
  hasRepairOpportunity: boolean;
  hasPendingMilestone: boolean;
  hasImportantMemoryRecall: boolean;
  hasOpenThreadResolution: boolean;
  hasActiveStoryComplexity: boolean;
  activeSpeakerCount: number;
  directorWasUsed: boolean;
}

export interface DialogueModelCapabilities {
  supportedReasoningEfforts: readonly EffectiveReasoningEffort[];
  supportsTemperature: boolean;
  supportsTemperatureWithReasoning: boolean;
  maxOutputTokens?: number;
}

export interface ResolveDialogueGenerationProfileInput {
  preferences: Partial<ChatGenerationPreferences> | null | undefined;
  provider: 'openai' | 'xai';
  model: string;
  subscriptionTier: DialogueSubscriptionTier;
  providerCapabilities: DialogueModelCapabilities;
  responseStyle: ConversationStyle;
  targetLength: ConversationResponseLength;
  mode: 'direct' | 'group';
  speakerRole?: 'primary' | 'secondary';
  signals: DialogueReasoningSignals;
}

export interface DialogueGenerationProfile {
  requestedReasoning: ReasoningPreference;
  autoDesiredReasoning?: EffectiveReasoningEffort;
  effectiveReasoning: EffectiveReasoningEffort;
  chatDynamism: ChatDynamism;
  temperature?: number;
  visibleTokenBudget: number;
  reasoningTokenReserve: number;
  providerMaxOutputTokens: number;
  reasonCodes: ReasoningReasonCode[];
  profileVersion: string;
}

export interface ProviderGenerationControls {
  reasoningEffort:EffectiveReasoningEffort;
  temperature?:number;
  maxOutputTokens:number;
  promptDynamismApplied:boolean;
}

export function providerGenerationControls(profile:DialogueGenerationProfile,mode:ChatGenerationControlsMode):ProviderGenerationControls{
  if(mode!=='on')return{reasoningEffort:'none',maxOutputTokens:profile.visibleTokenBudget,promptDynamismApplied:false};
  return{reasoningEffort:profile.effectiveReasoning,maxOutputTokens:profile.providerMaxOutputTokens,promptDynamismApplied:true,...(profile.temperature!==undefined?{temperature:profile.temperature}:{})};
}

export function normalizeChatDynamism(value: unknown): ChatDynamism {
  return typeof value === 'number' && Number.isFinite(value) && CHAT_DYNAMISM_VALUES.includes(value as ChatDynamism)
    ? value as ChatDynamism
    : DEFAULT_CHAT_GENERATION_PREFERENCES.chatDynamism;
}

export function normalizeReasoningPreference(value: unknown): ReasoningPreference {
  return typeof value === 'string' && REASONING_PREFERENCES.includes(value as ReasoningPreference)
    ? value as ReasoningPreference
    : DEFAULT_CHAT_GENERATION_PREFERENCES.reasoningPreference;
}

export function normalizeChatGenerationPreferences(value: unknown): ChatGenerationPreferences {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    chatDynamism: normalizeChatDynamism(record['chatDynamism']),
    reasoningPreference: normalizeReasoningPreference(record['reasoningPreference']),
  };
}

export function normalizeChatGenerationControlsMode(value: unknown): ChatGenerationControlsMode {
  return value === 'shadow' || value === 'on' ? value : 'off';
}

export function normalizeDialogueSubscriptionTier(value: unknown): DialogueSubscriptionTier {
  if (value === 'kivelle_max' || value === 'unlimited' || value === 'max') return 'max';
  if (value === 'kivelle_plus' || value === 'together_plus' || value === 'plus') return 'plus';
  return 'free';
}

export function reasoningEffortMaxForTier(value: unknown): EffectiveReasoningEffort {
  return MAX_REASONING_BY_PLAN[normalizeDialogueSubscriptionTier(value)];
}

export function reasoningPreferenceAllowedForTier(preference: unknown, tier: unknown): boolean {
  const normalized = normalizeReasoningPreference(preference);
  if (normalized === 'auto') return true;
  return reasoningRank(normalized) <= reasoningRank(reasoningEffortMaxForTier(tier));
}

export function lowerReasoningEffort(effort: EffectiveReasoningEffort, levels: number): EffectiveReasoningEffort {
  const index = REASONING_ORDER.indexOf(effort);
  return REASONING_ORDER[Math.max(0, index - Math.max(0, Math.floor(levels)))] ?? 'none';
}

export function resolveAutoReasoning(signals: DialogueReasoningSignals): { effort: EffectiveReasoningEffort; reasonCodes: ReasoningReasonCode[] } {
  if (
    signals.isGreetingOrAcknowledgement &&
    signals.interactionQuality === 'routine' &&
    !signals.hasActiveConflict &&
    !signals.hasPendingMilestone &&
    !signals.hasImportantMemoryRecall &&
    !signals.hasActiveStoryComplexity
  ) return { effort: 'none', reasonCodes: ['lightweight_turn'] };

  let score = 0;
  const reasonCodes: ReasoningReasonCode[] = [];
  if (signals.isSimpleLogistics) reasonCodes.push('simple_logistics');
  if (signals.interactionQuality === 'meaningful') { score += 1; reasonCodes.push('meaningful_interaction'); }
  if (signals.interactionQuality === 'major') { score += 2; reasonCodes.push('major_interaction'); }
  if (signals.interactionQuality === 'critical') { score += 3; reasonCodes.push('critical_interaction'); }
  if (signals.hasActiveConflict) { score += 2; reasonCodes.push('active_conflict'); }
  if (signals.hasRepairOpportunity) { score += 2; reasonCodes.push('repair_opportunity'); }
  if (signals.hasPendingMilestone) { score += 2; reasonCodes.push('pending_milestone'); }
  if (signals.hasImportantMemoryRecall) { score += 1; reasonCodes.push('important_memory'); }
  if (signals.hasOpenThreadResolution) { score += 1; reasonCodes.push('open_thread_resolution'); }
  if (signals.hasActiveStoryComplexity) { score += 2; reasonCodes.push('story_complexity'); }
  if (signals.activeSpeakerCount >= 3) { score += 1; reasonCodes.push('multi_character_coordination'); }
  if (signals.directorWasUsed) { score += 1; reasonCodes.push('director_guided_turn'); }
  if (score <= 0) return { effort: 'none', reasonCodes: reasonCodes.length ? reasonCodes : ['routine_turn'] };
  if (score <= 2) return { effort: 'low', reasonCodes };
  if (score <= 5) return { effort: 'medium', reasonCodes };
  return { effort: 'high', reasonCodes };
}

export function resolveDialogueModelCapabilities(input: { provider: 'openai' | 'xai'; model: string }): DialogueModelCapabilities {
  const model = input.model.trim().toLowerCase();
  if (input.provider === 'xai') {
    if (model.includes('grok-4.20-multi-agent')) return { supportedReasoningEfforts: ['low', 'medium', 'high'], supportsTemperature: true, supportsTemperatureWithReasoning: true, maxOutputTokens: 16_384 };
    if (model.includes('grok-4.6') || model.includes('grok-4.5')) return { supportedReasoningEfforts: ['low', 'medium', 'high'], supportsTemperature: true, supportsTemperatureWithReasoning: true, maxOutputTokens: 16_384 };
    if (model.includes('grok-4.3')) return { supportedReasoningEfforts: REASONING_ORDER, supportsTemperature: true, supportsTemperatureWithReasoning: true, maxOutputTokens: 16_384 };
    return { supportedReasoningEfforts: ['none'], supportsTemperature: true, supportsTemperatureWithReasoning: false, maxOutputTokens: 8_192 };
  }
  if (model.includes('gpt-5-pro')) return { supportedReasoningEfforts: ['high'], supportsTemperature: false, supportsTemperatureWithReasoning: false, maxOutputTokens: 32_768 };
  if (model.includes('gpt-5') || model.startsWith('o')) return { supportedReasoningEfforts: REASONING_ORDER, supportsTemperature: true, supportsTemperatureWithReasoning: false, maxOutputTokens: 32_768 };
  return { supportedReasoningEfforts: ['none'], supportsTemperature: true, supportsTemperatureWithReasoning: false, maxOutputTokens: 8_192 };
}

export function resolveDialogueGenerationProfile(input: ResolveDialogueGenerationProfileInput): DialogueGenerationProfile {
  const preferences = normalizeChatGenerationPreferences(input.preferences);
  const reasonCodes: ReasoningReasonCode[] = [];
  const auto = preferences.reasoningPreference === 'auto' ? resolveAutoReasoning(input.signals) : null;
  let effort: EffectiveReasoningEffort = auto?.effort ?? preferences.reasoningPreference as EffectiveReasoningEffort;
  reasonCodes.push(...(auto?.reasonCodes ?? ['explicit_user_preference']));

  if (input.mode === 'group' && input.speakerRole === 'secondary') {
    const lowered = lowerReasoningEffort(effort, 1);
    if (lowered !== effort) reasonCodes.push('secondary_group_speaker_cap');
    effort = lowered;
  }
  const planCap = MAX_REASONING_BY_PLAN[input.subscriptionTier];
  if (reasoningRank(effort) > reasoningRank(planCap)) {
    effort = planCap;
    reasonCodes.push('subscription_cap');
  }
  const providerEffort = nearestSupportedEffort(effort, input.providerCapabilities.supportedReasoningEfforts);
  if (providerEffort !== effort || !input.providerCapabilities.supportedReasoningEfforts.includes(effort)) reasonCodes.push('provider_capability_clamp');
  effort = providerEffort;

  const visibleTokenBudget = conversationResponseTokenBudget({ style: input.responseStyle, length: input.targetLength });
  let reasoningTokenReserve = REASONING_TOKEN_RESERVES[effort];
  let providerMaxOutputTokens = visibleTokenBudget + reasoningTokenReserve;
  const providerMaximum = input.providerCapabilities.maxOutputTokens;
  if (providerMaximum !== undefined && providerMaxOutputTokens > providerMaximum) {
    providerMaxOutputTokens = providerMaximum;
    reasoningTokenReserve = Math.max(0, providerMaxOutputTokens - visibleTokenBudget);
    reasonCodes.push('provider_output_token_clamp');
  }
  const canUseTemperature = input.providerCapabilities.supportsTemperature &&
    (effort === 'none' || input.providerCapabilities.supportsTemperatureWithReasoning);

  return {
    requestedReasoning: preferences.reasoningPreference,
    ...(auto ? { autoDesiredReasoning: auto.effort } : {}),
    effectiveReasoning: effort,
    chatDynamism: preferences.chatDynamism,
    ...(canUseTemperature ? { temperature: CHAT_DYNAMISM_TEMPERATURE[preferences.chatDynamism] } : {}),
    visibleTokenBudget,
    reasoningTokenReserve,
    providerMaxOutputTokens,
    reasonCodes,
    profileVersion: DIALOGUE_GENERATION_PROFILE_VERSION,
  };
}

export function chatDynamismLabel(value: unknown): 'Grounded' | 'Steady' | 'Natural' | 'Expressive' | 'Wild' {
  return ({ 0: 'Grounded', 25: 'Steady', 50: 'Natural', 75: 'Expressive', 100: 'Wild' } as const)[normalizeChatDynamism(value)];
}

export function reasoningPreferenceLabel(value: unknown): 'Auto' | 'Fast' | 'Balanced' | 'Thoughtful' | 'Deep' {
  return ({ auto: 'Auto', none: 'Fast', low: 'Balanced', medium: 'Thoughtful', high: 'Deep' } as const)[normalizeReasoningPreference(value)];
}

export function chatDynamismPrompt(value: unknown, mode: 'direct' | 'group' = 'direct'): string {
  const level = normalizeChatDynamism(value);
  const instruction: Record<ChatDynamism, string> = {
    0: 'Prefer clear, literal, consistent phrasing. Avoid decorative flourishes and surprising tonal shifts. Stay highly predictable without becoming robotic.',
    25: 'Use mild phrasing variation and natural emotional expression. Prioritize continuity and conversational clarity.',
    50: 'Balance expressive variety with grounded characterization. Allow organic humor, emotion, and fresh phrasing without overwriting the scene.',
    75: 'Use more colorful wording, imagery, humor, emotional texture, and spontaneous phrasing while remaining faithful to context.',
    100: 'Allow bold, playful, and surprising expression. Take stylistic risks, but never invent facts, contradict memory, break character, or override scene reality.',
  };
  return `<CHAT_DYNAMISM>\nLevel: ${chatDynamismLabel(level)}\n\nThis controls expressive delivery, not truth, canon, memory, relationship state, safety, response length, provider routing, or group participation.\n\n${instruction[level]}\n\nInvent expression, never facts.${mode === 'group' ? '\nApply this expressive range within each character’s established voice. Do not make the participants sound alike.' : ''}\n</CHAT_DYNAMISM>`;
}

function reasoningRank(effort: EffectiveReasoningEffort): number {
  return REASONING_ORDER.indexOf(effort);
}

function nearestSupportedEffort(requested: EffectiveReasoningEffort, supported: readonly EffectiveReasoningEffort[]): EffectiveReasoningEffort {
  if (supported.includes(requested)) return requested;
  const requestedRank = reasoningRank(requested);
  for (let index = requestedRank - 1; index >= 0; index -= 1) {
    const candidate = REASONING_ORDER[index];
    if (candidate && supported.includes(candidate)) return candidate;
  }
  return 'none';
}
