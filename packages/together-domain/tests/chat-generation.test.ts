import { describe, expect, it } from 'vitest';
import {
  CHAT_DYNAMISM_TEMPERATURE,
  CHAT_DYNAMISM_VALUES,
  DEFAULT_CHAT_GENERATION_PREFERENCES,
  REASONING_TOKEN_RESERVES,
  chatDynamismPrompt,
  geminiThinkingConfig,
  limitVisibleDialogue,
  lowerReasoningEffort,
  normalizeChatDynamism,
  normalizeChatGenerationControlsMode,
  normalizeChatGenerationPreferences,
  normalizeDialogueSubscriptionTier,
  normalizeReasoningPreference,
  reasoningEffortMaxForTier,
  reasoningPreferenceAllowedForTier,
  reconcileReasoningPreferenceForTier,
  providerGenerationControls,
  resolveAutoReasoning,
  resolveDialogueGenerationProfile,
  resolveDialogueModelCapabilities,
  visibleDialoguePrefix,
  type DialogueReasoningSignals,
  type ResolveDialogueGenerationProfileInput,
} from '../src/chat-generation.ts';

const routineSignals: DialogueReasoningSignals = {
  isGreetingOrAcknowledgement: false,
  isSimpleLogistics: false,
  interactionQuality: 'routine',
  hasActiveConflict: false,
  hasRepairOpportunity: false,
  hasPendingMilestone: false,
  hasImportantMemoryRecall: false,
  hasOpenThreadResolution: false,
  hasActiveStoryComplexity: false,
  activeSpeakerCount: 1,
  directorWasUsed: false,
};

const baseInput: ResolveDialogueGenerationProfileInput = {
  preferences: DEFAULT_CHAT_GENERATION_PREFERENCES,
  provider: 'openai',
  model: 'gpt-5.6-luna',
  subscriptionTier: 'max',
  providerCapabilities: resolveDialogueModelCapabilities({ provider: 'openai', model: 'gpt-5.6-luna' }),
  responseStyle: 'texting',
  targetLength: 'short',
  mode: 'direct',
  signals: routineSignals,
};

describe('chat generation preference normalization', () => {
  it.each([undefined, null, Number.NaN, [], {}, '50', 40])('defaults invalid dynamism %p', (value) => {
    expect(normalizeChatDynamism(value)).toBe(50);
  });

  it.each(CHAT_DYNAMISM_VALUES)('retains supported dynamism %d without rounding', (value) => {
    expect(normalizeChatDynamism(value)).toBe(value);
  });

  it.each(['auto', 'none', 'low', 'medium', 'high'] as const)('retains reasoning preference %s', (value) => {
    expect(normalizeReasoningPreference(value)).toBe(value);
  });

  it.each([undefined, null, [], {}, 'xhigh', 'balanced', 1])('defaults invalid reasoning %p', (value) => {
    expect(normalizeReasoningPreference(value)).toBe('auto');
  });

  it('normalizes missing, partial, and legacy preference records without mutating legacy fields', () => {
    expect(normalizeChatGenerationPreferences(undefined)).toEqual(DEFAULT_CHAT_GENERATION_PREFERENCES);
    expect(normalizeChatGenerationPreferences({ chatDynamism: 75 })).toEqual({ chatDynamism: 75, reasoningPreference: 'auto' });
    const legacy = { responseStyle: 'paragraph', voicePreset: 'warm', reasoningPreference: 'medium' };
    expect(normalizeChatGenerationPreferences(legacy)).toEqual({ chatDynamism: 50, reasoningPreference: 'medium' });
    expect(legacy).toEqual({ responseStyle: 'paragraph', voicePreset: 'warm', reasoningPreference: 'medium' });
  });

  it('fails rollout mode and tier parsing closed', () => {
    expect(normalizeChatGenerationControlsMode('on')).toBe('on');
    expect(normalizeChatGenerationControlsMode('shadow')).toBe('shadow');
    expect(normalizeChatGenerationControlsMode('enabled')).toBe('off');
    expect(normalizeDialogueSubscriptionTier('kivelle_plus')).toBe('plus');
    expect(normalizeDialogueSubscriptionTier('unlimited')).toBe('max');
    expect(normalizeDialogueSubscriptionTier('unknown')).toBe('free');
    expect(reasoningEffortMaxForTier('free')).toBe('low');
    expect(reasoningEffortMaxForTier('kivelle_plus')).toBe('medium');
    expect(reasoningEffortMaxForTier('kivelle_max')).toBe('high');
    expect(reconcileReasoningPreferenceForTier('high','kivelle_plus')).toBe('medium');
    expect(reconcileReasoningPreferenceForTier('medium','free')).toBe('low');
    expect(reconcileReasoningPreferenceForTier('auto','free')).toBe('auto');
  });
});

