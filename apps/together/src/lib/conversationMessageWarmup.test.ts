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

  it('suppresses failed background warmups while allowing a deliberate reopen', async () => {
    const failure = Object.assign(new Error('Invalid request'), { retryable: false });
    const loader = vi.fn().mockRejectedValue(failure);
    await expect(loadConversationMessagePage('user-1', 'conversation-1', loader, { background: true })).rejects.toBe(failure);
    for (let index = 0; index < 20; index++) {
      await expect(loadConversationMessagePage('user-1', 'conversation-1', loader, { background: true })).rejects.toBe(failure);
    }
    expect(loader).toHaveBeenCalledTimes(1);
    loader.mockResolvedValue({ messages: [message('1')], hasMore: false });
    await expect(loadConversationMessagePage('user-1', 'conversation-1', loader)).resolves.toMatchObject({ messages: [{ id: '1' }] });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not let navigation bypass a rate limit and isolates the failure by account', async () => {
    const failure = Object.assign(new Error('Wait'), { status: 429, retryable: true, retryAfterMs: 60_000 });
    const loader = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ messages: [], hasMore: false });
    await expect(loadConversationMessagePage('user-1', 'conversation-1', loader)).rejects.toBe(failure);
    await expect(loadConversationMessagePage('user-1', 'conversation-1', loader)).rejects.toBe(failure);
    await expect(loadConversationMessagePage('user-2', 'conversation-1', loader)).resolves.toMatchObject({ messages: [] });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('keeps a normal rail-sized set of conversations warm', () => {
    for(let index=1;index<=20;index+=1){
      const conversationId=`conversation-${index}`;
      writeConversationMessagePage('user-1',conversationId,{messages:[message(String(index),conversationId)],hasMore:false});
    }
    expect(readConversationMessagePage('user-1','conversation-1')?.messages[0]?.id).toBe('1');
    expect(readConversationMessagePage('user-1','conversation-20')?.messages[0]?.id).toBe('20');
  });
});
