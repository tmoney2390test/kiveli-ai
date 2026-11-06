import { hasSexualDialogueLanguage } from '../../../packages/together-domain/src/index.ts';

type VoiceSource = {
  content?: unknown;
  canonical_text?: unknown;
  content_rating?: unknown;
  visibility_scope?: unknown;
};

/** A spoken copy inherits the source message's private adult boundary. */
export function voiceNoteNeedsAdultAccess(source: VoiceSource): boolean {
  return source.content_rating === 'explicit' ||
    source.visibility_scope === 'web_adult' ||
    hasSexualDialogueLanguage(String(source.content ?? source.canonical_text ?? ''));
}
