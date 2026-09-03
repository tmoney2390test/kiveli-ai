import type { DialogueContentMode } from '../../../packages/together-domain/src/index.ts';

type Row = Record<string, unknown>;

export function normalizeDialogueContentMode(value: unknown): DialogueContentMode {
  return value === 'explicit' ? 'explicit' : value === 'romance' ? 'romance' : 'mature';
}

export function conversationDialogueContentMode(profile: Row | null | undefined, conversation: Row | null | undefined,adultAuthorized=false): DialogueContentMode {
  const metadata = record(conversation?.metadata);
  const chatPreferences = record(metadata.chatPreferences);
  const contentPreferences = record(profile?.content_preferences);
  const requestedMode=normalizeDialogueContentMode(chatPreferences.contentMode ?? contentPreferences.contentMode);
  if(!profile?.age_verified_at&&['mature','explicit'].includes(requestedMode))return'romance';
  if(requestedMode==='explicit')return adultAuthorized?'explicit':'mature';
  return requestedMode;
}

/** Returns the stored preference after age assurance, without applying rollout or platform policy. */
export function requestedConversationDialogueContentMode(profile: Row | null | undefined, conversation: Row | null | undefined): DialogueContentMode {
  const metadata = record(conversation?.metadata);
  const chatPreferences = record(metadata.chatPreferences);
  const contentPreferences = record(profile?.content_preferences);
  const requestedMode=normalizeDialogueContentMode(chatPreferences.contentMode ?? contentPreferences.contentMode);
  if(!profile?.age_verified_at&&['mature','explicit'].includes(requestedMode))return'romance';
  return requestedMode;
}

/**
 * Adult media authorization belongs to the verified session and the
 * conversation's selected content mode. It must not depend on the dialogue
 * provider route: photo requests intentionally use the standard prose route
 * while PhotoGen applies its own media policy and provider routing.
 */
export function conversationAdultMediaAuthorized(
  requestedMode: DialogueContentMode,
  adultAuthorized: boolean,
  photoContentLevel?: string,
): boolean {
  if (!adultAuthorized) return false;
  if (requestedMode === 'explicit') return true;
  return ['suggestive', 'mature', 'explicit'].includes(String(photoContentLevel ?? ''));
}

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}
