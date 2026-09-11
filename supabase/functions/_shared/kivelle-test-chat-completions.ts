import type { DialogueContext, DialogueRunOptions, DialogueStreamEvent, DialogueRunMetadata } from './together-ai.ts';
import { assertChatTestRequest } from './kivelle-chat-model-test.ts';
import { acquireProviderSlot, releaseProviderSlot } from './kivelle-provider-concurrency.ts';
import { pricedCompanionPrompt, contextChargeForUsage } from './kivelle-context-charge.ts';
import { chatGenerationControlsMode, resolveDialogueRunGenerationProfile } from './kivelle-chat-generation.ts';
import { providerGenerationControls } from '../../../packages/together-domain/src/chat-generation.ts';
import { estimateAiCost, type NormalizedAiUsage } from '../../../packages/together-domain/src/ai-usage.ts';
import { estimateContextTokens } from '../../../packages/together-domain/src/context-budget.ts';
import { visibleDialoguePrefix } from '../../../packages/together-domain/src/chat-generation.ts';
import { parseVeniceChunk, veniceSseData } from '../../../packages/together-domain/src/venice-stream.ts';
import { recordAiUsage } from './kivelle-ai-usage.ts';
import { AppError } from './types.ts';

export type ChatCompletionAdapter = {
  provider: 'venice' | 'wavespeed';
  label: string;
  errorPrefix: string;
  apiKeyEnv: string;
  endpoint: string;
  buildBody: (model: string, prompt: string, maxTokens: number, temperature?: number) => unknown;
  parseChunk: typeof parseVeniceChunk;
  modelMatches: (requested: string, returned: string) => boolean;
  requireReturnedModel?: boolean;
};

