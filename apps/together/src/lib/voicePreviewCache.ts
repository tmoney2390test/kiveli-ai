import type { CompanionVoicePreset } from '@together/domain/src/voice-presets';
import type { ChatLanguagePreference } from '@together/domain/src/chat-language';

export type VoicePreview = {
  signedUrl: string;
  durationMs: number;
  selection: CompanionVoicePreset | null;
  language: ChatLanguagePreference;
};

const VOICE_PREVIEW_SESSION_TTL_MS = 50 * 60 * 1000;
const sessionCache = new Map<string, VoicePreview & { cachedAt: number }>();

const cacheKey = (conversationId: string, selection: CompanionVoicePreset | null, language: ChatLanguagePreference) =>
  `${conversationId}:${selection ?? 'default'}:${language}`;

export function cachedVoicePreview(
  conversationId: string,
  selection: CompanionVoicePreset | null,
  language: ChatLanguagePreference,
  now = Date.now(),
): VoicePreview | null {
  const key = cacheKey(conversationId, selection, language);
  const cached = sessionCache.get(key);
  if (!cached) return null;
  if (now - cached.cachedAt >= VOICE_PREVIEW_SESSION_TTL_MS) {
    sessionCache.delete(key);
    return null;
  }
  return {
    signedUrl: cached.signedUrl,
    durationMs: cached.durationMs,
    selection: cached.selection,
    language: cached.language,
  };
}

export function rememberVoicePreview(
  conversationId: string,
  preview: VoicePreview,
  now = Date.now(),
) {
  sessionCache.set(cacheKey(conversationId, preview.selection, preview.language), {
    ...preview,
    cachedAt: now,
  });
}

export function clearVoicePreviewSessionCache() {
  sessionCache.clear();
}
