import { describe, expect, it } from 'vitest';
import { chatBubbleColorHex, chatBubbleColorOptions, chatBubbleColorValues, chatBubbleTextColor, isChatBubbleColor, normalizeChatBubbleColor } from './chat-appearance.ts';

describe('chat appearance', () => {
  it('keeps the selectable palette and the server allowlist aligned', () => {
    expect(chatBubbleColorOptions.map((option) => option.value)).toEqual(chatBubbleColorValues);
  });

  it('fails unknown or malformed stored colors back to the default', () => {
    expect(normalizeChatBubbleColor('#ffffff')).toBe('default');
    expect(normalizeChatBubbleColor('url(javascript:bad)')).toBe('default');
    expect(normalizeChatBubbleColor(undefined)).toBe('default');
    expect(isChatBubbleColor('rose')).toBe(true);
  });

  it('resolves only curated colors with a readable foreground', () => {
    expect(chatBubbleColorHex('rose')).toBe('#9D2F63');
    expect(chatBubbleColorHex('default')).toBeNull();
    expect(chatBubbleTextColor('rose')).toBe('#FFF8F4');
  });
});
