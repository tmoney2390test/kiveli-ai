import { describe, expect, it } from 'vitest';
import { parseVeniceChunk, veniceSseData } from './venice-stream.ts';
import { estimateAiCost } from './ai-usage.ts';
import { normalizeVeniceTestSelection, veniceChatModel } from './venice-chat.ts';
import { resolveDialogueModelCapabilities } from './chat-generation.ts';

describe('Venice transport and economics', () => {
  it('never accepts arbitrary model IDs as a test selection', () => {
    expect(normalizeVeniceTestSelection('grok-4.3')).toBe('off');
    expect(veniceChatModel('https://attacker.invalid')).toBeNull();
    expect(veniceChatModel('uncensored_1_2')?.id).toBe('venice-uncensored-1-2');
  });
  it('prices input-heavy chat consistently without inventing a cache discount', () => {
    const usage = { inputTokens: 9000, outputTokens: 600, cachedInputTokens: 8000, reasoningTokens: 0, totalTokens: 9600 };
    expect(estimateAiCost('venice', 'venice-uncensored-1-2', usage)).toBeCloseTo(0.00234, 8);
    expect(estimateAiCost('venice', 'venice-uncensored-role-play', usage)).toBeCloseTo(0.0057, 8);
    expect(estimateAiCost('venice', 'unknown', usage)).toBeNull();
    expect(resolveDialogueModelCapabilities({ provider: 'venice', model: 'venice-uncensored-1-2' }).supportedReasoningEfforts).toEqual(['none']);
  });
  it('captures final usage and USD cost without double counting reasoning or emitting it', () => {
    const result = parseVeniceChunk({ choices: [{ delta: { reasoning_content: 'hidden', content: 'Hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 25, completion_tokens_details: { reasoning_tokens: 5 }, prompt_tokens_details: { cached_tokens: 1000 } }, cost: { usd: 0.01, diem: 0 } });
    expect(result.token).toBe('Hello');
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 25, reasoningTokens: 5, totalTokens: 125, cachedInputTokens: 100, providerCostUsd: 0.01 });
    expect(parseVeniceChunk({ cost: { usd: 0, diem: 2 } }).costUsd).toBeUndefined();
    expect(parseVeniceChunk({ usage: { prompt_tokens: 0, completion_tokens: 0 } }).usage).toBeUndefined();
    expect(() => parseVeniceChunk({ error: 'upstream' })).toThrow('VENICE_STREAM_ERROR');
  });
  it('parses UTF-8 and CRLF split at every byte, including usage-only and DONE events', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\ndata:{"choices":[{"delta":{"content":"Café 🌙"}}]}\r\n\r\ndata: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":2}}\n\ndata: [DONE]\n\n');
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const events = [];
    for await (const data of veniceSseData(body)) events.push(data);
    expect(parseVeniceChunk(JSON.parse(events[0]!)).token).toBe('Café 🌙');
    expect(parseVeniceChunk(JSON.parse(events[1]!)).usage?.inputTokens).toBe(9);
    expect(events[2]).toBe('[DONE]');
  });
  it('rejects a truncated frame rather than treating partial JSON as a reply', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":')); controller.close(); } });
    const consume = async () => { for await (const _data of veniceSseData(body)) { void _data; } };
    await expect(consume()).rejects.toThrow('VENICE_INCOMPLETE_FRAME');
  });
  it('cancels a stalled reader on abort and releases its lock', async () => {
    let cancelled = false;
    const abort = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const consume = async () => { for await (const _data of veniceSseData(body, abort.signal)) { void _data; } };
    const promise = consume(); abort.abort();
    await expect(promise).rejects.toThrow();
    expect(cancelled).toBe(true); expect(body.locked).toBe(false);
  });
});
