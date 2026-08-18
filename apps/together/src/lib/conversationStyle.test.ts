import { describe, expect, it } from 'vitest';
import { resolveClientConversationStyle } from './conversationStyle';

describe('client conversation style preference', () => {
  it('defaults missing and invalid profile preferences to texting', () => {
    expect(resolveClientConversationStyle(null)).toBe('texting');
    expect(resolveClientConversationStyle({ conversation_preferences: { responseStyle: 'invalid' } } as never)).toBe('texting');
  });

  it('restores a saved paragraph preference', () => {
    expect(resolveClientConversationStyle({ conversation_preferences: { responseStyle: 'paragraph' } } as never)).toBe('paragraph');
  });
});