describe('auto reasoning', () => {
  it('uses none for greetings and routine turns', () => {
    expect(resolveAutoReasoning({ ...routineSignals, isGreetingOrAcknowledgement: true })).toEqual({ effort: 'none', reasonCodes: ['lightweight_turn'] });
    expect(resolveAutoReasoning(routineSignals)).toEqual({ effort: 'none', reasonCodes: ['routine_turn'] });
  });

  it('does not treat simple logistics as inherently complex', () => {
    expect(resolveAutoReasoning({ ...routineSignals, isSimpleLogistics: true })).toEqual({ effort: 'none', reasonCodes: ['simple_logistics'] });
  });

  it.each([
    [{ interactionQuality: 'meaningful' }, 'low', ['meaningful_interaction']],
    [{ interactionQuality: 'major' }, 'low', ['major_interaction']],
    [{ interactionQuality: 'critical' }, 'medium', ['critical_interaction']],
    [{ hasActiveConflict: true }, 'low', ['active_conflict']],
    [{ hasRepairOpportunity: true }, 'low', ['repair_opportunity']],
    [{ hasPendingMilestone: true }, 'low', ['pending_milestone']],
    [{ hasImportantMemoryRecall: true }, 'low', ['important_memory']],
    [{ hasOpenThreadResolution: true }, 'low', ['open_thread_resolution']],
    [{ hasActiveStoryComplexity: true }, 'low', ['story_complexity']],
    [{ activeSpeakerCount: 3 }, 'low', ['multi_character_coordination']],
    [{ directorWasUsed: true }, 'low', ['director_guided_turn']],
  ] as const)('maps semantic signal %o deterministically', (patch, effort, reasonCodes) => {
    expect(resolveAutoReasoning({ ...routineSignals, ...patch })).toEqual({ effort, reasonCodes });
  });

  it('requires multiple strong signals before selecting high', () => {
    const result = resolveAutoReasoning({ ...routineSignals, interactionQuality: 'critical', hasActiveConflict: true, hasPendingMilestone: true });
    expect(result.effort).toBe('high');
    expect(result.reasonCodes).toEqual(['critical_interaction', 'active_conflict', 'pending_milestone']);
  });
});

