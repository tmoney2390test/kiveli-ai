import type { DialogueContentMode } from '../../../packages/together-domain/src/index.ts';

type Row = Record<string, unknown>;

export function normalizeDialogueContentMode(value: unknown): DialogueContentMode {
  return value === 'romance' || value === 'mature' || value === 'explicit' ? value : 'standard';
}

export function conversationDialogueContentMode(profile: Row | null | undefined, conversation: Row | null | undefined): DialogueContentMode {
  const metadata = record(conversation?.metadata);
  const chatPreferences = record(metadata.chatPreferences);
  const contentPreferences = record(profile?.content_preferences);
  return normalizeDialogueContentMode(chatPreferences.contentMode ?? contentPreferences.contentMode);
}

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
