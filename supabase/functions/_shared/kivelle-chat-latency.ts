import { normalizeReasoningPreference } from '../../../packages/together-domain/src/chat-generation.ts';

export type ChatSpeedFeature = 'DIRECTOR_BYPASS' | 'CONTEXT_REUSE' | 'FAST_PROMPT' | 'STREAM_V2';
export function chatSpeedEnabled(feature: ChatSpeedFeature): boolean {
  const runtime = globalThis as unknown as { Deno?: { env: { get(name: string): string | undefined } } };
  const value = runtime.Deno?.env.get(`KIVELLE_CHAT_${feature}`)?.trim().toLowerCase();
  return !['off', 'false', '0'].includes(value ?? 'on');
}

export function isFastChat(context: { generationPreferences?: { reasoningPreference?: unknown } }): boolean {
  return normalizeReasoningPreference(context.generationPreferences?.reasoningPreference) === 'none';
}

/** Durations only: never include prompts, memory contents, or user-authored text. */
export class ChatTimings {
  private readonly started = performance.now();
  private readonly stages: Record<string, number> = {};
  constructor(private readonly correlationId: string) {}
  mark(stage: string): void { this.stages[stage] = Math.round(performance.now() - this.started); }
  markOnce(stage: string): void { if(this.stages[stage]===undefined)this.mark(stage); }
  async measure<T>(stage: string, work: () => PromiseLike<T>): Promise<T> {
    const started = performance.now();
    try { return await work(); }
    finally { this.stages[`${stage}Ms`] = Math.round(performance.now() - started); }
  }
  report(metadata: Record<string, string | number | boolean | null> = {}): void {
    console.log(JSON.stringify({ operation: 'dialogue_latency', correlationId: this.correlationId, totalMs: Math.round(performance.now() - this.started), ...this.stages, ...metadata }));
  }
}
