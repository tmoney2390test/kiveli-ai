import { AppError } from "./types.ts";
import {
  extractMemories,
  extractOpenThread,
  type MemoryCandidate,
  normalizeContinuityKey,
  type OpenThreadCandidate,
  threadAnswered,
} from "./together.ts";
import {
  buildCompanionPrompt,
  responseTokenBudget,
} from "./kivelle-intelligence.ts";
import type { KivelleConversationContext } from "./kivelle-conversation-context.ts";
import type { PlaceOpinionCandidate } from "./kivelle-place-perspective.ts";
import {
  deterministicPlaceOpinionCandidates as derivePlaceOpinionCandidates,
  validatePlaceOpinionCandidates as validateDerivedPlaceOpinionCandidates,
} from "../../../packages/together-domain/src/place-opinion-analysis.ts";
import {
  detectFlirtSignal,
  mergeRelationshipAnalysisChanges,
  scoreConversationEngagement,
} from "../../../packages/together-domain/src/relationship.ts";
import {
  isDurableUserMemory,
  isRelationshipDirectedPreferenceMemory,
} from "../../../packages/together-domain/src/memory.ts";
import { resolveConversationStyle } from "../../../packages/together-domain/src/conversation-style.ts";
import {
  buildResponsesRequestBody,
  canRetryStreamFailure,
  deriveOpaquePromptCacheKey,
  dialogueFallbackProvider,
  type DialogueProviderName,
  type DialogueRoutingDecision,
  executeResponsesHttp,
  extractResponsesText,
  geminiThinkingConfig,
  type IntimacyStance,
  isContradictoryAcceptedIntimacyRefusal,
  isDialogueHardBlocked,
  isUnsupportedTemperatureResponse,
  limitVisibleDialogue,
  providerGenerationControls,
  type NormalizedAiUsage,
  type NormalizedModerationResult,
  normalizeResponsesUsage,
  parseResponsesStreamEvent,
  visibleDialoguePrefix,
} from "../../../packages/together-domain/src/index.ts";
import { type AiUsageScope, recordAiUsage } from "./kivelle-ai-usage.ts";
import {
  acquireProviderSlot,
  releaseProviderSlot,
} from "./kivelle-provider-concurrency.ts";
import { chatGenerationControlsMode,resolveDialogueRunGenerationProfile,type DialogueGenerationContext } from './kivelle-chat-generation.ts';
import type { ChatGenerationControlsMode,DialogueGenerationProfile } from '../../../packages/together-domain/src/chat-generation.ts';

export type DialogueContext = KivelleConversationContext & {
  contentMode?: string;
  intimacyStance?: IntimacyStance;
  dialogueRouting?: Record<string, unknown>;
};
export type DialogueRunMetadata = {
  provider: DialogueProviderName;
  model: string;
  routeReason: string;
  contentMode: string;
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  firstByteLatencyMs?: number;
  firstTokenLatencyMs?: number;
  fallback?: boolean;
  chatGenerationControlsMode?:ChatGenerationControlsMode;
  requestedReasoning?:string;
  autoDesiredReasoning?:string;
  effectiveReasoning?:string;
  chatDynamism?:number;
  temperatureApplied?:boolean;
  visibleTokenBudget?:number;
  providerMaxOutputTokens?:number;
  reasoningReasonCodes?:string[];
  generationProfileVersion?:string;
  chatGenerationProfileVersion?:string;
  unsupportedTemperatureFallback?:boolean;
  resolvedTemperature?:number;
  reasoningTokenReserve?:number;
  conversationMode?:'direct'|'group';
  groupGenerationMode?:'per_speaker';
  speakerRole?:'primary'|'secondary';
  visibleOutputTruncated?:boolean;
  deliveredVisibleOutputTokensEstimate?:number;
};
export type DialogueGenerationResult = {
  text: string;
  metadata: DialogueRunMetadata;
};
export type DialogueStreamEvent = { type: "token"; token: string } | {
  type: "complete";
  metadata: DialogueRunMetadata;
};
export type DialogueRunOptions = {
  route: DialogueRoutingDecision;
  usageScope?: AiUsageScope;
  operation?: string;
  sharedSceneParticipant?: boolean;
  generationContext?:DialogueGenerationContext;
  generationProfile?:DialogueGenerationProfile;
  chatGenerationControlsMode?:ChatGenerationControlsMode;
  unsupportedTemperatureFallback?:boolean;
  visibleOutputTruncated?:boolean;
  deliveredVisibleOutputTokensEstimate?:number;
};
export interface DialogueProvider {
  generate(
    context: DialogueContext,
    options: DialogueRunOptions,
  ): Promise<DialogueGenerationResult>;
  stream(
    context: DialogueContext,
    options: DialogueRunOptions,
  ): AsyncIterable<DialogueStreamEvent>;
}
export interface EmbeddingProvider {
  embed(
    text: string,
    scope?: AiUsageScope & { purpose?: string },
  ): Promise<number[] | null>;
}
export interface ModerationProvider {
  check(
    text: string,
    scope?: AiUsageScope,
  ): Promise<NormalizedModerationResult>;
}
export type ConversationActionCandidate = {
  type: "plan_create" | "plan_cancel" | "plan_reschedule" | "date";
  confidence: number;
  payload: Record<string, unknown>;
};
export type ConversationAnalysisInput = {
  userMessage: string;
  assistantMessage: string;
  existingThreads: Array<Record<string, unknown>>;
  context?: DialogueContext;
  usageScope?: AiUsageScope;
};
export type ConversationAnalysisProposal = {
  relationshipChanges: Record<string, number>;
  chemistry: {
    userFlirtSignal: number;
    characterFlirtSignal: number;
    mutualChemistry: number;
    heatDelta: number;
  };
  memoryCandidates: MemoryCandidate[];
  resolvedThreadIds: string[];
  newThreads: OpenThreadCandidate[];
  momentCandidate: boolean;
  moodEffects: Record<string, number>;
  actionCandidates: ConversationActionCandidate[];
  placeOpinionCandidates: PlaceOpinionCandidate[];
  referencedEntities: string[];
  mentionedMemoryIds: string[];
  reinforcedMemoryIds: string[];
  correctedMemorySubjects: string[];
  source: "deterministic" | "hybrid";
};
export interface ConversationAnalysisProvider {
  analyze(
    input: ConversationAnalysisInput,
  ): Promise<ConversationAnalysisProposal>;
}

const apiKey = () => Deno.env.get("OPENAI_API_KEY");
const xaiKey = () => Deno.env.get("XAI_API_KEY");
const geminiKey = () => Deno.env.get("GEMINI_API_KEY");
const model = (name: string, fallback: string) =>
  Deno.env.get(name)?.trim() || fallback;
const DEFAULT_DIALOGUE_PROVIDER_INACTIVITY_MS = 12_000;

class DialogueProviderTimeoutError extends Error {
  constructor() {
    super("dialogue_provider_timeout");
    this.name = "DialogueProviderTimeoutError";
  }
}
function dialogueProviderInactivityMs(): number {
  const configured = Number(
    Deno.env.get("KIVELLE_DIALOGUE_PROVIDER_INACTIVITY_MS"),
  );
  return Number.isFinite(configured)
    ? Math.min(25_000, Math.max(5_000, configured))
    : DEFAULT_DIALOGUE_PROVIDER_INACTIVITY_MS;
}
function isDialogueProviderTimeout(error: unknown): boolean {
  return error instanceof DialogueProviderTimeoutError ||
    (error instanceof Error && error.message === "dialogue_provider_timeout");
}
async function withDialogueProviderDeadline<T>(
  operation: Promise<T>,
  controller: AbortController,
  timeoutMs = dialogueProviderInactivityMs(),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DialogueProviderTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function deadlineFetch(controller: AbortController): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, signal: controller.signal })) as typeof fetch;
}

export function openAIDialogueModel(): string {
  return model(
    "KIVELLE_OPENAI_DIALOGUE_MODEL",
    model(
      "KIVELLE_DIALOGUE_MODEL",
      model("TOGETHER_DIALOGUE_MODEL", "gpt-5.6-luna"),
    ),
  );
}
export function xaiDialogueModel(): string {
  return model("KIVELLE_XAI_DIALOGUE_MODEL", "grok-4.3");
}
export function dialogueProviderName(): "openai" | "gemini" | "deterministic" {
  if (apiKey()) return "openai";
  if (geminiKey()) return "gemini";
  return "deterministic";
}

