import { parseVeniceChunk } from './venice-stream.ts';

/** Verified against the public WaveSpeed /v1/models catalog, 2026-09-11. USD per million tokens. */
export const wavespeedChatModels = {
  deepseek_v4_flash: { provider: 'wavespeed', id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash · WaveSpeed', inputPerMillion: 0.14, cachedInputPerMillion: 0.028, outputPerMillion: 0.28, contextTokens: 1_048_576 },
  deepseek_v4_pro: { provider: 'wavespeed', id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro · WaveSpeed', inputPerMillion: 0.66, cachedInputPerMillion: 0.022, outputPerMillion: 1.98, contextTokens: 1_048_576 },
} as const;

export function wavespeedChatRate(model: string) {
  return Object.values(wavespeedChatModels).find(candidate => candidate.id === model);
}

export function wavespeedChatModelMatches(requested: string, returned: string) {
  // Gateways can return the upstream ID without the vendor prefix. Never accept a different version or a generic alias.
  return Boolean(wavespeedChatRate(requested)) && (returned === requested || returned === requested.slice('deepseek/'.length));
}

export function wavespeedDialogueBody(model: string, prompt: string, maxTokens: number, temperature?: number) {
  return {
    model, messages: [{ role: 'user', content: prompt }], stream: true,
    stream_options: { include_usage: true }, max_tokens: maxTokens,
    reasoning: { enabled: false }, include_reasoning: false,
    ...(temperature === undefined ? {} : { temperature }),
  };
}

export function parseWavespeedChatChunk(raw: unknown) {
  // The transport shares Chat Completions framing with Venice. Cost is estimated
  // from the catalog until WaveSpeed's streaming USD cost contract is verified.
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (data['error']) throw new Error('WAVESPEED_STREAM_ERROR');
  const { cost: _cost, ...payload } = data;
  void _cost;
  const parsed = parseVeniceChunk(payload);
  const usage = data['usage'] as Record<string, unknown> | null | undefined;
  // DeepSeek may use its native cache-hit field instead of OpenAI's details object.
  if (parsed.usage && typeof usage?.['prompt_cache_hit_tokens'] === 'number' && Number.isFinite(usage['prompt_cache_hit_tokens'])) {
    parsed.usage.cachedInputTokens = Math.min(parsed.usage.inputTokens, Math.max(0, Math.floor(usage['prompt_cache_hit_tokens'])));
  }
  return parsed;
}
