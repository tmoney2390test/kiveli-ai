import type { ChatPreferences, ChatTextSize, Conversation, ConversationStyle, DialogueContentMode, Snapshot, SpiceLevel } from '../types';
import { resolveClientConversationStyle } from './conversationStyle';
import { normalizeSpiceLevel } from './spice';
import { normalizeCompanionVoicePreset, type CompanionVoicePreset } from '@together/domain/src/voice-presets';
import { normalizeChatLanguage, type ChatLanguagePreference } from '@together/domain/src/chat-language';
import { DEFAULT_CHAT_GENERATION_PREFERENCES, normalizeChatDynamism, normalizeReasoningPreference, type ChatDynamism, type ChatGenerationPreferences, type ReasoningPreference } from '@together/domain/src/chat-generation';

export const chatTextSizeOptions: Array<{ value: ChatTextSize; label: string; fontSize: number; lineHeight: number }> = [
  { value: 'small', label: 'Small', fontSize: 13, lineHeight: 19 },
  { value: 'medium', label: 'Medium', fontSize: 15, lineHeight: 22 },
  { value: 'large', label: 'Large', fontSize: 18, lineHeight: 26 },
];

export function chatPreferencesFromConversation(conversation?: Pick<Conversation, 'metadata'> | null): ChatPreferences & ChatGenerationPreferences {
  const value = conversation?.metadata?.chatPreferences;
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...(candidate.responseStyle === 'paragraph' || candidate.responseStyle === 'texting' ? { responseStyle: candidate.responseStyle } : {}),
    ...(candidate.textSize === 'small' || candidate.textSize === 'medium' || candidate.textSize === 'large' ? { textSize: candidate.textSize } : {}),
    ...(candidate.spiceLevel === 1 || candidate.spiceLevel === 2 || candidate.spiceLevel === 3 ? { spiceLevel: candidate.spiceLevel } : {}),
    ...(normalizeCompanionVoicePreset(candidate.voicePreset) ? { voicePreset: normalizeCompanionVoicePreset(candidate.voicePreset)! } : {}),
    ...(isDialogueContentMode(candidate.contentMode) ? { contentMode: candidate.contentMode } : {}),
    ...(candidate.chatLanguage !== undefined ? { chatLanguage: normalizeChatLanguage(candidate.chatLanguage) } : {}),
    chatDynamism: normalizeChatDynamism(candidate.chatDynamism),
    reasoningPreference: normalizeReasoningPreference(candidate.reasoningPreference),
  };
}

export function resolveChatDynamism(conversation?: Pick<Conversation, 'metadata'> | null): ChatDynamism {
  return chatPreferencesFromConversation(conversation).chatDynamism ?? DEFAULT_CHAT_GENERATION_PREFERENCES.chatDynamism;
}

export function resolveReasoningPreference(conversation?: Pick<Conversation, 'metadata'> | null): ReasoningPreference {
  return chatPreferencesFromConversation(conversation).reasoningPreference ?? DEFAULT_CHAT_GENERATION_PREFERENCES.reasoningPreference;
}

export function resolveChatResponseStyle(conversation: Pick<Conversation, 'metadata'> | null | undefined, profile: Snapshot['profile']): ConversationStyle {
  return chatPreferencesFromConversation(conversation).responseStyle ?? resolveClientConversationStyle(profile);
}

export function resolveChatTextSize(conversation?: Pick<Conversation, 'metadata'> | null): ChatTextSize {
  return chatPreferencesFromConversation(conversation).textSize ?? 'medium';
}

export function resolveChatSpiceLevel(conversation: Pick<Conversation, 'metadata'> | null | undefined, characterDefault: unknown): SpiceLevel {
  return chatPreferencesFromConversation(conversation).spiceLevel ?? normalizeSpiceLevel(characterDefault);
}

export function resolveChatVoicePreset(conversation?: Pick<Conversation, 'metadata'> | null): CompanionVoicePreset | null {
  return chatPreferencesFromConversation(conversation).voicePreset ?? null;
}

export function resolveChatContentMode(conversation: Pick<Conversation, 'metadata'> | null | undefined, profile: Snapshot['profile']): DialogueContentMode {
  const conversationMode=chatPreferencesFromConversation(conversation).contentMode;
  if(conversationMode)return conversationMode;
  const profileMode=profile?.content_preferences?.contentMode;
  if(isDialogueContentMode(profileMode))return profileMode;
  return profile?.age_verified_at?'explicit':'romance';
}

export function resolveChatLanguage(conversation?: Pick<Conversation, 'metadata'> | null): ChatLanguagePreference {
  return chatPreferencesFromConversation(conversation).chatLanguage ?? 'en';
}

export function chatMessageTypography(conversation?: Pick<Conversation, 'metadata'> | null, options?: { desktop?: boolean }): { fontSize: number; lineHeight: number } {
  const size = resolveChatTextSize(conversation);
  const option = chatTextSizeOptions.find((item) => item.value === size) ?? { value: 'medium' as const, label: 'Medium', fontSize: 15, lineHeight: 22 };
  return options?.desktop
    ? { fontSize: option.fontSize + 2, lineHeight: option.lineHeight + 3 }
    : { fontSize: option.fontSize, lineHeight: option.lineHeight };
}

export function isSubscribedTier(tier?: string | null): boolean {
  return ['kivelle_plus', 'kivelle_max', 'together_plus', 'unlimited'].includes(String(tier ?? '').toLowerCase());
}

export function withLocalChatSettings(conversation: Conversation, input: { title: string | null; responseStyle: ConversationStyle; textSize: ChatTextSize; spiceLevel?: SpiceLevel; voicePreset?: CompanionVoicePreset | null; contentMode?: DialogueContentMode; chatLanguage?: ChatLanguagePreference; chatDynamism?:ChatDynamism; reasoningPreference?:ReasoningPreference }): Conversation {
  const current = chatPreferencesFromConversation(conversation);
  const stored=conversation.metadata?.chatPreferences;
  const rawCurrent=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored as Record<string,unknown>:{};
  const nextPreferences = { ...rawCurrent,...current, responseStyle: input.responseStyle, textSize: input.textSize, contentMode: input.contentMode??current.contentMode??'mature', chatDynamism:normalizeChatDynamism(input.chatDynamism??current.chatDynamism), reasoningPreference:normalizeReasoningPreference(input.reasoningPreference??current.reasoningPreference), ...(input.voicePreset ? { voicePreset: input.voicePreset } : {}), ...(input.chatLanguage ? { chatLanguage: input.chatLanguage } : {}) };
  if (input.voicePreset === null) delete nextPreferences.voicePreset;
  return {
    ...conversation,
    title: input.title,
    metadata: {
      ...(conversation.metadata ?? {}),
      chatPreferences: nextPreferences,
    },
    updated_at: new Date().toISOString(),
  };
}

function isDialogueContentMode(value: unknown): value is DialogueContentMode {
  return value === 'standard' || value === 'romance' || value === 'mature' || value === 'explicit';
}