describe('generation profile resolution', () => {
  it.each([
    ['none', 'none'], ['low', 'low'], ['medium', 'medium'], ['high', 'high'],
  ] as const)('honors explicit %s on Max as %s', (preference, effort) => {
    const profile = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism: 50, reasoningPreference: preference } });
    expect(profile.requestedReasoning).toBe(preference);
    expect(profile.effectiveReasoning).toBe(effort);
    expect(profile.reasonCodes).toEqual(['explicit_user_preference']);
  });

  it('reserves accelerated delivery for an explicitly selected Fast preference',()=>{
    const fast=resolveDialogueGenerationProfile({...baseInput,preferences:{chatDynamism:50,reasoningPreference:'none'}});
    const automatic=resolveDialogueGenerationProfile({...baseInput,preferences:{chatDynamism:50,reasoningPreference:'auto'}});
    expect(fast.latencyProfile).toBe('fast');
    expect(automatic.latencyProfile).toBe('standard');
  });

  it('applies subscription and provider clamps in a stable order', () => {
    const profile = resolveDialogueGenerationProfile({
      ...baseInput,
      subscriptionTier: 'free',
      preferences: { chatDynamism: 50, reasoningPreference: 'high' },
      providerCapabilities: { supportedReasoningEfforts: ['none'], supportsTemperature: true, supportsTemperatureWithReasoning: false },
    });
    expect(profile.effectiveReasoning).toBe('none');
    expect(profile.reasonCodes).toEqual(['explicit_user_preference', 'subscription_cap', 'provider_capability_clamp']);
  });

  it('never raises effort above the requested or subscription-bounded level when a model has no lower advertised setting',()=>{
    const profile=resolveDialogueGenerationProfile({...baseInput,subscriptionTier:'free',preferences:{chatDynamism:50,reasoningPreference:'none'},providerCapabilities:{supportedReasoningEfforts:['high'],supportsTemperature:false,supportsTemperatureWithReasoning:false}});
    expect(profile.effectiveReasoning).toBe('none');
    expect(profile.reasonCodes).toContain('provider_capability_clamp');
  });

  it('reduces secondary group speakers by one level without going below none', () => {
    expect(lowerReasoningEffort('high', 1)).toBe('medium');
    expect(lowerReasoningEffort('medium', 1)).toBe('low');
    expect(lowerReasoningEffort('low', 1)).toBe('none');
    expect(lowerReasoningEffort('none', 1)).toBe('none');
    const secondary = resolveDialogueGenerationProfile({ ...baseInput, mode: 'group', speakerRole: 'secondary', preferences: { chatDynamism: 50, reasoningPreference: 'high' } });
    expect(secondary.effectiveReasoning).toBe('medium');
    expect(secondary.reasonCodes).toContain('secondary_group_speaker_cap');
  });

  it('keeps visible response budgets independent from dynamism and reasoning reserves', () => {
    const profiles = CHAT_DYNAMISM_VALUES.map((chatDynamism) => resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism, reasoningPreference: 'high' } }));
    expect(new Set(profiles.map((profile) => profile.visibleTokenBudget))).toEqual(new Set([160]));
    expect(new Set(profiles.map((profile) => profile.reasoningTokenReserve))).toEqual(new Set([REASONING_TOKEN_RESERVES.high]));
    expect(new Set(profiles.map((profile) => profile.providerMaxOutputTokens))).toEqual(new Set([160 + REASONING_TOKEN_RESERVES.high]));
  });

  it.each(['none', 'low', 'medium', 'high'] as const)('reserves the expected provider output allowance for %s', (reasoningPreference) => {
    const profile = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism: 50, reasoningPreference } });
    expect(profile.reasoningTokenReserve).toBe(REASONING_TOKEN_RESERVES[reasoningPreference]);
    expect(profile.providerMaxOutputTokens).toBe(profile.visibleTokenBudget + profile.reasoningTokenReserve);
  });

  it('clamps the reasoning reserve to a provider maximum while retaining the visible budget separately', () => {
    const profile = resolveDialogueGenerationProfile({ ...baseInput, responseStyle: 'paragraph', targetLength: 'long', preferences: { chatDynamism: 50, reasoningPreference: 'high' }, providerCapabilities: { supportedReasoningEfforts: ['none', 'low', 'medium', 'high'], supportsTemperature: false, supportsTemperatureWithReasoning: false, maxOutputTokens: 700 } });
    expect(profile.visibleTokenBudget).toBe(520);
    expect(profile.reasoningTokenReserve).toBe(180);
    expect(profile.providerMaxOutputTokens).toBe(700);
    expect(profile.reasonCodes).toContain('provider_output_token_clamp');
  });

  it('maps every dynamism level exactly and omits temperature when reasoning is incompatible', () => {
    for (const chatDynamism of CHAT_DYNAMISM_VALUES) {
      const supported = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism, reasoningPreference: 'none' } });
      expect(supported.temperature).toBe(CHAT_DYNAMISM_TEMPERATURE[chatDynamism]);
      const incompatible = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism, reasoningPreference: 'medium' } });
      expect(incompatible.temperature).toBeUndefined();
    }
  });

  it('keeps provider routing, visible style, and director state out of dynamism decisions', () => {
    const low = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism: 0, reasoningPreference: 'none' } });
    const high = resolveDialogueGenerationProfile({ ...baseInput, preferences: { chatDynamism: 100, reasoningPreference: 'none' } });
    expect({ ...low, chatDynamism: 0, temperature: 0 }).toMatchObject({ providerMaxOutputTokens: high.providerMaxOutputTokens, visibleTokenBudget: high.visibleTokenBudget, effectiveReasoning: high.effectiveReasoning, reasonCodes: high.reasonCodes });
    expect(chatDynamismPrompt(100)).toContain('never invent facts');
    expect(chatDynamismPrompt(100, 'group')).toContain('Do not make the participants sound alike.');
  });
});

