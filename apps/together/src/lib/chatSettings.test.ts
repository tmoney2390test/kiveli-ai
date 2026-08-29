import { describe, expect, it } from 'vitest';
import { chatMessageTypography, chatPreferencesFromConversation, isSubscribedTier, resolveChatContentMode, resolveChatLanguage, resolveChatResponseStyle, resolveChatSpiceLevel, resolveChatTextSize, resolveChatVoicePreset, withLocalChatSettings } from './chatSettings';

describe('chat settings', () => {
  it('reads valid per-chat preferences and ignores malformed metadata', () => {
    const conversation = { metadata: { chatPreferences: { responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3, voicePreset: 'warm', contentMode: 'explicit', chatLanguage: 'fr', extra: true } } };
    expect(chatPreferencesFromConversation(conversation as never)).toEqual({ responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3, voicePreset: 'warm', contentMode: 'explicit', chatLanguage: 'fr' });
    expect(chatPreferencesFromConversation({ metadata: { chatPreferences: 'large' } })).toEqual({});
  });

  it('falls back to existing account and character defaults', () => {
    expect(resolveChatResponseStyle(null, { conversation_preferences: { responseStyle: 'paragraph' } } as never)).toBe('paragraph');
    expect(resolveChatTextSize(null)).toBe('medium');
    expect(resolveChatSpiceLevel(null, 1)).toBe(1);
  });

  it('maps text sizes to real message typography', () => {
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'small' } } })).toEqual({ fontSize: 13, lineHeight: 19 });
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'large' } } })).toEqual({ fontSize: 18, lineHeight: 26 });
    expect(chatMessageTypography({ metadata: { chatPreferences: { textSize: 'medium' } } }, { desktop: true })).toEqual({ fontSize: 17, lineHeight: 25 });
  });

  it('recognizes current and legacy paid tiers', () => {
    expect(isSubscribedTier('free')).toBe(false);
    expect(isSubscribedTier('kivelle_plus')).toBe(true);
    expect(isSubscribedTier('unlimited')).toBe(true);
  });

  it('reads, sets, and clears a per-chat voice preset', () => {
    const conversation = { id: 'chat-1', title: null, metadata: { chatPreferences: { voicePreset: 'bright' } } } as never;
    expect(resolveChatVoicePreset(conversation)).toBe('bright');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', voicePreset: 'warm' });
    expect(resolveChatVoicePreset(updated)).toBe('warm');
    expect(resolveChatVoicePreset(withLocalChatSettings(updated, { title: null, responseStyle: 'texting', textSize: 'medium', voicePreset: null }))).toBeNull();
  });

  it('uses mature as the fixed adult ceiling and ignores legacy overrides', () => {
    const conversation = { id: 'chat-1', title: null, metadata: {} } as never;
    const profile = { content_preferences: { contentMode: 'mature' }, age_verified_at: '2026-08-01T00:00:00Z' } as never;
    expect(resolveChatContentMode(conversation, profile)).toBe('mature');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', contentMode: 'explicit' });
    expect(resolveChatContentMode(updated, profile)).toBe('mature');
    expect(chatPreferencesFromConversation(updated).contentMode).toBe('mature');
    expect(chatPreferencesFromConversation(updated).spiceLevel).toBeUndefined();
    expect(resolveChatContentMode(null, { content_preferences: { romanceEnabled: false } } as never)).toBe('romance');
    expect(resolveChatContentMode({ metadata: { chatPreferences: { contentMode: 'standard' } } } as never, null)).toBe('romance');
  });

  it('resolves and saves a provider-compatible per-chat language', () => {
    const conversation = { id: 'chat-1', title: null, metadata: {} } as never;
    expect(resolveChatLanguage(conversation)).toBe('en');
    const updated = withLocalChatSettings(conversation, { title: null, responseStyle: 'texting', textSize: 'medium', chatLanguage: 'es-MX' });
    expect(resolveChatLanguage(updated)).toBe('es-MX');
    expect(chatPreferencesFromConversation({ metadata: { chatPreferences: { chatLanguage: 'unsupported' } } } as never).chatLanguage).toBe('en');
  });
});
