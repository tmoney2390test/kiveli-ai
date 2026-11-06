export type ConversationPreference = 'standard' | 'mature' | 'explicit';

export function conversationPreferences(platform: string): readonly ConversationPreference[] {
  return platform === 'ios' ? ['standard', 'mature'] : ['standard', 'mature', 'explicit'];
}

export function conversationPreferenceForPlatform(value: ConversationPreference | null | undefined, platform: string): ConversationPreference {
  const preference = value ?? (platform === 'ios' ? 'mature' : 'explicit');
  return platform === 'ios' && preference === 'explicit' ? 'mature' : preference;
}