export class ConfiguredDialogueProvider implements DialogueProvider {
  async generate(
    context: DialogueContext,
    options: DialogueRunOptions,
  ): Promise<DialogueGenerationResult> {
    if (
      options.route.provider === "openai" || options.route.provider === "xai"
    ) {
      try {
        const generated = await generateResponses(context, options);
        if (
          options.route.provider === "xai" && options.route.explicit &&
          context.intimacyStance?.shouldReciprocate === true &&
          isContradictoryAcceptedIntimacyRefusal(generated.text)
        ) {
          const repairContext = {
            ...context,
            dialogueRouting: {
              ...(context.dialogueRouting ?? {}),
              responseRepair: "accepted_intimacy_contradiction",
            },
          };
          const repairOptions = {
            ...options,
            operation: `${operationName(options, "xai")}_repair`,
          };
          try {
            const repaired = await generateResponses(
              repairContext,
              repairOptions,
            );
            return isContradictoryAcceptedIntimacyRefusal(repaired.text)
              ? {
                text: explicitProviderFallback(context),
                metadata: { ...repaired.metadata, fallback: true },
              }
              : repaired;
          } catch {
            return {
              text: explicitProviderFallback(context),
              metadata: { ...generated.metadata, fallback: true },
            };
          }
        }
        return generated;
      } catch (error) {
        if (options.route.provider === "xai") {
          return generateAdultProviderDowngrade(context, options);
        }
        if (
          !isDialogueProviderTimeout(error) &&
          dialogueFallbackProvider(
              options.route.provider,
              Boolean(geminiKey()),
            ) === "gemini"
        ) {
          const started = Date.now();
          const fallbackOptions = fallbackRunOptions(options, 'gemini');
          const providerModel = model(
            "TOGETHER_GEMINI_MODEL",
            Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
          );
          try {
            const text = await generateGemini(context, geminiKey()!, fallbackOptions);
            await recordAiUsage(
              options.usageScope
                ? { ...options.usageScope, routeReason: "provider_fallback" }
                : undefined,
              {
                provider: "gemini",
                model: providerModel,
                operation: "dialogue_gemini",
                latencyMs: Date.now() - started,
                success: true,
                metadata: { fallbackFrom: "openai", ...generationTelemetry(fallbackOptions) },
              },
            );
            return {
              text,
              metadata: {
                ...metadataFor(
                  fallbackOptions,
                  "gemini",
                  providerModel,
                  null,
                  Date.now() - started,
                  true,
                ),
                routeReason: "provider_fallback",
              },
            };
          } catch {
            await recordAiUsage(options.usageScope, {
              provider: 'gemini', model: providerModel, operation: 'dialogue_gemini',
              latencyMs: Date.now() - started, success: false, errorCode: 'PROVIDER_FALLBACK_FAILED',
              metadata: { fallbackFrom: 'openai', ...generationTelemetry(fallbackOptions) },
            });
          }
        }
        const text = fallbackDialogue(context);
        return {
          text,
          metadata: {
            ...metadataFor(
              options,
              "deterministic",
              "kivelle-deterministic",
              null,
              0,
              true,
            ),
            routeReason: "provider_fallback",
          },
        };
      }
    }
    if (options.route.provider === "gemini" && geminiKey()) {
      const started = Date.now();
      const providerModel = model(
        "TOGETHER_GEMINI_MODEL",
        Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
      );
      try {
        const text = await generateGemini(context, geminiKey()!, options);
        await recordAiUsage(options.usageScope, {
          provider: "gemini", model: providerModel, operation: options.operation ?? "dialogue_gemini",
          latencyMs: Date.now() - started, success: true, metadata: generationTelemetry(options),
        });
        return { text, metadata: metadataFor(options, "gemini", providerModel, null, Date.now() - started) };
      } catch {
        await recordAiUsage(options.usageScope, {
          provider: 'gemini', model: providerModel, operation: options.operation ?? 'dialogue_gemini',
          latencyMs: Date.now() - started, success: false, errorCode: 'PROVIDER_FAILED',
          metadata: generationTelemetry(options),
        });
      }
    }
    const deterministicOptions = fallbackRunOptions(options, 'deterministic');
    return {
      text: fallbackDialogue(context),
      metadata: metadataFor(
        deterministicOptions,
        "deterministic",
        "kivelle-deterministic",
        null,
        0,
      ),
    };
  }

  async *stream(
    context: DialogueContext,
    options: DialogueRunOptions,
  ): AsyncIterable<DialogueStreamEvent> {
    if (
      options.route.provider === "openai" || options.route.provider === "xai"
    ) {
      let emitted = false;
      try {
        for await (const event of streamResponses(context, options)) {
          if (event.type === "token") emitted = true;
          yield event;
        }
        return;
      } catch (error) {
        if (!canRetryStreamFailure(emitted)) throw error;
        if (isDialogueProviderTimeout(error)) {
          const text = options.route.provider === "xai"
            ? explicitProviderFallback(context)
            : fallbackDialogue(context);
          for await (const token of textChunks(text)) {
            yield { type: "token", token };
          }
          yield {
            type: "complete",
            metadata: {
              ...metadataFor(
                options,
                "deterministic",
                "kivelle-deterministic",
                null,
                dialogueProviderInactivityMs(),
                true,
              ),
              routeReason: "provider_timeout_fallback",
            },
          };
          return;
        }
        const fallback = await this.generate(context, options);
        for await (const token of textChunks(fallback.text)) {
          yield { type: "token", token };
        }
        yield { type: "complete", metadata: fallback.metadata };
        return;
      }
    }
    const generated = await this.generate(context, options);
    for await (const token of textChunks(generated.text)) {
      yield { type: "token", token };
    }
    yield { type: "complete", metadata: generated.metadata };
  }
}

async function generateResponses(
  context: DialogueContext,
  options: DialogueRunOptions,
): Promise<DialogueGenerationResult> {
  const provider = options.route.provider as "openai" | "xai",
    key = provider === "openai" ? apiKey() : xaiKey(),
    modelName = provider === "openai"
      ? openAIDialogueModel()
      : xaiDialogueModel();
  if (!key) throw new Error(`${provider}_not_configured`);
  const slot = await acquireProviderSlot(
    options.usageScope,
    provider,
    operationName(options, provider),
  );
  const started = Date.now();
  let response: Response | undefined,
    recorded = false,
    firstByteLatencyMs: number | undefined;
  const controller = new AbortController();
  try {
    const body=await responsesBody(context, options, modelName, false);
    response = await withDialogueProviderDeadline(
      executeResponsesWithTemperatureFallback(deadlineFetch(controller),provider,key,body,options),
      controller,
    );
    firstByteLatencyMs = Date.now() - started;
    if (!response.ok) {
      await recordAiUsage(options.usageScope, {
        provider,
        model: modelName,
        operation: operationName(options, provider),
        latencyMs: Date.now() - started,
        success: false,
        httpStatus: response.status,
        errorCode: `HTTP_${response.status}`,
        metadata: {
          sharedSceneParticipant: options.sharedSceneParticipant === true,
          firstByteLatencyMs,
          ...generationTelemetry(options),
        },
      });
      recorded = true;
      throw new AppError(
        response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
        "Your companion needs a moment before replying.",
        response.status === 429 ? 429 : 503,
        true,
      );
    }
    const data = await withDialogueProviderDeadline(
        response.json(),
        controller,
      ),
      usage = normalizeResponsesUsage(provider, data.usage),
      rawText = extractResponsesText(data),
      visible = limitVisibleDialogue(rawText, options.generationProfile?.visibleTokenBudget ?? responseTokenBudget(context)),
      text = visible.text;
    options.visibleOutputTruncated = visible.truncated;
    options.deliveredVisibleOutputTokensEstimate = visible.estimatedTokens;
    const latency = Date.now() - started;
    await recordAiUsage(options.usageScope, {
      provider,
      model: modelName,
      operation: operationName(options, provider),
      usage,
      latencyMs: latency,
      success: true,
      httpStatus: response.status,
      cacheHit: usage.cachedInputTokens > 0,
      metadata: {
        sharedSceneParticipant: options.sharedSceneParticipant === true,
        firstByteLatencyMs,
        bodyLatencyMs: Math.max(0, latency - (firstByteLatencyMs ?? latency)),
        visibleOutputTokens:usage.outputTokens,
        deliveredVisibleOutputTokensEstimate:visible.estimatedTokens,
        totalOutputTokens:usage.outputTokens+usage.reasoningTokens,
        ...generationTelemetry(options),
      },
    });
    recorded = true;
    if (!text) throw new Error("empty_provider_response");
    return {
      text,
      metadata: {
        ...metadataFor(options, provider, modelName, usage, latency),
        firstByteLatencyMs,
      },
    };
  } catch (error) {
    if (!recorded) {
      await recordAiUsage(options.usageScope, {
        provider,
        model: modelName,
        operation: operationName(options, provider),
        latencyMs: Date.now() - started,
        success: false,
        httpStatus: response?.status ?? null,
        errorCode: isDialogueProviderTimeout(error)
          ? "PROVIDER_TIMEOUT"
          : response
          ? "RESPONSE_BODY_ERROR"
          : "NETWORK_ERROR",
        metadata: {
          sharedSceneParticipant: options.sharedSceneParticipant === true,
          ...(firstByteLatencyMs === undefined ? {} : { firstByteLatencyMs }),
          ...generationTelemetry(options),
        },
      });
    }
    throw error;
  } finally {
    await releaseProviderSlot(options.usageScope, slot);
  }
}

