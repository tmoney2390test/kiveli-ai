import { beforeEach, describe, expect, it } from 'vitest';
import {
  cachedVoicePreview,
  clearVoicePreviewSessionCache,
  rememberVoicePreview,
} from './voicePreviewCache';

describe('voice preview session cache', () => {
  beforeEach(clearVoicePreviewSessionCache);

  it('reuses a signed preview for the same conversation and preset', () => {
    rememberVoicePreview('conversation-1', {
      signedUrl: 'https://signed.example/warm.mp3',
      durationMs: 900,
      selection: 'warm',
      language: 'fr',
    }, 1_000);

    expect(cachedVoicePreview('conversation-1', 'warm', 'fr', 2_000)).toEqual({
      signedUrl: 'https://signed.example/warm.mp3',
      durationMs: 900,
      selection: 'warm',
      language: 'fr',
    });
    expect(cachedVoicePreview('conversation-1', 'bright', 'fr', 2_000)).toBeNull();
    expect(cachedVoicePreview('conversation-1', 'warm', 'en', 2_000)).toBeNull();
  });

  it('expires before the one-hour storage signature does', () => {
    rememberVoicePreview('conversation-1', {
      signedUrl: 'https://signed.example/default.mp3',
      durationMs: 800,
      selection: null,
      language: 'en',
    }, 0);

    expect(cachedVoicePreview('conversation-1', null, 'en', 50 * 60 * 1_000)).toBeNull();
  });
});
