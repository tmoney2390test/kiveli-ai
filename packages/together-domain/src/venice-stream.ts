import type { NormalizedAiUsage } from './ai-usage.ts';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
export function parseVeniceChunk(raw: unknown): { token: string; model?: string; finishReason?: string; usage?: NormalizedAiUsage; costUsd?: number } {
  const data = record(raw);
  if (data['error']) throw new Error('VENICE_STREAM_ERROR');
  const choice = record(Array.isArray(data['choices']) ? data['choices'][0] : undefined);
  const delta = record(choice['delta']);
  const usage = record(data['usage']);
  const cost = record(data['cost']);
  const costUsd = typeof cost['usd'] === 'number' && Number.isFinite(cost['usd']) && cost['usd'] >= 0 && !(Number(cost['diem']) > 0) ? cost['usd'] : undefined;
  const inputTokens = count(usage['prompt_tokens']);
  const outputTokens = count(usage['completion_tokens']);
  const hasUsage = ['prompt_tokens', 'completion_tokens'].every(key => typeof usage[key] === 'number' && Number.isFinite(usage[key]) && Number(usage[key]) >= 0) && inputTokens + outputTokens > 0;
  return {
    token: typeof delta['content'] === 'string' ? delta['content'] : '',
    ...(typeof data['model'] === 'string' ? { model: data['model'] } : {}),
    ...(typeof choice['finish_reason'] === 'string' ? { finishReason: choice['finish_reason'] } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(hasUsage ? { usage: { inputTokens, outputTokens, cachedInputTokens: Math.min(inputTokens, count(record(usage['prompt_tokens_details'])['cached_tokens'])), reasoningTokens: count(record(usage['completion_tokens_details'])['reasoning_tokens']), totalTokens: count(usage['total_tokens']) || inputTokens + outputTokens, ...(costUsd !== undefined ? { providerCostUsd: costUsd } : {}) } } : {}),
  };
}

/** SSE framing independent of provider payloads; preserves UTF-8 and CRLF across chunks. */
export async function* veniceSseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal, inactivityMs = 12_000): AsyncGenerator<string> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const abort = () => { void reader.cancel(signal?.reason).catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new Error('VENICE_STREAM_TIMEOUT')); }, inactivityMs); })]);
      } finally { if (timer) clearTimeout(timer); }
      signal?.throwIfAborted();
      buffer += decoder.decode(result.value, { stream: !result.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data) yield data;
      }
      if (result.done) {
        if (buffer.trim()) throw new Error('VENICE_INCOMPLETE_FRAME');
        return;
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