async function* streamResponses(
  context: DialogueContext,
  options: DialogueRunOptions,
): AsyncIterable<DialogueStreamEvent> {
  const provider = options.route.provider as "openai" | "xai",
    key = provider === "openai" ? apiKey() : xaiKey(),
    modelName = provider === "openai"
      ? openAIDialogueModel()
      : xaiDialogueModel();
  if (!key) throw new Error(`${provider}_not_configured`);
  const slot = await acquireProviderSlot(
    options.usageScope,
    provider,
    operationName(options, provider),
  );
  const started = Date.now();
  let response: Response | undefined,
    recorded = false,
    firstByteLatencyMs: number | undefined,
    firstTokenLatencyMs: number | undefined;
  const controller = new AbortController();
  try {
    const body=await responsesBody(context, options, modelName, true);
    response = await withDialogueProviderDeadline(
      executeResponsesWithTemperatureFallback(deadlineFetch(controller),provider,key,body,options),
      controller,
    );
    firstByteLatencyMs = Date.now() - started;
    if (!response.ok || !response.body) {
      await recordAiUsage(options.usageScope, {
        provider,
        model: modelName,
        operation: operationName(options, provider),
        latencyMs: Date.now() - started,
        success: false,
        httpStatus: response.status,
        errorCode: `HTTP_${response.status}`,
        metadata: { firstByteLatencyMs,...generationTelemetry(options) },
      });
      recorded = true;
      throw new Error(`${provider}_stream_failed`);
    }
    let usage: NormalizedAiUsage | null = null;
    let deliveredText = "";
    let visibleLimitReached = false;
    const visibleBudget = options.generationProfile?.visibleTokenBudget ?? responseTokenBudget(context);
    for await (
      const data of sseData(response.body, {
        inactivityMs: dialogueProviderInactivityMs(),
        onTimeout: () => controller.abort(),
      })
    ) {
      const parsed = parseResponsesStreamEvent(JSON.parse(data));
      if (parsed.token && !visibleLimitReached) {
        const candidate = `${deliveredText}${parsed.token}`;
        const limited = visibleDialoguePrefix(candidate, visibleBudget);
        const deliverable = limited.slice(deliveredText.length);
        if (limited.length < candidate.length) {
          options.visibleOutputTruncated = true;
          visibleLimitReached = true;
        }
        deliveredText = limited;
        if (deliverable) {
          firstTokenLatencyMs ??= Date.now() - started;
          yield { type: "token", token: deliverable };
        }
      }
      if (parsed.usage) usage = normalizeResponsesUsage(provider, parsed.usage);
    }
    const latency = Date.now() - started;
    options.deliveredVisibleOutputTokensEstimate = limitVisibleDialogue(deliveredText, visibleBudget).estimatedTokens;
    await recordAiUsage(options.usageScope, {
      provider,
      model: modelName,
      operation: operationName(options, provider),
      usage,
      latencyMs: latency,
      success: true,
      httpStatus: response.status,
      cacheHit: Boolean(usage?.cachedInputTokens),
      metadata: {
        sharedSceneParticipant: options.sharedSceneParticipant === true,
        firstByteLatencyMs,
        firstTokenLatencyMs,
        timeToFirstTokenMs:firstTokenLatencyMs??null,
        visibleOutputTokens:usage?.outputTokens??0,
        deliveredVisibleOutputTokensEstimate:options.deliveredVisibleOutputTokensEstimate,
        totalOutputTokens:(usage?.outputTokens??0)+(usage?.reasoningTokens??0),
        ...generationTelemetry(options),
      },
    });
    recorded = true;
    yield {
      type: "complete",
      metadata: {
        ...metadataFor(options, provider, modelName, usage, latency),
        firstByteLatencyMs,
        firstTokenLatencyMs,
      },
    };
  } catch (error) {
    if (!recorded) {
      await recordAiUsage(options.usageScope, {
        provider,
        model: modelName,
        operation: operationName(options, provider),
        latencyMs: Date.now() - started,
        success: false,
        httpStatus: response?.status ?? null,
        errorCode: isDialogueProviderTimeout(error)
          ? "PROVIDER_TIMEOUT"
          : response
          ? "STREAM_INTERRUPTED"
          : "NETWORK_ERROR",
        metadata: {
          sharedSceneParticipant: options.sharedSceneParticipant === true,
          ...(firstByteLatencyMs === undefined ? {} : { firstByteLatencyMs }),
          ...(firstTokenLatencyMs === undefined ? {} : { firstTokenLatencyMs }),
          ...generationTelemetry(options),
        },
      });
    }
    throw error;
  } finally {
    await releaseProviderSlot(options.usageScope, slot);
  }
}

async function responsesBody(
  context: DialogueContext,
  options: DialogueRunOptions,
  modelName: string,
  stream: boolean,
) {
  const provider=options.route.provider as 'openai'|'xai';
  const profile=options.generationProfile??=resolveDialogueRunGenerationProfile({context,provider,model:modelName,generationContext:options.generationContext});
  const controlsMode=options.chatGenerationControlsMode??=chatGenerationControlsMode();
  const applied=providerGenerationControls(profile,controlsMode);
  return buildResponsesRequestBody({
    model: modelName,
    prompt: buildCompanionPrompt({...context,chatGenerationControlsApplied:applied.promptDynamismApplied,chatGenerationMode:options.generationContext?.mode??'direct'}),
    maxOutputTokens: applied.maxOutputTokens,
    stream,
    reasoningEffort:applied.reasoningEffort,
    ...(applied.temperature!==undefined?{temperature:applied.temperature}:{}),
    ...(options.route.provider === "xai"
      ? {
        promptCacheKey: await deriveOpaquePromptCacheKey({
          conversationId: options.usageScope?.conversationId,
          continuityId: options.usageScope?.continuityId,
          characterInstanceId: options.usageScope?.characterInstanceId,
        }),
      }
      : {}),
  });
}

export async function executeResponsesWithTemperatureFallback(fetchImpl:typeof fetch,provider:'openai'|'xai',key:string,body:Record<string,unknown>,options:DialogueRunOptions):Promise<Response>{
  const first=await executeResponsesHttp(fetchImpl,provider,key,body);
  if(first.ok||typeof body.temperature!=='number')return first;
  const errorBody=await first.clone().text().catch(()=>"");
  if(!isUnsupportedTemperatureResponse(first.status,errorBody))return first;
  const withoutTemperature={...body};delete withoutTemperature.temperature;
  options.unsupportedTemperatureFallback=true;
  return executeResponsesHttp(fetchImpl,provider,key,withoutTemperature);
}

function generationTelemetry(options:DialogueRunOptions):Record<string,unknown>{
  const profile=options.generationProfile;
  if(!profile)return{chatGenerationControlsMode:options.chatGenerationControlsMode??'off'};
  const applied=options.chatGenerationControlsMode==='on';
  return{
    chatGenerationProfileVersion:profile.profileVersion,
    chatGenerationControlsMode:options.chatGenerationControlsMode,
    conversationMode:options.generationContext?.mode??'direct',
    ...(options.generationContext?.mode==='group'?{groupGenerationMode:'per_speaker'}:{}),
    speakerRole:options.generationContext?.speakerRole??'primary',
    requestedReasoning:profile.requestedReasoning,
    autoDesiredReasoning:profile.autoDesiredReasoning??null,
    effectiveReasoning:profile.effectiveReasoning,
    providerReasoningApplied:applied?profile.effectiveReasoning:'none',
    chatDynamism:profile.chatDynamism,
    resolvedTemperature:profile.temperature??null,
    temperatureApplied:applied&&profile.temperature!==undefined&&!options.unsupportedTemperatureFallback,
    visibleTokenBudget:profile.visibleTokenBudget,
    reasoningTokenReserve:profile.reasoningTokenReserve,
    providerMaxOutputTokens:profile.providerMaxOutputTokens,
    appliedReasoningTokenReserve:applied?profile.reasoningTokenReserve:0,
    appliedProviderMaxOutputTokens:applied?profile.providerMaxOutputTokens:profile.visibleTokenBudget,
    reasonCodes:profile.reasonCodes,
    reasoningReasonCodes:profile.reasonCodes,
    generationProfileVersion:profile.profileVersion,
    unsupportedTemperatureFallback:options.unsupportedTemperatureFallback===true,
    visibleOutputTruncated:options.visibleOutputTruncated===true,
    deliveredVisibleOutputTokensEstimate:options.deliveredVisibleOutputTokensEstimate??null,
  };
}
function operationName(options: DialogueRunOptions, provider: string) {
  return options.operation ?? `dialogue_${provider}`;
}

function fallbackRunOptions(
  options: DialogueRunOptions,
  provider: 'openai'|'gemini'|'deterministic',
  resolvedMode = options.route.resolvedMode,
): DialogueRunOptions {
  return {
    ...options,
    generationProfile: undefined,
    unsupportedTemperatureFallback: false,
    visibleOutputTruncated: false,
    deliveredVisibleOutputTokensEstimate: undefined,
    route: {
      ...options.route,
      provider,
      resolvedMode,
      reason: 'provider_fallback',
      explicit: false,
    },
  };
}
function metadataFor(
  options: DialogueRunOptions,
  provider: DialogueProviderName,
  modelName: string,
  usage: NormalizedAiUsage | null,
  latencyMs: number,
  fallback = false,
): DialogueRunMetadata {
  return {
    provider,
    model: modelName,
    routeReason: options.route.reason,
    contentMode: options.route.resolvedMode,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    latencyMs,
    ...generationMetadata(options),
    ...(fallback ? { fallback: true } : {}),
  };
}

