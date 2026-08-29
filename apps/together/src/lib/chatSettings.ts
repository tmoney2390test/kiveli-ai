import type { ChatPreferences, ChatTextSize, Conversation, ConversationStyle, DialogueContentMode, Snapshot, SpiceLevel } from '../types';
import { resolveClientConversationStyle } from './conversationStyle';
import { normalizeSpiceLevel } from './spice';
import { normalizeCompanionVoicePreset, type CompanionVoicePreset } from '@together/domain/src/voice-presets';
import { normalizeChatLanguage, type ChatLanguagePreference } from '@together/domain/src/chat-language';

export const chatTextSizeOptions: Array<{ value: ChatTextSize; label: string; fontSize: number; lineHeight: number }> = [
  { value: 'small', label: 'Small', fontSize: 13, lineHeight: 19 },
  { value: 'medium', label: 'Medium', fontSize: 15, lineHeight: 22 },
  { value: 'large', label: 'Large', fontSize: 18, lineHeight: 26 },
];

export function chatPreferencesFromConversation(conversation?: Pick<Conversation, 'metadata'> | null): ChatPreferences {
  const value = conversation?.metadata?.chatPreferences;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  return {
    ...(candidate.responseStyle === 'paragraph' || candidate.responseStyle === 'texting' ? { responseStyle: candidate.responseStyle } : {}),
    ...(candidate.textSize === 'small' || candidate.textSize === 'medium' || candidate.textSize === 'large' ? { textSize: candidate.textSize } : {}),
    ...(candidate.spiceLevel === 1 || candidate.spiceLevel === 2 || candidate.spiceLevel === 3 ? { spiceLevel: candidate.spiceLevel } : {}),
    ...(normalizeCompanionVoicePreset(candidate.voicePreset) ? { voicePreset: normalizeCompanionVoicePreset(candidate.voicePreset)! } : {}),
    ...(isDialogueContentMode(candidate.contentMode) ? { contentMode: candidate.contentMode } : {}),
    ...(candidate.chatLanguage !== undefined ? { chatLanguage: normalizeChatLanguage(candidate.chatLanguage) } : {}),
  };
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
  // Explicit/standard values may still exist in local caches and historical
  // metadata. The client mirrors the server's production ceiling and never
  // exposes those legacy values as an active setting.
  return profile?.age_verified_at ? 'mature' : 'romance';
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

export function withLocalChatSettings(conversation: Conversation, input: { title: string | null; responseStyle: ConversationStyle; textSize: ChatTextSize; spiceLevel?: SpiceLevel; voicePreset?: CompanionVoicePreset | null; contentMode?: DialogueContentMode; chatLanguage?: ChatLanguagePreference }): Conversation {
  const current = chatPreferencesFromConversation(conversation);
  const nextPreferences = { ...current, responseStyle: input.responseStyle, textSize: input.textSize, contentMode: 'mature' as const, ...(input.voicePreset ? { voicePreset: input.voicePreset } : {}), ...(input.chatLanguage ? { chatLanguage: input.chatLanguage } : {}) };
  delete nextPreferences.spiceLevel;
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
