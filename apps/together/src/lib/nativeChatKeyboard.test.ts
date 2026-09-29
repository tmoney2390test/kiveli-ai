import { describe, expect, it } from 'vitest';
import { nativeChatKeyboardInset, visibleKeyboardTop } from './nativeChatKeyboard';

describe('native chat keyboard placement', () => {
  it('only fills the part of the chat frame overlapping the keyboard', () => {
    expect(nativeChatKeyboardInset(820, 540)).toBe(280);
    expect(nativeChatKeyboardInset(540, 540)).toBe(0);
    expect(nativeChatKeyboardInset(500, 540)).toBe(0);
  });

  it('handles a zero keyboard origin without moving the composer to the top', () => {
    expect(visibleKeyboardTop(0, 330, 844)).toBe(514);
    expect(visibleKeyboardTop(1, 330, 844)).toBe(514);
    expect(visibleKeyboardTop(0, 844, 844)).toBeNull();
    expect(nativeChatKeyboardInset(820, null)).toBe(0);
  });
});
