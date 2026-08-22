import type { CompanionVoicePreset } from '@together/domain/src/voice-presets';

export type VoicePreview = {
  signedUrl: string;
  durationMs: number;
  selection: CompanionVoicePreset | null;
};

const VOICE_PREVIEW_SESSION_TTL_MS = 50 * 60 * 1000;
const sessionCache = new Map<string, VoicePreview & { cachedAt: number }>();

const cacheKey = (conversationId: string, selection: CompanionVoicePreset | null) =>
  `${conversationId}:${selection ?? 'default'}`;

export function cachedVoicePreview(
  conversationId: string,
  selection: CompanionVoicePreset | null,
  now = Date.now(),
): VoicePreview | null {
  const key = cacheKey(conversationId, selection);
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
  };
}

export function rememberVoicePreview(
  conversationId: string,
  preview: VoicePreview,
  now = Date.now(),
) {
  sessionCache.set(cacheKey(conversationId, preview.selection), {
    ...preview,
    cachedAt: now,
  });
}

export function clearVoicePreviewSessionCache() {
  sessionCache.clear();
}