function generationMetadata(options:DialogueRunOptions):Partial<DialogueRunMetadata>{
  const telemetry=generationTelemetry(options);
  return{
    chatGenerationControlsMode:telemetry.chatGenerationControlsMode as ChatGenerationControlsMode,
    ...(typeof telemetry.requestedReasoning==='string'?{requestedReasoning:telemetry.requestedReasoning}:{}),
    ...(typeof telemetry.autoDesiredReasoning==='string'?{autoDesiredReasoning:telemetry.autoDesiredReasoning}:{}),
    ...(typeof telemetry.effectiveReasoning==='string'?{effectiveReasoning:telemetry.effectiveReasoning}:{}),
    ...(typeof telemetry.chatDynamism==='number'?{chatDynamism:telemetry.chatDynamism}:{}),
    ...(typeof telemetry.temperatureApplied==='boolean'?{temperatureApplied:telemetry.temperatureApplied}:{}),
    ...(typeof telemetry.resolvedTemperature==='number'?{resolvedTemperature:telemetry.resolvedTemperature}:{}),
    ...(typeof telemetry.visibleTokenBudget==='number'?{visibleTokenBudget:telemetry.visibleTokenBudget}:{}),
    ...(typeof telemetry.reasoningTokenReserve==='number'?{reasoningTokenReserve:telemetry.reasoningTokenReserve}:{}),
    ...(typeof telemetry.providerMaxOutputTokens==='number'?{providerMaxOutputTokens:telemetry.providerMaxOutputTokens}:{}),
    ...(telemetry.conversationMode==='direct'||telemetry.conversationMode==='group'?{conversationMode:telemetry.conversationMode}:{}),
    ...(telemetry.groupGenerationMode==='per_speaker'?{groupGenerationMode:'per_speaker' as const}:{}),
    ...(telemetry.speakerRole==='primary'||telemetry.speakerRole==='secondary'?{speakerRole:telemetry.speakerRole}:{}),
    ...(Array.isArray(telemetry.reasonCodes)?{reasoningReasonCodes:telemetry.reasonCodes.map(String)}:{}),
    ...(typeof telemetry.generationProfileVersion==='string'?{generationProfileVersion:telemetry.generationProfileVersion}:{}),
    ...(typeof telemetry.chatGenerationProfileVersion==='string'?{chatGenerationProfileVersion:telemetry.chatGenerationProfileVersion}:{}),
    ...(telemetry.unsupportedTemperatureFallback===true?{unsupportedTemperatureFallback:true}:{}),
    ...(telemetry.visibleOutputTruncated===true?{visibleOutputTruncated:true}:{}),
    ...(typeof telemetry.deliveredVisibleOutputTokensEstimate==='number'?{deliveredVisibleOutputTokensEstimate:telemetry.deliveredVisibleOutputTokensEstimate}:{}),
  };
}
async function generateAdultProviderDowngrade(
  context: DialogueContext,
  options: DialogueRunOptions,
): Promise<DialogueGenerationResult> {
  const resolvedMode: DialogueRoutingDecision["resolvedMode"] =
    options.route.requestedMode === "standard"
      ? "standard"
      : options.route.requestedMode === "romance"
      ? "romance"
      : "mature";
  const fallbackContext = {
    ...context,
    contentMode: resolvedMode,
    dialogueRouting: {
      ...(context.dialogueRouting ?? {}),
      provider: apiKey() ? "openai" : geminiKey() ? "gemini" : "deterministic",
      reason: "provider_fallback",
      contentMode: resolvedMode,
      explicit: false,
    },
  };
  if (apiKey()) {
    try {
      const fallbackOptions = fallbackRunOptions(options, 'openai', resolvedMode);
      const generated = await generateResponses(
        fallbackContext,
        fallbackOptions,
      );
      return {
        ...generated,
        metadata: {
          ...generated.metadata,
          fallback: true,
          routeReason: "provider_fallback",
        },
      };
    } catch { /* fall through to the next non-explicit provider */ }
  }
  if (geminiKey()) {
    try {
      const started = Date.now(),
        modelName = model(
          "TOGETHER_GEMINI_MODEL",
          Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
        ),
        fallbackOptions = fallbackRunOptions(options, 'gemini', resolvedMode),
        text = await generateGemini(fallbackContext, geminiKey()!, fallbackOptions),
        latencyMs = Date.now() - started;
      await recordAiUsage(
        options.usageScope
          ? {
            ...options.usageScope,
            routeReason: "provider_fallback",
            contentMode: resolvedMode,
          }
          : undefined,
        {
          provider: "gemini",
          model: modelName,
          operation: operationName(fallbackOptions, "gemini"),
          latencyMs,
          success: true,
          metadata: { fallbackFrom: "xai", ...generationTelemetry(fallbackOptions) },
        },
      );
      return {
        text,
        metadata: metadataFor(
          fallbackOptions,
          "gemini",
          modelName,
          null,
          latencyMs,
          true,
        ),
      };
    } catch { /* use a character-aware local response */ }
  }
  const fallbackOptions = fallbackRunOptions(options, 'deterministic', resolvedMode);
  return {
    text: explicitProviderFallback(fallbackContext),
    metadata: metadataFor(
      fallbackOptions,
      "deterministic",
      "kivelle-deterministic",
      null,
      0,
      true,
    ),
  };
}
function explicitProviderFallback(context: DialogueContext): string {
  const name = context.character.name, stance = context.intimacyStance;
  if (stance?.consentState === "withdrawn") {
    return `${name} stops immediately. “Okay. We stop.”`;
  }
  if (stance?.disposition === "firm_decline") {
    return `${name} holds your gaze, answer clear. “No. That isn't what I want.”`;
  }
  if (stance?.disposition === "open") {
    return `${name}'s answer is immediate, desire unmistakable. “Yes. I want you too.”`;
  }
  if (stance?.disposition === "needs_context") {
    return `${name}'s interest is unmistakable. “I want this. I just can't act like we're in the same room right now—stay with me here.”`;
  }
  if (stance?.disposition === "playful_deflection") {
    return `${name} gives you a long, openly interested look. “Bold. Keep that energy—you definitely have my attention.”`;
  }
  return `${name} stays with the question, interest clear. “I want to keep moving toward that. Come closer and let me show you how.”`;
}

export class ConfiguredEmbeddingProvider implements EmbeddingProvider {
  async embed(
    text: string,
    scope?: AiUsageScope & { purpose?: string },
  ): Promise<number[] | null> {
    const key = apiKey();
    if (!key) {
      const googleKey = geminiKey();
      return googleKey ? embedGemini(text, googleKey) : null;
    }
    const started = Date.now(),
      modelName = model("TOGETHER_EMBEDDING_MODEL", "text-embedding-3-small");
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model("TOGETHER_EMBEDDING_MODEL", "text-embedding-3-small"),
          input: text,
          dimensions: 1536,
        }),
      });
      if (!response.ok) {
        await recordAiUsage(scope, {
          provider: "openai",
          model: modelName,
          operation: "embedding_openai",
          latencyMs: Date.now() - started,
          success: false,
          httpStatus: response.status,
          errorCode: `HTTP_${response.status}`,
          metadata: { purpose: scope?.purpose },
        });
        return null;
      }
      const data = await response.json();
      const usage = normalizeResponsesUsage("openai", {
        input_tokens: data.usage?.prompt_tokens,
        total_tokens: data.usage?.total_tokens,
      });
      await recordAiUsage(scope, {
        provider: "openai",
        model: modelName,
        operation: "embedding_openai",
        usage,
        latencyMs: Date.now() - started,
        success: true,
        httpStatus: response.status,
        metadata: { purpose: scope?.purpose },
      });
      return data.data?.[0]?.embedding ?? null;
    } catch {
      await recordAiUsage(scope, {
        provider: "openai",
        model: modelName,
        operation: "embedding_openai",
        latencyMs: Date.now() - started,
        success: false,
        errorCode: "NETWORK_ERROR",
        metadata: { purpose: scope?.purpose },
      });
      return null;
    }
  }
}

export class ConfiguredModerationProvider implements ModerationProvider {
  async check(
    text: string,
    scope?: AiUsageScope,
  ): Promise<NormalizedModerationResult> {
    const key = apiKey();
    if (!key) {
      return {
        allowed: true,
        flagged: false,
        categories: ["moderation/unavailable"],
        categoryScores: {},
      };
    }
    const started = Date.now(),
      modelName = model("TOGETHER_MODERATION_MODEL", "omni-moderation-latest");
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model("TOGETHER_MODERATION_MODEL", "omni-moderation-latest"),
          input: text,
        }),
      });
      if (!response.ok) {
        await recordAiUsage(scope, {
          provider: "openai",
          model: modelName,
          operation: "moderation_openai",
          latencyMs: Date.now() - started,
          success: false,
          httpStatus: response.status,
          errorCode: `HTTP_${response.status}`,
          estimatedCostUsd: 0,
        });
        return {
          allowed: true,
          flagged: false,
          categories: ["moderation/unavailable"],
          categoryScores: {},
        };
      }
      const result = (await response.json()).results?.[0];
      const categories = Object.entries(result?.categories ?? {}).filter((
          [, flagged],
        ) => flagged
        ).map(([category]) => category),
        categoryScores = Object.fromEntries(
          Object.entries(result?.category_scores ?? {}).map((
            [category, score],
          ) => [category, Number(score)]),
        );
      await recordAiUsage(scope, {
        provider: "openai",
        model: modelName,
        operation: "moderation_openai",
        latencyMs: Date.now() - started,
        success: true,
        httpStatus: response.status,
        estimatedCostUsd: 0,
        metadata: {
          flagged: Boolean(result?.flagged),
          categoryCount: categories.length,
        },
      });
      const normalized = {
        allowed: true,
        flagged: Boolean(result?.flagged),
        categories,
        categoryScores,
      };
      const hardBlocked = isDialogueHardBlocked({
        message: text,
        moderation: normalized,
      });
      return { ...normalized, allowed: !hardBlocked };
    } catch {
      await recordAiUsage(scope, {
        provider: "openai",
        model: modelName,
        operation: "moderation_openai",
        latencyMs: Date.now() - started,
        success: false,
        errorCode: "NETWORK_ERROR",
        estimatedCostUsd: 0,
      });
      return {
        allowed: true,
        flagged: false,
        categories: ["moderation/unavailable"],
        categoryScores: {},
      };
    }
  }
}

