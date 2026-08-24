import type { DialogueContentMode } from '../../../packages/together-domain/src/index.ts';

type Row = Record<string, unknown>;

export function normalizeDialogueContentMode(value: unknown): DialogueContentMode {
  return value === 'romance' || value === 'mature' ? value : 'explicit';
}

export function conversationDialogueContentMode(profile: Row | null | undefined, conversation: Row | null | undefined): DialogueContentMode {
  const metadata = record(conversation?.metadata);
  const chatPreferences = record(metadata.chatPreferences);
  const contentPreferences = record(profile?.content_preferences);
  const requestedMode=normalizeDialogueContentMode(chatPreferences.contentMode ?? contentPreferences.contentMode);
  return !profile?.age_verified_at&&(requestedMode==='mature'||requestedMode==='explicit')?'romance':requestedMode;
}

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
