import { describe, expect, it } from 'vitest';
import type { Message } from '../types';
import { canContinueMessage, isMessageFavorite, isVisibleChatMessage } from './messageActions';

const message = (overrides: Partial<Message> = {}): Message => ({ id: '1', conversation_id: 'c', role: 'assistant', content: 'Hello', delivery_status: 'complete', created_at: '2026-08-26T12:00:00Z', ...overrides });

describe('message actions', () => {
  it('hides canonical control messages from the timeline', () => expect(isVisibleChatMessage(message({ provider_metadata: { uiHidden: true } }))).toBe(false));
  it('reads the server-owned saved state', () => expect(isMessageFavorite(message({ user_metadata: { favorite: true } }))).toBe(true));
  it('only continues from the latest visible companion reply', () => {
    const first = message({ id: 'a' }), control = message({ id: 'b', role: 'user', provider_metadata: { uiHidden: true } }), latest = message({ id: 'c' });
    expect(canContinueMessage(first, [first, control, latest])).toBe(false);
    expect(canContinueMessage(latest, [first, control, latest])).toBe(true);
  });
});