describe('provider capabilities', () => {
  it('centralizes the current OpenAI, xAI, and Gemini model behavior', () => {
    expect(resolveDialogueModelCapabilities({ provider: 'openai', model: 'gpt-5.6-luna' })).toMatchObject({ supportedReasoningEfforts: ['none', 'low', 'medium', 'high'], supportsTemperatureWithReasoning: false });
    expect(resolveDialogueModelCapabilities({ provider: 'xai', model: 'grok-4.3' })).toMatchObject({ supportedReasoningEfforts: ['none', 'low', 'medium', 'high'], supportsTemperatureWithReasoning: true });
    expect(resolveDialogueModelCapabilities({ provider: 'gemini', model: 'gemini-2.5-flash' })).toMatchObject({ supportedReasoningEfforts: ['none', 'low', 'medium', 'high'], supportsTemperatureWithReasoning: true });
  });

  it('maps Gemini reasoning controls without exposing thought content',()=>{
    expect(geminiThinkingConfig('gemini-2.5-flash','none','on')).toEqual({thinkingBudget:0,includeThoughts:false});
    expect(geminiThinkingConfig('gemini-2.5-flash','high','on')).toEqual({thinkingBudget:4096,includeThoughts:false});
    expect(geminiThinkingConfig('gemini-2.5-pro','none','on')).toEqual({thinkingBudget:128,includeThoughts:false});
    expect(geminiThinkingConfig('gemini-3-flash','medium','on')).toEqual({thinkingLevel:'MEDIUM',includeThoughts:false});
    expect(geminiThinkingConfig('gemini-2.5-flash','high','shadow')).toBeUndefined();
  });
});

describe('visible output enforcement',()=>{
  it('keeps provider reasoning headroom from becoming extra visible prose',()=>{
    const source='A deliberately long response '.repeat(100);
    const result=limitVisibleDialogue(source,80);
    expect(result.truncated).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(80);
    expect(result.text.endsWith('…')).toBe(true);
    expect(visibleDialoguePrefix(source,80)).not.toContain('�');
  });

  it('leaves naturally short dialogue untouched',()=>{
    expect(limitVisibleDialogue('That sounds good.',80)).toEqual({text:'That sounds good.',truncated:false,estimatedTokens:5});
  });
});

describe('rollout modes and plan choices',()=>{
  it('keeps off and shadow provider behavior identical to the legacy path',()=>{
    const profile=resolveDialogueGenerationProfile({...baseInput,preferences:{chatDynamism:100,reasoningPreference:'high'}});
    expect(providerGenerationControls(profile,'off')).toEqual({reasoningEffort:'none',maxOutputTokens:profile.visibleTokenBudget,promptDynamismApplied:false});
    expect(providerGenerationControls(profile,'shadow')).toEqual({reasoningEffort:'none',maxOutputTokens:profile.visibleTokenBudget,promptDynamismApplied:false});
    expect(providerGenerationControls(profile,'on')).toEqual({reasoningEffort:'high',maxOutputTokens:profile.providerMaxOutputTokens,promptDynamismApplied:true});
    const noReasoning=resolveDialogueGenerationProfile({...baseInput,preferences:{chatDynamism:100,reasoningPreference:'none'}});
    expect(providerGenerationControls(noReasoning,'on').temperature).toBe(1.15);
  });

  it('allows Auto everywhere and locks explicit effort above each plan cap',()=>{
    expect(reasoningPreferenceAllowedForTier('auto','free')).toBe(true);
    expect(reasoningPreferenceAllowedForTier('medium','free')).toBe(false);
    expect(reasoningPreferenceAllowedForTier('medium','kivelle_plus')).toBe(true);
    expect(reasoningPreferenceAllowedForTier('high','kivelle_plus')).toBe(false);
    expect(reasoningPreferenceAllowedForTier('high','kivelle_max')).toBe(true);
  });
});
