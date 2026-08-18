import { describe, expect, it } from 'vitest';
import { chatMessageTypography, chatPreferencesFromConversation, isSubscribedTier, resolveChatResponseStyle, resolveChatSpiceLevel, resolveChatTextSize } from './chatSettings';

describe('chat settings', () => {
  it('reads valid per-chat preferences and ignores malformed metadata', () => {
    const conversation = { metadata: { chatPreferences: { responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3, extra: true } } };
    expect(chatPreferencesFromConversation(conversation as never)).toEqual({ responseStyle: 'paragraph', textSize: 'large', spiceLevel: 3 });
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
  });

  it('recognizes current and legacy paid tiers', () => {
    expect(isSubscribedTier('free')).toBe(false);
    expect(isSubscribedTier('kivelle_plus')).toBe(true);
    expect(isSubscribedTier('unlimited')).toBe(true);
  });
});
