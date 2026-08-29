import { estimateAiCost, type NormalizedAiUsage } from '../../../packages/together-domain/src/ai-usage.ts';
import type { DialogueRouteReason } from '../../../packages/together-domain/src/ai-routing.ts';
import { waitUntil } from './background.ts';

export type AiUsageScope = {
  db?: any;
  userId?: string;
  continuityId?: string | null;
  conversationId?: string | null;
  characterInstanceId?: string | null;
  subscriptionTier?: string | null;
  routeReason?: DialogueRouteReason | string | null;
  contentMode?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AiUsageEvent = {
  provider: 'openai' | 'xai' | 'gemini' | 'deterministic';
  model: string;
  operation: string;
  usage?: NormalizedAiUsage | null;
  latencyMs: number;
  success: boolean;
  httpStatus?: number | null;
  errorCode?: string | null;
  cacheHit?: boolean;
  estimatedCostUsd?: number | null;
  metadata?: Record<string, unknown>;
};

export async function recordAiUsage(scope: AiUsageScope | undefined, event: AiUsageEvent): Promise<void> {
  if (!scope?.db || !scope.userId || Deno.env.get('KIVELLE_AI_COST_TELEMETRY_ENABLED') === 'false') return;
  const usage=event.usage;
  const estimated=event.estimatedCostUsd ?? (usage && (event.provider==='openai'||event.provider==='xai') ? estimateAiCost(event.provider,event.model,usage) : null);
  const row={
    user_id:scope.userId,
    continuity_id:scope.continuityId??null,
    conversation_id:scope.conversationId??null,
    character_instance_id:scope.characterInstanceId??null,
    correlation_id:scope.correlationId??null,
    provider:event.provider,
    model:event.model,
    operation:event.operation,
    route_reason:scope.routeReason??null,
    content_mode:scope.contentMode??null,
    subscription_tier:scope.subscriptionTier??null,
    input_tokens:usage?.inputTokens??0,
    cached_input_tokens:usage?.cachedInputTokens??0,
    output_tokens:usage?.outputTokens??0,
    reasoning_tokens:usage?.reasoningTokens??0,
    total_tokens:usage?.totalTokens??0,
    estimated_cost_usd:estimated,
    provider_cost_usd:usage?.providerCostUsd??null,
    provider_cost_ticks:usage?.providerCostTicks??null,
    cache_hit:event.cacheHit??Boolean(usage?.cachedInputTokens),
    latency_ms:Math.max(0,Math.round(event.latencyMs)),
    success:event.success,
    http_status:event.httpStatus??null,
    error_code:event.errorCode??null,
    metadata:{...(scope.metadata??{}),...(event.metadata??{}),...(scope.correlationId?{correlationId:scope.correlationId}:{})},
  };
  const write=scope.db.from('together_ai_usage_events').insert(row).then(({error}:{error:{code?:string}|null})=>{
    if(error)console.warn('AI usage telemetry insert failed',error.code??'unknown_error');
  });
  // EdgeRuntime.waitUntil keeps cost/latency telemetry reliable without adding a
  // database round trip to the user's time-to-first-token.
  waitUntil(write);
}
