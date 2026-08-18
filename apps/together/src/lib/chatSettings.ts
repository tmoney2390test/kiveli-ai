import type { ChatPreferences, ChatTextSize, Conversation, ConversationStyle, Snapshot, SpiceLevel } from '../types';
import { resolveClientConversationStyle } from './conversationStyle';
import { normalizeSpiceLevel } from './spice';

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

export function chatMessageTypography(conversation?: Pick<Conversation, 'metadata'> | null): { fontSize: number; lineHeight: number } {
  const size = resolveChatTextSize(conversation);
  const option = chatTextSizeOptions.find((item) => item.value === size) ?? { value: 'medium' as const, label: 'Medium', fontSize: 15, lineHeight: 22 };
  return { fontSize: option.fontSize, lineHeight: option.lineHeight };
}

export function isSubscribedTier(tier?: string | null): boolean {
  return ['kivelle_plus', 'kivelle_max', 'together_plus', 'unlimited'].includes(String(tier ?? '').toLowerCase());
}

export function withLocalChatSettings(conversation: Conversation, input: { title: string | null; responseStyle: ConversationStyle; textSize: ChatTextSize; spiceLevel?: SpiceLevel }): Conversation {
  const current = chatPreferencesFromConversation(conversation);
  return {
    ...conversation,
    title: input.title,
    metadata: {
      ...(conversation.metadata ?? {}),
      chatPreferences: { ...current, responseStyle: input.responseStyle, textSize: input.textSize, ...(input.spiceLevel ? { spiceLevel: input.spiceLevel } : {}) },
    },
    updated_at: new Date().toISOString(),
  };
}