export async function* streamTestChatCompletion(context: DialogueContext, options: DialogueRunOptions, adapter: ChatCompletionAdapter): AsyncGenerator<DialogueStreamEvent> {
  const experiment = options.route.experiment;
  if (options.route.provider !== adapter.provider || experiment?.provider !== adapter.provider) throw new AppError('FORBIDDEN', 'The selected test provider does not match this request.', 403);
  const provider = adapter.provider, prefix = adapter.errorPrefix;
  await assertChatTestRequest(options.usageScope?.db, options.usageScope?.userId, options.usageScope?.conversationId, experiment);
  const model = experiment!.model, key = Deno.env.get(adapter.apiKeyEnv);
  if (!key) throw new AppError('PROVIDER_UNAVAILABLE', `${adapter.label} is not configured. Turn the test off to use normal routing.`, 503, true);
  const profile = options.generationProfile = resolveDialogueRunGenerationProfile({ context, provider, model, generationContext: options.generationContext });
  const mode = options.chatGenerationControlsMode = chatGenerationControlsMode();
  const controls = providerGenerationControls(profile, mode);
  const prepared = pricedCompanionPrompt({ context: { ...context, chatGenerationControlsApplied: controls.promptDynamismApplied, chatGenerationMode: options.generationContext?.mode ?? 'direct' }, db: options.usageScope?.db, speakerId: options.usageScope?.characterInstanceId ?? undefined, provider, model, maxOutputTokens: controls.maxOutputTokens, payment: options.contextPayment });
  options.contextPayment = prepared.payment;
  const upperUsage: NormalizedAiUsage = { inputTokens: Math.ceil(estimateContextTokens(prepared.prompt) * 1.25) + 128, outputTokens: controls.maxOutputTokens, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
  const lease = await acquireProviderSlot(options.usageScope, provider, options.operation ?? `dialogue_${provider}`);
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancel(); else options.signal?.addEventListener('abort', cancel, { once: true });
  const started = Date.now();
  const deadline = setTimeout(() => controller.abort(new Error(`${prefix}_REQUEST_TIMEOUT`)), 40_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: Response | undefined, usage: NormalizedAiUsage | null = null, providerCostUsd: number | undefined, firstTokenLatencyMs: number | undefined, returnedModel: string | undefined;
  let finishReason: string | undefined;
  let delivered = '', finished = false, done = false, attempted = false, success = false, errorCode: string | undefined;
  const operation = options.operation ?? `dialogue_${provider}`;
  try {
    controller.signal.throwIfAborted();
    const budget = options.providerAttemptBudget ??= { max: 2, used: 0 };
    if (budget.used >= budget.max) throw new Error(`${prefix}_ATTEMPT_LIMIT`);
    budget.used++;
    attempted = true;
    timer = setTimeout(() => controller.abort(new Error(`${prefix}_REQUEST_TIMEOUT`)), 12_000);
    response = await fetch(adapter.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(adapter.buildBody(model, prepared.prompt, controls.maxOutputTokens, controls.temperature)), signal: controller.signal });
    clearTimeout(timer); timer = undefined;
    if (!response.ok || !response.body) { errorCode = `HTTP_${response.status}`; throw new Error(errorCode); }
    for await (const data of veniceSseData(response.body, controller.signal, 12_000, prefix)) {
      if (data === '[DONE]') { done = true; break; }
      const chunk = adapter.parseChunk(JSON.parse(data));
      if (chunk.model) { returnedModel = chunk.model; if (!adapter.modelMatches(model, returnedModel)) throw new Error(`${prefix}_MODEL_MISMATCH`); }
      if (chunk.usage) usage = chunk.usage;
      if (chunk.costUsd !== undefined) providerCostUsd = chunk.costUsd;
      if (chunk.finishReason) { finishReason = chunk.finishReason; finished = ['stop', 'length'].includes(chunk.finishReason); if (!finished) throw new Error(`${prefix}_FINISH_REJECTED`); }
      if (chunk.token) {
        const limited = visibleDialoguePrefix(delivered + chunk.token, profile.visibleTokenBudget);
        const token = limited.slice(delivered.length);
        if (limited.length < delivered.length + chunk.token.length) options.visibleOutputTruncated = true;
        delivered = limited;
        if (token) { firstTokenLatencyMs ??= Date.now() - started; yield { type: 'token', token }; }
      }
    }
    if (!done || !finished || !delivered.trim() || adapter.requireReturnedModel && !returnedModel) throw new Error(`${prefix}_INCOMPLETE_REPLY`);
    if (usage && providerCostUsd !== undefined) usage.providerCostUsd = providerCostUsd;
    const estimatedCostUsd = estimateAiCost(provider, model, usage ?? upperUsage) ?? undefined;
    const costSource = providerCostUsd !== undefined ? 'provider' : usage ? 'estimated' : 'estimated_upper_bound';
    const metadata: DialogueRunMetadata = { provider, model, returnedModel, routeReason: options.route.reason, contentMode: options.route.resolvedMode, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, cachedInputTokens: usage?.cachedInputTokens ?? 0, reasoningTokens: usage?.reasoningTokens ?? 0, latencyMs: Date.now() - started, firstTokenLatencyMs, chatModelTest: experiment, ...(provider === 'venice' ? { veniceTest: experiment } : {}), estimatedCostUsd, providerCostUsd, costSource, usageMissing: !usage, requestedReasoning: profile.requestedReasoning, effectiveReasoning: usage && usage.reasoningTokens > 0 ? 'provider_default' : 'none', chatDynamism: profile.chatDynamism, visibleTokenBudget: profile.visibleTokenBudget, providerMaxOutputTokens: controls.maxOutputTokens, visibleOutputTruncated: options.visibleOutputTruncated, contextCharge: contextChargeForUsage(options.contextPayment, usage, false) };
    success = true;
    yield { type: 'complete', metadata };
  } catch (error) {
    errorCode ??= options.signal?.aborted ? 'CANCELLED' : error instanceof Error && error.message.startsWith(`${prefix}_`) ? error.message : controller.signal.aborted ? `${prefix}_REQUEST_TIMEOUT` : `${prefix}_STREAM_INTERRUPTED`;
    if (options.signal?.aborted) throw error;
    throw new AppError(response?.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', `${adapter.label} could not finish this reply. Retry, or turn Chat model test off in Chat Settings → AI.`, response?.status === 429 ? 429 : 503, true);
  } finally {
    clearTimeout(deadline);
    if (timer) clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener('abort', cancel);
    try { if (attempted) {
      if (!success) errorCode ??= options.signal?.aborted ? 'CANCELLED' : `${prefix}_CONSUMER_STOPPED`;
      if (usage && providerCostUsd !== undefined) usage.providerCostUsd = providerCostUsd;
      await recordAiUsage(options.usageScope, { provider, model, operation, usage, providerCostUsd, latencyMs: Date.now() - started, success, httpStatus: response?.status, errorCode, estimatedCostUsd: estimateAiCost(provider, model, usage ?? upperUsage), metadata: { experiment, originalProvider: 'xai', returnedModel, finishReason, attempt: options.providerAttemptBudget?.used, firstTokenLatencyMs, requestedReasoning: profile.requestedReasoning, effectiveReasoning: usage && usage.reasoningTokens > 0 ? 'provider_default' : 'none', visibleOutputTruncated: options.visibleOutputTruncated === true, usageMissing: !usage, costSource: providerCostUsd !== undefined ? 'provider' : usage ? 'estimated' : 'estimated_upper_bound' } });
    }
    } finally { await releaseProviderSlot(options.usageScope, lease); }
  }
}
