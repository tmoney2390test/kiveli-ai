import type { ConversationPreferences, ConversationStyle, Snapshot } from '../types';

export const conversationStyleOptions: Array<{
  value: ConversationStyle;
  title: string;
  description: string;
}> = [
  { value: 'texting', title: 'Texting', description: 'Short, quick replies that feel like real messages.' },
  { value: 'paragraph', title: 'Paragraph', description: 'Fuller, more expressive conversations.' },
];

export function conversationPreferencesFromProfile(profile: Snapshot['profile']): ConversationPreferences {
  if (!profile || typeof profile !== 'object') return {};
  const value = (profile as typeof profile & { conversation_preferences?: ConversationPreferences }).conversation_preferences;
  return value && typeof value === 'object' ? value : {};
}

export function resolveClientConversationStyle(profile: Snapshot['profile']): ConversationStyle {
  return conversationPreferencesFromProfile(profile).responseStyle === 'paragraph' ? 'paragraph' : 'texting';
}