export class ConfiguredConversationAnalysisProvider
  implements ConversationAnalysisProvider {
  async analyze(
    input: ConversationAnalysisInput,
  ): Promise<ConversationAnalysisProposal> {
    const deterministic = deterministicAnalysis(input);
    const key = geminiKey();
    const enabled = Deno.env.get("TOGETHER_AI_ANALYSIS_ENABLED") !== "false";
    if (!enabled || !key || !shouldUseModelAnalysis(input)) {
      return deterministic;
    }
    const started = Date.now();
    let usageRecorded = false;
    try {
      const modelName = model(
        "TOGETHER_ANALYSIS_MODEL",
        Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
      );
      const response = await Promise.race([
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${
            encodeURIComponent(modelName)
          }:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{ text: analysisPrompt(input) }],
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 650,
                responseMimeType: "application/json",
              },
            }),
          },
        ),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("analysis_timeout")), 3500)
        ),
      ]);
      if (!response.ok) {
        await recordAiUsage(input.usageScope, {
          provider: "gemini",
          model: modelName,
          operation: "analysis_gemini",
          latencyMs: Date.now() - started,
          success: false,
          httpStatus: response.status,
          errorCode: `HTTP_${response.status}`,
        });
        usageRecorded = true;
        return deterministic;
      }
      const payload = await response.json();
      const usageMetadata = payload.usageMetadata ?? {},
        usage = {
          inputTokens: Number(usageMetadata.promptTokenCount ?? 0),
          cachedInputTokens: Number(usageMetadata.cachedContentTokenCount ?? 0),
          outputTokens: Number(usageMetadata.candidatesTokenCount ?? 0),
          reasoningTokens: Number(usageMetadata.thoughtsTokenCount ?? 0),
          totalTokens: Number(usageMetadata.totalTokenCount ?? 0),
        };
      await recordAiUsage(input.usageScope, {
        provider: "gemini",
        model: modelName,
        operation: "analysis_gemini",
        usage,
        latencyMs: Date.now() - started,
        success: true,
        httpStatus: response.status,
      });
      usageRecorded = true;
      const raw = payload.candidates?.[0]?.content?.parts?.map((
        part: Record<string, unknown>,
      ) => part.text).filter(Boolean).join("");
      const modelProposal = validateAnalysisJson(
        typeof raw === "string" ? JSON.parse(raw) : null,
        input,
      );
      return mergeAnalysis(deterministic, modelProposal);
    } catch (error) {
      if (!usageRecorded) {
        await recordAiUsage(input.usageScope, {
          provider: "gemini",
          model: model(
            "TOGETHER_ANALYSIS_MODEL",
            Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
          ),
          operation: "analysis_gemini",
          latencyMs: Date.now() - started,
          success: false,
          errorCode: "NETWORK_OR_PARSE_ERROR",
        });
      }
      console.warn(
        "Together post-conversation analysis fell back",
        error instanceof Error ? error.message : "unknown_error",
      );
      return deterministic;
    }
  }
}

function deterministicAnalysis(
  input: ConversationAnalysisInput,
): ConversationAnalysisProposal {
  const memoryCandidates = extractMemories(input.userMessage);
  const thread = extractOpenThread(input.userMessage);
  const precedingAssistantMessage = [...(input.context?.recent ?? [])].reverse()
    .find((turn) => turn.role === "assistant")?.content;
  const engagement = scoreConversationEngagement({
    message: input.userMessage,
    ...(precedingAssistantMessage ? { precedingAssistantMessage } : {}),
    memoryWorthy: memoryCandidates.length > 0 || Boolean(thread),
  });
  const tense =
    /\b(shut up|don'?t care|whatever|you(?:'re| are) annoying|hate talking to you|leave me alone)\b/i
      .test(input.userMessage);
  const repairing =
    /\b(i(?:'m| am) sorry|i apologize|can we talk|i didn'?t mean that|make this right)\b/i
      .test(input.userMessage);
  const userFlirt = detectFlirtSignal(input.userMessage),
    characterFlirt = detectFlirtSignal(input.assistantMessage),
    mutual = userFlirt.kind === "rejection"
      ? 0
      : Math.min(userFlirt.strength, characterFlirt.strength);
  const relationshipChanges: Record<string, number> = tense
    ? { trust: -3, comfort: -3, affinity: -2, respect: -2, conflict: 4 }
    : repairing
    ? { trust: 2, comfort: 1, respect: 2, conflict: -4 }
    : engagement.relationshipSignificant
    ? { trust: 3, comfort: 2, familiarity: 3, affinity: 2, respect: 1 }
    : engagement.quality === "trivial"
    ? {}
    : {
      trust: 1,
      comfort: 1,
      familiarity: memoryCandidates.length ? 2 : 1,
      affinity: 1,
      ...(userFlirt.strength >= .35
        ? { attraction: 1, romantic_interest: 1 }
        : {}),
    };
  return {
    relationshipChanges,
    chemistry: {
      userFlirtSignal: userFlirt.strength,
      characterFlirtSignal: characterFlirt.strength,
      mutualChemistry: mutual,
      heatDelta: 0,
    },
    memoryCandidates,
    resolvedThreadIds: input.existingThreads.filter((item) =>
      threadAnswered(item, input.userMessage)
    ).map((item) => String(item.id)),
    newThreads: thread ? [thread] : [],
    momentCandidate: false,
    moodEffects: {},
    actionCandidates: proposeActions(input),
    placeOpinionCandidates: deterministicPlaceOpinionCandidates(input),
    referencedEntities: referencedEntities(input),
    mentionedMemoryIds: detectedMentionedMemoryIds(
      input.assistantMessage,
      input.context,
    ),
    reinforcedMemoryIds: [],
    correctedMemorySubjects: [],
    source: "deterministic",
  };
}

function shouldUseModelAnalysis(input: ConversationAnalysisInput): boolean {
  const message = input.userMessage;
  if (
    input.context?.place &&
    /\b(what do you think|do you like|how do you feel|opinion|this place|here|growing on|favorite)\b/i
      .test(message)
  ) return true;
  if (message.length < 32) return false;
  return /\b(i|i'm|i've|my|we|tomorrow|next|used to|actually|remember|important)\b/i
    .test(message);
}

function analysisPrompt(input: ConversationAnalysisInput): string {
  const threadList = input.existingThreads.map((item) => ({
    id: item.id,
    topic: item.topic,
    eligible: item.follow_up_eligible,
    expectedAt: item.expected_at,
  }));
  return `Analyze one conversation turn for a relationship simulation. Return JSON only. The application owns truth; propose small changes and only facts explicitly stated by the user.

USER MESSAGE
${input.userMessage}

CHARACTER RESPONSE
${input.assistantMessage}

OPEN THREADS
${JSON.stringify(threadList)}

MEMORIES AVAILABLE TO THE CHARACTER THIS TURN
${
    JSON.stringify(
      [
        ...(input.context?.memoryContext?.silent ?? []),
        ...(input.context?.memoryContext?.callbacks ?? []),
        ...(input.context?.memoryContext?.directRecall ?? []),
      ].map((item: any) => ({ id: item.id, text: item.text })),
    )
  }

ALLOWED PLACES FOR OPINION EVIDENCE
${
    JSON.stringify(
      allowedPlaces(input).map((place) => ({
        placeRef: place.slug,
        name: place.name,
        current: place.current,
        existingView: place.existingView,
      })),
    )
  }

Return this shape:
{"relationshipChanges":{"trust":0,"comfort":0,"attraction":0,"affinity":0,"familiarity":0,"respect":0,"conflict":0,"romantic_interest":0,"commitment":0},"chemistry":{"userFlirtSignal":0.0,"characterFlirtSignal":0.0,"mutualChemistry":0.0,"heatDelta":0},"memoryCandidates":[{"memory_type":"semantic|preference|episodic|relationship|emotional","canonical_text":"User ...","subject_key":"stable topic key","importance":0.0,"confidence":0.0,"sensitivity_category":"none|personal|sensitive","metadata":{}}],"placeOpinionCandidates":[{"placeRef":"allowed-place-slug","sentiment":0.0,"confidence":0.0,"summary":"Durable neutral summary of the companion's expressed view.","tags":[],"favoriteDetails":[],"dislikedDetails":[],"reasoningCode":"explicit_character_opinion|opinion_changed|shared_experience_reaction"}],"resolvedThreadIds":[],"newThreads":[{"topic":"Ask how ... went.","subject":"presentation","expected_at":"ISO timestamp or null","importance":0.0}],"mentionedMemoryIds":[],"reinforcedMemoryIds":[],"correctedMemorySubjects":[],"momentCandidate":false,"moodEffects":{}}

Rules: relationship deltas must be integers from -4 to 4. Ordinary genuine conversation should normally earn 1 trust and 1 familiarity. Familiarity reflects sustained back-and-forth and learning stable details about each other. Trust reflects continued respectful interaction and should decline only for a clear negative trust event such as deception, hostility, manipulation, a boundary violation, or a broken commitment; ordinary disagreement is not a trust violation. Deeper disclosure, demonstrated reliability, support, or repair may justify larger changes. Memory-worthiness is not relationship significance: an ordinary preference or biographical fact may become memory but must not receive vulnerability-level trust/comfort changes. Direct declarations to the companion such as "I love you" or "I like you" are relationship evidence, never preference memories; do not produce text such as "User likes you." Momentary user state and generic actions belong only to recent conversation context: never create durable memories such as "User is in bed," "User is eating," "User is tired," "User is at home," or "User is watching television." Store only stable facts/preferences, meaningful relationship evidence, future-relevant commitments, or genuinely significant shared episodes. Chemistry signals are 0 to 1 and require actual romantic/flirt evidence; generic positivity such as "you're cool", "nice", or "you're funny" is not flirting. Never infer private facts. Do not create a memory from the character response or from visual details the character mentioned after seeing an uploaded photo; only facts the user explicitly states in their own message may become memory. A correction must use the same subject_key as the earlier fact. Mentioned/reinforced memory IDs must be from the available list and only if the assistant actually referenced them. Resolve only an eligible thread that this user message actually answers. A place opinion candidate is allowed only when the CHARACTER RESPONSE explicitly expresses or changes a durable personal view of one listed place. Never turn the user's opinion, objective venue description, or a passing observation into the companion's opinion. Use only an allowed placeRef and never invent an ID.`;
}

