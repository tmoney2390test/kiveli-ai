import { describe, expect, it } from 'vitest';
import { chatTestModel, normalizeChatTestSelection } from './chat-model-test.ts';
import { parseWavespeedChatChunk, wavespeedDialogueBody, wavespeedChatModelMatches } from './wavespeed-chat.ts';
import { estimateAiCost } from './ai-usage.ts';

describe('WaveSpeed private chat contract', () => {
  it('preserves Venice choices and only allows the two exact DeepSeek models', () => {
    expect(chatTestModel('role_play')?.provider).toBe('venice');
    expect(chatTestModel('deepseek_v4_flash')).toMatchObject({ provider: 'wavespeed', id: 'deepseek/deepseek-v4-flash' });
    expect(normalizeChatTestSelection('deepseek/deepseek-v4-flash')).toBe('off');
    expect(wavespeedChatModelMatches('deepseek/deepseek-v4-pro', 'deepseek-v4-pro')).toBe(true);
    for (const returned of ['deepseek-v4-flash', 'deepseek/deepseek-v4', 'deepseek-v4-pro-latest', 'qwen/qwen3']) {
      expect(wavespeedChatModelMatches('deepseek/deepseek-v4-pro', returned)).toBe(false);
    }
    expect(wavespeedChatModelMatches('unknown', 'unknown')).toBe(false);
  });
  it('bounds generation and requests nonthinking text through Chat Completions', () => {
    const body = wavespeedDialogueBody('deepseek/deepseek-v4-flash', 'Hello', 520);
    expect(body).toMatchObject({ max_tokens: 520, reasoning: { enabled: false }, include_reasoning: false, stream_options: { include_usage: true } });
    for (const key of ['max_completion_tokens', 'venice_parameters', 'tools', 'fallbacks', 'temperature', 'reasoning_effort']) expect(body).not.toHaveProperty(key);
  });
  it('normalizes usage without emitting reasoning or trusting unverified cost fields', () => {
    const chunk = parseWavespeedChatChunk({ model: 'deepseek-v4-flash', choices: [{ delta: { content: 'Hello', reasoning_content: 'hidden' } }], usage: { prompt_tokens: 9000, completion_tokens: 600, prompt_cache_hit_tokens: 8000, completion_tokens_details: { reasoning_tokens: 50 }, cost: 42 }, cost: { usd: 99 } });
    expect(chunk.token).toBe('Hello');
    expect(chunk.costUsd).toBeUndefined();
    expect(chunk.usage).toMatchObject({ inputTokens: 9000, cachedInputTokens: 8000, outputTokens: 600, reasoningTokens: 50 });
    expect(chunk.usage).not.toHaveProperty('providerCostUsd');
    expect(estimateAiCost('wavespeed', 'deepseek/deepseek-v4-flash', chunk.usage!)).toBeCloseTo(0.000532, 9);
    expect(estimateAiCost('wavespeed', 'deepseek/deepseek-v4-pro', chunk.usage!)).toBeCloseTo(0.002024, 9);
    expect(estimateAiCost('wavespeed', 'unknown', chunk.usage!)).toBeNull();
    expect(estimateAiCost('wavespeed', 'deepseek/deepseek-v4-flash', { ...chunk.usage!, cachedInputTokens: 0 })).toBeCloseTo(0.001428, 9);
    expect(parseWavespeedChatChunk({ usage: { prompt_tokens: 10, completion_tokens: 1, prompt_cache_hit_tokens: 100 } }).usage?.cachedInputTokens).toBe(10);
    expect(() => parseWavespeedChatChunk({ error: { message: 'upstream failure' } })).toThrow('WAVESPEED_STREAM_ERROR');
  });
});
