import { describe, expect, it } from 'vitest';
import { isMobileChatComposerElement } from './mobileChatKeyboard';

describe('mobile chat keyboard pin', () => {
  it('recognizes the direct and group chat composers', () => {
    expect(isMobileChatComposerElement({ id: 'chat-message-composer' })).toBe(true);
    expect(isMobileChatComposerElement({ id: 'group-chat-message-composer' })).toBe(true);
  });

  it('does not pin for unrelated inputs or malformed elements', () => {
    expect(isMobileChatComposerElement({ id: 'explore-search' })).toBe(false);
    expect(isMobileChatComposerElement({})).toBe(false);
    expect(isMobileChatComposerElement(null)).toBe(false);
  });
});
