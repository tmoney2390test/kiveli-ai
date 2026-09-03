import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../types';
import {
  loadConversationMessagePage,
  readConversationMessagePage,
  resetConversationMessageWarmupForTests,
  writeConversationMessagePage,
} from './conversationMessageWarmup';

const message = (id: string, conversationId = 'conversation-1'): Message => ({
  id,
  conversation_id: conversationId,
  role: 'assistant',
  content: id,
  delivery_status: 'complete',
  created_at: `2026-09-02T00:00:0${id}.000Z`,
});

describe('conversation message warmup', () => {
  afterEach(() => resetConversationMessageWarmupForTests());

  it('lets navigation and the mounted chat share one in-flight history request', async () => {
    let finish: ((page: { messages: Message[]; hasMore: boolean }) => void) | undefined;
    const loader = vi.fn(() => new Promise<{ messages: Message[]; hasMore: boolean }>((resolve) => { finish = resolve; }));
    const warmup = loadConversationMessagePage('user-1', 'conversation-1', loader);
    const mounted = loadConversationMessagePage('user-1', 'conversation-1', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    finish?.({ messages: [message('2'), message('1')], hasMore: true });
    await expect(warmup).resolves.toMatchObject({ messages: [{ id: '1' }, { id: '2' }], hasMore: true });
    await expect(mounted).resolves.toMatchObject({ messages: [{ id: '1' }, { id: '2' }], hasMore: true });
  });

  it('serves a fresh warmed page without making another request', async () => {
    writeConversationMessagePage('user-1', 'conversation-1', { messages: [message('1')], hasMore: false }, Date.now());
    const loader = vi.fn();
    await expect(loadConversationMessagePage('user-1', 'conversation-1', loader)).resolves.toMatchObject({ messages: [{ id: '1' }] });
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps cached rows isolated by account and conversation', () => {
    writeConversationMessagePage('user-1', 'conversation-1', { messages: [message('1'), message('2', 'another')], hasMore: false });
    expect(readConversationMessagePage('user-1', 'conversation-1')?.messages.map((item) => item.id)).toEqual(['1']);
    expect(readConversationMessagePage('user-2', 'conversation-1')).toBeNull();
  });
});