function validateAnalysisJson(
  value: unknown,
  input: ConversationAnalysisInput,
): ConversationAnalysisProposal {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const changes =
    record.relationshipChanges && typeof record.relationshipChanges === "object"
      ? record.relationshipChanges as Record<string, unknown>
      : {};
  const relationshipChanges = Object.fromEntries(
    [
      "trust",
      "comfort",
      "attraction",
      "affinity",
      "familiarity",
      "respect",
      "conflict",
      "romantic_interest",
      "commitment",
    ].map((key) => {
      const raw = Number(changes[key] ?? 0);
      return [
        key,
        Math.max(-4, Math.min(4, Number.isFinite(raw) ? Math.round(raw) : 0)),
      ];
    }),
  );
  const memoryCandidates =
    (Array.isArray(record.memoryCandidates) ? record.memoryCandidates : [])
      .slice(0, 4).flatMap((item): MemoryCandidate[] => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as Record<string, unknown>;
        const memoryType = String(candidate.memory_type ?? "");
        const canonicalText = String(candidate.canonical_text ?? "").trim()
          .slice(0, 600);
        const subjectKey = normalizeContinuityKey(
          String(candidate.subject_key ?? ""),
        ).replace(/\s+/g, ":").slice(0, 120);
        if (
          !["semantic", "preference", "episodic", "relationship", "emotional"]
            .includes(memoryType) ||
          !/^User\b/i.test(canonicalText) || !subjectKey
        ) return [];
        if (
          memoryType === "preference" &&
          isRelationshipDirectedPreferenceMemory(canonicalText)
        ) return [];
        if (!isDurableUserMemory({ memoryType, canonicalText })) return [];
        const sensitivity = ["none", "personal", "sensitive"].includes(
            String(candidate.sensitivity_category),
          )
          ? String(candidate.sensitivity_category)
          : "none";
        return [{
          memory_type: memoryType,
          canonical_text: canonicalText,
          dedupe_key: `${memoryType}:${normalizeContinuityKey(canonicalText)}`,
          subject_key: subjectKey,
          importance: clampUnit(candidate.importance),
          confidence: Math.min(.85, clampUnit(candidate.confidence)),
          sensitivity_category: sensitivity,
          metadata: candidate.metadata && typeof candidate.metadata === "object"
            ? candidate.metadata as Record<string, unknown>
            : {},
        }];
      });
  const allowedThreadIds = new Set(
    input.existingThreads.filter((item) =>
      threadAnswered(item, input.userMessage)
    ).map((item) => String(item.id)),
  );
  const resolvedThreadIds =
    (Array.isArray(record.resolvedThreadIds) ? record.resolvedThreadIds : [])
      .map(String).filter((id) => allowedThreadIds.has(id));
  const newThreads = (Array.isArray(record.newThreads) ? record.newThreads : [])
    .slice(0, 2).flatMap((item): OpenThreadCandidate[] => {
      if (!item || typeof item !== "object") return [];
      const proposed = item as Record<string, unknown>;
      const subject = normalizeContinuityKey(String(proposed.subject ?? ""))
        .slice(0, 80);
      const topic = String(proposed.topic ?? "").trim().slice(0, 240);
      const expectedAt = typeof proposed.expected_at === "string" &&
          !Number.isNaN(Date.parse(proposed.expected_at))
        ? new Date(proposed.expected_at).toISOString()
        : null;
      if (!subject || !topic || !expectedAt) return [];
      return [{
        topic,
        subject,
        display_subject: subject[0]!.toUpperCase() + subject.slice(1),
        followup_prompt: `I should tell you how my ${subject} went.`,
        dedupe_key: `event:${subject.replace(/\s+/g, ":")}:${
          expectedAt.slice(0, 10)
        }`,
        expected_at: expectedAt,
        importance: clampUnit(proposed.importance),
        metadata: { source: "analysis", subject },
      }];
    });
  const available = new Set(
    [
      ...(input.context?.memoryContext?.silent ?? []),
      ...(input.context?.memoryContext?.callbacks ?? []),
      ...(input.context?.memoryContext?.directRecall ?? []),
    ].map((item: any) => String(item.id)),
  );
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? value.map(String).filter((id) => available.has(id)).slice(0, 5)
      : [];
  const placeOpinionCandidates = validatePlaceOpinionCandidates(
    record.placeOpinionCandidates,
    input,
  );
  const chemistryRow = record.chemistry && typeof record.chemistry === "object"
    ? record.chemistry as Record<string, unknown>
    : {};
  const chemistry = {
    userFlirtSignal: clampUnit(chemistryRow.userFlirtSignal),
    characterFlirtSignal: clampUnit(chemistryRow.characterFlirtSignal),
    mutualChemistry: clampUnit(chemistryRow.mutualChemistry),
    heatDelta: Math.max(
      -12,
      Math.min(16, Number(chemistryRow.heatDelta ?? 0) || 0),
    ),
  };
  return {
    relationshipChanges,
    chemistry,
    memoryCandidates,
    resolvedThreadIds,
    newThreads,
    momentCandidate: record.momentCandidate === true,
    moodEffects: {},
    actionCandidates: proposeActions(input),
    placeOpinionCandidates,
    referencedEntities: referencedEntities(input),
    mentionedMemoryIds: ids(record.mentionedMemoryIds),
    reinforcedMemoryIds: ids(record.reinforcedMemoryIds),
    correctedMemorySubjects: Array.isArray(record.correctedMemorySubjects)
      ? record.correctedMemorySubjects.map(String).slice(0, 4)
      : [],
    source: "hybrid",
  };
}

function mergeAnalysis(
  base: ConversationAnalysisProposal,
  modelProposal: ConversationAnalysisProposal,
): ConversationAnalysisProposal {
  const memories = new Map<string, MemoryCandidate>();
  for (const candidate of modelProposal.memoryCandidates) {
    memories.set(candidate.subject_key, candidate);
  }
  for (const candidate of base.memoryCandidates) {
    memories.set(candidate.subject_key, candidate);
  }
  const threads = new Map<string, OpenThreadCandidate>();
  for (const thread of [...modelProposal.newThreads, ...base.newThreads]) {
    threads.set(thread.dedupe_key, thread);
  }
  return {
    ...modelProposal,
    relationshipChanges: mergeRelationshipAnalysisChanges({
      deterministic: base.relationshipChanges,
      analyzed: modelProposal.relationshipChanges,
    }),
    memoryCandidates: [...memories.values()],
    resolvedThreadIds: [
      ...new Set([
        ...base.resolvedThreadIds,
        ...modelProposal.resolvedThreadIds,
      ]),
    ],
    newThreads: [...threads.values()],
    actionCandidates: base.actionCandidates,
    placeOpinionCandidates: modelProposal.placeOpinionCandidates.length
      ? modelProposal.placeOpinionCandidates
      : base.placeOpinionCandidates,
    referencedEntities: [
      ...new Set([
        ...base.referencedEntities,
        ...modelProposal.referencedEntities,
      ]),
    ],
    mentionedMemoryIds: [
      ...new Set([
        ...base.mentionedMemoryIds,
        ...modelProposal.mentionedMemoryIds,
      ]),
    ],
    reinforcedMemoryIds: [
      ...new Set([
        ...base.reinforcedMemoryIds,
        ...modelProposal.reinforcedMemoryIds,
      ]),
    ],
    correctedMemorySubjects: [
      ...new Set([
        ...base.correctedMemorySubjects,
        ...modelProposal.correctedMemorySubjects,
      ]),
    ],
    chemistry: {
      userFlirtSignal: Math.max(
        base.chemistry.userFlirtSignal,
        modelProposal.chemistry.userFlirtSignal,
      ),
      characterFlirtSignal: Math.max(
        base.chemistry.characterFlirtSignal,
        modelProposal.chemistry.characterFlirtSignal,
      ),
      mutualChemistry: Math.max(
        base.chemistry.mutualChemistry,
        modelProposal.chemistry.mutualChemistry,
      ),
      heatDelta: modelProposal.chemistry.heatDelta,
    },
    source: "hybrid",
  };
}

function detectedMentionedMemoryIds(
  assistantMessage: string,
  context: DialogueContext | undefined,
): string[] {
  const text = assistantMessage.toLowerCase();
  const candidates = [
    ...(context?.memoryContext?.callbacks ?? []),
    ...(context?.memoryContext?.directRecall ?? []),
  ];
  return candidates.filter((memory: any) => {
    const words = String(memory.text ?? "").toLowerCase().split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4);
    return words.length > 1 &&
      words.filter((word) => text.includes(word)).length >= 2;
  }).map((memory: any) => String(memory.id));
}

function allowedPlaces(
  input: ConversationAnalysisInput,
): Array<
  { slug: string; name: string; current: boolean; existingView: string | null }
> {
  const current = input.context?.place;
  const places = [current, ...(input.context?.referencedPlaces ?? [])].filter((
    item,
  ): item is NonNullable<typeof current> => Boolean(item));
  return [...new Map(places.map((place) => [place.location.id, {
    slug: place.location.slug,
    name: place.location.name,
    current: place.location.id === current?.location.id,
    existingView: input.context?.placePerspectives?.find((item) =>
      item.locationId === place.location.id
    )?.opinionSummary ?? null,
  }])).values()];
}

export function deterministicPlaceOpinionCandidates(
  input: ConversationAnalysisInput,
): PlaceOpinionCandidate[] {
  return derivePlaceOpinionCandidates({
    assistantMessage: input.assistantMessage,
    places: allowedPlaces(input),
  });
}

export function validatePlaceOpinionCandidates(
  value: unknown,
  input: ConversationAnalysisInput,
): PlaceOpinionCandidate[] {
  return validateDerivedPlaceOpinionCandidates(value, {
    assistantMessage: input.assistantMessage,
    places: allowedPlaces(input),
  });
}

function clampUnit(value: unknown): number {
  const number = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : .5));
}

function proposeActions(
  input: ConversationAnalysisInput,
): ConversationActionCandidate[] {
  const text = input.userMessage.toLowerCase();
  const context = input.context;
  const commitments = context?.upcomingCommitments ?? [];
  const focus = context?.conversationFocus as Record<string, unknown> | null;
  const targetWords = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((
      word,
    ) => word.length > 3);
  const matching = commitments.filter((item) =>
    targetWords(item.title).some((word) => text.includes(word)) ||
    text.includes(item.location.toLowerCase()) ||
    mentionsSameLocalDay(text, item.startsAt, context?.clock?.timezone)
  );
  const focused = focus?.planId
    ? commitments.find((item) => item.id === focus.planId)
    : undefined;
  const candidates = matching.length
    ? matching
    : focused
    ? [focused]
    : commitments;
  const cancelIntent =
    /\b(cancel|call off|forget (?:the|our)|can'?t make|cannot make|won'?t make)\b/
      .test(text);
  const rescheduleIntent =
    /\b(reschedule|move it|move the|make it (?:later|earlier|at|\d)|different time|another day|change (?:the )?time|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday) instead)\b/
      .test(text);
  if ((cancelIntent || rescheduleIntent) && candidates.length) {
    if (candidates.length > 1 && !matching.length && !focused) {
      return [{
        type: rescheduleIntent ? "plan_reschedule" : "plan_cancel",
        confidence: .75,
        payload: {
          ambiguous: true,
          options: candidates.map((item) => ({
            planId: item.id,
            targetType: item.type,
            title: item.title,
            startsAt: item.startsAt,
            location: item.location,
          })),
          requiresConfirmation: true,
        },
      }];
    }
    const target = candidates[0]!;
    const proposedStartsAt = rescheduleIntent
      ? (parsePlanTime(text, context?.clock) ??
        parseTimeOnExistingDate(
          text,
          target.startsAt,
          context?.clock?.timezone,
        ))
      : null;
    return [{
      type: rescheduleIntent ? "plan_reschedule" : "plan_cancel",
      confidence: .92,
      payload: {
        planId: target.id,
        targetType: target.type,
        title: target.title,
        startsAt: target.startsAt,
        location: target.location,
        ...(proposedStartsAt ? { proposedStartsAt } : {}),
        requiresConfirmation: true,
      },
    }];
  }
  const intent = planIntent(text),
    planningWords =
      /\b(let'?s|we should|want to|could we|how about|make plans|plan|go to|go back|meet|grab|get|do something)\b/
        .test(text);
  const catalog = context?.planningCatalog ?? [];
  const explicit = catalog.find((location) =>
    text.includes(location.name.toLowerCase()) ||
    text.includes(location.slug.replace(/-/g, " "))
  );
  const locationEdit = Boolean(focused) &&
    (/\b(somewhere|place|quieter|louder|different venue|go back|instead)\b/
      .test(text) || Boolean(explicit));
  const activityEdit = Boolean(focused) && Boolean(intent) &&
    /\b(instead|rather|do dinner|do coffee|do drinks)\b/.test(text);
  if ((locationEdit || activityEdit) && focused) {
    const quiet = /\bquiet|quieter\b/.test(text);
    const alternate = explicit ??
      rankPlanLocation(
        catalog.filter((item) =>
          item.id !== focus?.locationId &&
          (!quiet || item.privacy === "quiet" || item.tags.includes("quiet") ||
            ["bookstore", "cafe", "park"].includes(item.category))
        ),
        context?.relationship?.relationship_stage,
        intent?.match ?? String(focus?.activityKey ?? ""),
      );
    if (!alternate) return [];
    const activity = activityEdit && intent
      ? ([...alternate.activities, ...alternate.dateTypes].find((item) =>
        normalizePlanWord(item).includes(intent.match) ||
        intent.match.includes(normalizePlanWord(item))
      ) ?? alternate.activities[0])
      : ([...alternate.activities, ...alternate.dateTypes].find((item) =>
        normalizePlanWord(item).replace(/\s+/g, "_") === focus?.activityKey
      ) ?? alternate.activities[0]);
    if (!activity) return [];
    return [{
      type: "plan_reschedule",
      confidence: explicit?.id ? .9 : .82,
      payload: {
        planId: focused.id,
        targetType: focused.type,
        title: focused.title,
        startsAt: focused.startsAt,
        proposedStartsAt: focused.startsAt,
        location: focused.location,
        proposedLocationId: alternate.id,
        proposedLocation: alternate.name,
        proposedActivityKey: normalizePlanWord(activity).replace(/\s+/g, "_"),
        proposedTitle: `${titleCase(activity)} at ${alternate.name}`,
        reasoningCode: quiet ? "quieter_place" : "conversational_edit",
        requiresConfirmation: true,
      },
    }];
  }
  if (!intent) {
    if (
      planningWords &&
      /\b(tonight|tomorrow|this weekend|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
        .test(text)
    ) {
      return [{
        type: "plan_create",
        confidence: .78,
        payload: {
          needsCompanionPick: true,
          suggestedStartsAt: parsePlanTime(text, context?.clock),
          relativeTime: relativeTimePhrase(text),
          title: "Let your companion pick",
          reasoningCode: "progressive_missing_activity",
          requiresConfirmation: true,
        },
      }];
    }
    return [];
  }
  if (!planningWords) return [];
  const compatible = catalog.filter((location: any) =>
    [...location.activities, ...location.dateTypes].some((item: string) =>
      normalizePlanWord(item).includes(intent.match) ||
      intent.match.includes(normalizePlanWord(item))
    )
  );
  const location = explicit ??
    rankPlanLocation(
      compatible,
      context?.relationship?.relationship_stage,
      intent.match,
    );
  const proposedStartsAt = parsePlanTime(text, context?.clock);
  if (!location) return [];
  const rawActivity =
    location.activities.find((item: string) =>
      normalizePlanWord(item).includes(intent.match) ||
      intent.match.includes(normalizePlanWord(item))
    ) ??
      location.dateTypes.find((item: string) =>
        normalizePlanWord(item).includes(intent.match)
      ) ?? intent.label;
  const activityKey = normalizePlanWord(rawActivity).replace(/\s+/g, "_");
  const title = `${titleCase(rawActivity)} at ${location.name}`;
  return [{
    type: intent.match === "dinner" ? "date" : "plan_create",
    confidence: explicit?.id ? 0.96 : 0.86,
    payload: {
      activityIntent: intent.label,
      activityKey,
      locationId: location.id,
      location: location.name,
      title,
      durationMinutes: planDuration(intent.match),
      ...(proposedStartsAt ? { proposedStartsAt } : {}),
      relativeTime: relativeTimePhrase(text),
      reasoningCode: explicit ? "explicit_location" : "catalog_recommendation",
      requiresConfirmation: true,
    },
  }];
}

function planIntent(text: string): { match: string; label: string } | null {
  const groups: [RegExp, string, string][] = [
    [/\b(cocktails?|drinks?|bar)\b/, "drinks", "drinks"],
    [/\b(coffee|cafe|café)\b/, "coffee", "coffee"],
    [/\b(dinner|food|eat)\b/, "dinner", "dinner"],
    [/\b(rooftop movie|movie night|movies?)\b/, "movie", "movie night"],
    [/\b(trivia)\b/, "trivia", "trivia"],
    [/\b(open mic|live music|concert)\b/, "music", "live music"],
    [/\b(bookstore|books?)\b/, "books", "books"],
    [/\b(photo walk|photos?|photography)\b/, "photo", "photos"],
    [/\b(walk|riverwalk|park)\b/, "walk", "walk"],
    [/\b(shopping|shop)\b/, "shopping", "shopping"],
    [/\b(karaoke)\b/, "karaoke", "karaoke"],
    [/\b(comedy)\b/, "comedy", "comedy"],
  ];
  for (const [pattern, match, label] of groups) {
    if (pattern.test(text)) return { match, label };
  }
  return null;
}
function rankPlanLocation(locations: any[], stage: unknown, intent: string) {
  const romantic = ["flirting", "dating", "exclusive", "long_term"].includes(
    String(stage),
  );
  return [...locations].sort((a, b) =>
    planLocationScore(b, romantic, intent) -
    planLocationScore(a, romantic, intent)
  )[0];
}
function planLocationScore(location: any, romantic: boolean, intent: string) {
  let score = 0;
  if (intent === "drinks" && location.slug === "velvet-hour") score += 4;
  if (intent === "coffee" && location.slug === "juniper-cafe") score += 3;
  if (intent === "books" && location.slug === "paper-trail") score += 5;
  if (
    intent === "walk" && ["riverwalk", "halcyon-park"].includes(location.slug)
  ) score += 4;
  if (romantic && location.tags.includes("romantic")) score += 2;
  if (location.category === "work") score -= 5;
  score += Number(location.companionSentiment ?? 0) * 1.25;
  if (
    (location.preferredActivities ?? []).some((activity: string) =>
      normalizePlanWord(activity).includes(intent)
    )
  ) score += 1;
  if (Number(location.sharedVisitCount ?? 0) > 0) score += .25;
  return score;
}
function parsePlanTime(text: string, clock: any): string | null {
  if (!clock?.localDate || !clock?.timezone) return null;
  let date = String(clock.localDate);
  const base = new Date(`${date}T12:00:00Z`);
  if (/\btomorrow\b/.test(text)) {
    base.setUTCDate(base.getUTCDate() + 1);
    date = base.toISOString().slice(0, 10);
  } else {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const index = days.findIndex((day) => text.includes(day));
    if (index >= 0) {
      let delta = (index - Number(clock.weekday) + 7) % 7;
      if (delta === 0) delta = 7;
      base.setUTCDate(base.getUTCDate() + delta);
      date = base.toISOString().slice(0, 10);
    } else if (/\bthis weekend\b/.test(text)) {
      let delta = (6 - Number(clock.weekday) + 7) % 7;
      if (delta === 0) delta = 7;
      base.setUTCDate(base.getUTCDate() + delta);
      date = base.toISOString().slice(0, 10);
    } else if (!/\btonight\b/.test(text)) return null;
  }
  const time = /\b(?:at|around|make it)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/
    .exec(text);
  let hour = time
    ? Number(time[1])
    : (/night|evening|drinks|dinner/.test(text) ? 20 : 10);
  const minute = time?.[2] ? Number(time[2]) : 0;
  if (time?.[3] === "pm" && hour < 12) hour += 12;
  if (time?.[3] === "am" && hour === 12) hour = 0;
  if (!time?.[3] && hour <= 7 && /night|evening|dinner|drinks/.test(text)) {
    hour += 12;
  }
  return localIso(date, hour, minute, String(clock.timezone));
}
function localIso(
  date: string,
  hour: number,
  minute: number,
  timezone: string,
) {
  let guess = Date.parse(
    `${date}T${String(hour).padStart(2, "0")}:${
      String(minute).padStart(2, "0")
    }:00Z`,
  );
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const actual = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
    );
    const wanted = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hour,
      minute,
    );
    guess += wanted - actual;
  }
  return new Date(guess).toISOString();
}
function parseTimeOnExistingDate(
  text: string,
  startsAt: string,
  timezone: unknown,
) {
  const time = /\b(?:at|around|make it)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/
    .exec(text);
  if (!time) return null;
  const zone = String(timezone ?? "UTC"),
    dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(startsAt)),
    get = (type: string) =>
      dateParts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(time[1]);
  const minute = Number(time[2] ?? 0);
  if (time[3] === "pm" && hour < 12) hour += 12;
  if (time[3] === "am" && hour === 12) hour = 0;
  if (!time[3] && hour <= 7) hour += 12;
  return localIso(
    `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute,
    zone,
  );
}
function mentionsSameLocalDay(
  text: string,
  startsAt: string,
  timezone: unknown,
) {
  try {
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: String(timezone ?? "UTC"),
      weekday: "long",
    }).format(new Date(startsAt)).toLowerCase();
    return text.includes(day);
  } catch {
    return false;
  }
}
function normalizePlanWord(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function planDuration(intent: string) {
  return intent === "movie"
    ? 150
    : /trivia|music|dinner|karaoke|comedy/.test(intent)
    ? 120
    : /walk|books|shopping|photo/.test(intent)
    ? 90
    : 60;
}
function relativeTimePhrase(text: string) {
  return /\b(tomorrow(?: night| evening)?|tonight|this weekend|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?: night| evening)?)\b/i
    .exec(text)?.[0] ?? null;
}
function referencedEntities(input: ConversationAnalysisInput): string[] {
  const haystack = `${input.userMessage} ${input.assistantMessage}`
    .toLowerCase();
  const context = input.context;
  const candidates = [
    context?.character?.name,
    context?.place?.world.name,
    context?.place?.location.name,
    ...(context?.place?.ancestry ?? []).map((item) => item.name),
    ...(context?.planningCatalog ?? []).map((item) => item.name),
    ...(context?.social ?? []).map((item) => item.name),
  ].filter((value): value is string =>
    typeof value === "string" && Boolean(value)
  );
  return [...new Set(candidates)].filter((name) =>
    haystack.includes(name.toLowerCase())
  );
}

export function geminiDialogueRequestBody(
  context: DialogueContext,
  options: DialogueRunOptions,
  geminiModel: string,
): Record<string, unknown> {
  const profile = options.generationProfile ??= resolveDialogueRunGenerationProfile({
    context,
    provider: 'gemini',
    model: geminiModel,
    generationContext: options.generationContext,
  });
  const controlsMode = options.chatGenerationControlsMode ??= chatGenerationControlsMode();
  const applied = providerGenerationControls(profile, controlsMode);
  const thinkingConfig = geminiThinkingConfig(geminiModel, applied.reasoningEffort, controlsMode);
  return {
    contents: [{
      role: 'user',
      parts: [{ text: buildCompanionPrompt({
        ...context,
        chatGenerationControlsApplied: applied.promptDynamismApplied,
        chatGenerationMode: options.generationContext?.mode ?? 'direct',
      }) }],
    }],
    generationConfig: {
      temperature: applied.temperature ?? 0.82,
      maxOutputTokens: applied.maxOutputTokens,
      topP: 0.9,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };
}

async function generateGemini(
  context: DialogueContext,
  key: string,
  options: DialogueRunOptions,
): Promise<string> {
  const geminiModel = model(
    "TOGETHER_GEMINI_MODEL",
    Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
  );
  const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${
        encodeURIComponent(geminiModel)
      }:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiDialogueRequestBody(context, options, geminiModel)),
      },
    );
  if (!response.ok) throw new Error(`gemini_dialogue_${response.status}`);
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.map((
      part: Record<string, unknown>,
    ) => part.text).filter(Boolean).join("");
  if (typeof rawText !== 'string' || !rawText.trim()) throw new Error('empty_gemini_response');
  const visible = limitVisibleDialogue(rawText, options.generationProfile?.visibleTokenBudget ?? responseTokenBudget(context));
  options.visibleOutputTruncated = visible.truncated;
  options.deliveredVisibleOutputTokensEstimate = visible.estimatedTokens;
  return visible.text;
}

async function* streamGemini(
  context: DialogueContext,
  key: string,
  options: DialogueRunOptions,
): AsyncIterable<string> {
  const geminiModel = model(
    "TOGETHER_GEMINI_MODEL",
    Deno.env.get("GEMINI_EXPLANATION_MODEL") ?? "gemini-2.5-flash",
  );
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${
      encodeURIComponent(geminiModel)
    }:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiDialogueRequestBody(context, options, geminiModel)),
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`Gemini stream failed (${response.status})`);
  }
  let deliveredText = '';
  let visibleLimitReached = false;
  const visibleBudget = options.generationProfile?.visibleTokenBudget ?? responseTokenBudget(context);
  for await (const data of sseData(response.body)) {
    const payload = JSON.parse(data) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const token = payload.candidates?.[0]?.content?.parts?.map((part) =>
      part.text ?? ""
    ).join("") ?? "";
    if (token && !visibleLimitReached) {
      const candidate = `${deliveredText}${token}`;
      const limited = visibleDialoguePrefix(candidate, visibleBudget);
      const deliverable = limited.slice(deliveredText.length);
      if (limited.length < candidate.length) {
        options.visibleOutputTruncated = true;
        visibleLimitReached = true;
      }
      deliveredText = limited;
      if (deliverable) yield deliverable;
    }
  }
  options.deliveredVisibleOutputTokensEstimate = limitVisibleDialogue(deliveredText, visibleBudget).estimatedTokens;
}

async function* sseData(
  body: ReadableStream<Uint8Array>,
  options?: { inactivityMs: number; onTimeout: () => void },
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = options
      ? await readStreamChunk(reader, options)
      : await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const data = event.split("\n").filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6)).join("\n");
      if (data && data !== "[DONE]") yield data;
    }
    if (done) break;
  }
  if (buffer.startsWith("data: ")) yield buffer.slice(6).trim();
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: { inactivityMs: number; onTimeout: () => void },
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timer = setTimeout(() => {
          options.onTimeout();
          reject(new DialogueProviderTimeoutError());
        }, options.inactivityMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function* textChunks(content: string): Iterable<string> {
  yield* content.match(/\S+\s*/g) ?? [content];
}

async function embedGemini(
  text: string,
  key: string,
): Promise<number[] | null> {
  try {
    const embeddingModel = model(
      "TOGETHER_GEMINI_EMBEDDING_MODEL",
      "gemini-embedding-001",
    );
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${
        encodeURIComponent(embeddingModel)
      }:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${embeddingModel}`,
          content: { parts: [{ text }] },
          outputDimensionality: 1536,
        }),
      },
    );
    if (!response.ok) return null;
    const values = (await response.json()).embedding?.values;
    return Array.isArray(values) && values.length === 1536 ? values : null;
  } catch {
    return null;
  }
}

function fallbackDialogue(context: DialogueContext): string {
  const lower = context.userMessage.toLowerCase();
  const texting =
    resolveConversationStyle(context.conversationStyle) === "texting";
  if (context.intimacyStance?.active) return explicitProviderFallback(context);
  if (/dog.*name is/.test(lower)) {
    return texting
      ? "Cooper. Got it—that's a very good name."
      : "Okay, that is important information. I'm going to remember that—Cooper is a very good name. What kind of trouble does he get into?";
  }
  if (/presentation|interview|exam/.test(lower)) {
    return texting
      ? "That's a big deal. I'm rooting for you."
      : "That sounds like a big deal. I'll be rooting for you—and I want to hear how it goes afterward.";
  }
  if (/olive/.test(lower)) {
    return "Noted. If olives show up on our table, they're staying very far away from your side.";
  }
  if (/hello|\bhi\b|\bhey\b/.test(lower)) {
    return texting
      ? "Hey. I was just sorting through a very questionable photo set."
      : "Hey. I was just sorting through a shoot that somehow produced three hundred photos of the same crooked lamp. How's your day going?";
  }
  const memory = context.memoryContext?.directRecall?.[0]?.text ??
    (Number(context.memoryContext?.callbackAllowance ?? 0) > 0
      ? context.memoryContext?.callbacks?.[0]?.text
      : undefined);
  if (memory) {
    return texting
      ? memory.replace(/^User /, "You ")
      : `You know, that reminds me of something you told me before—${
        memory.replace(/^User /, "you ")
      } Anyway, tell me the part of this that matters most to you.`;
  }
  return texting
    ? "Okay, you have my attention."
    : "Okay, you have my attention. Tell me more—but give me the real version, not the polished one.";
}
