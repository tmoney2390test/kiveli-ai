export type NormalizedAiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  providerCostTicks?: number;
  providerCostUsd?: number;
};

export const aiPricing = {
  openai: {
    'gpt-5.6-luna': { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.2 },
    'gpt-4.1-nano': { inputPerMillion: 0.1, cachedInputPerMillion: 0.025, outputPerMillion: 0.4 },
    'text-embedding-3-small': { inputPerMillion: 0.02, cachedInputPerMillion: 0, outputPerMillion: 0 },
  },
  xai: {
    'grok-4.3': { inputPerMillion: 1.25, cachedInputPerMillion: 0.2, outputPerMillion: 2.5 },
  },
} as const;

const count = (value: unknown): number => Math.max(0, Math.round(Number(value) || 0));

export function normalizeResponsesUsage(provider: 'openai' | 'xai', raw: unknown): NormalizedAiUsage {
  const usage = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const inputDetails=record(usage['input_tokens_details']??usage['prompt_tokens_details']),outputDetails=record(usage['output_tokens_details']??usage['completion_tokens_details']);
  const inputTokens = count(usage['input_tokens'] ?? usage['prompt_tokens']);
  const outputTokens = count(usage['output_tokens'] ?? usage['completion_tokens']);
  const cachedInputTokens = Math.min(inputTokens, count(inputDetails['cached_tokens']));
  const reasoningTokens = count(outputDetails['reasoning_tokens']);
  const totalTokens = count(usage['total_tokens']) || inputTokens + outputTokens;
  const providerCostTicks = provider === 'xai' && usage['cost_in_usd_ticks'] != null ? count(usage['cost_in_usd_ticks']) : undefined;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    ...(providerCostTicks !== undefined ? { providerCostTicks, providerCostUsd: providerCostTicks / 10_000_000_000 } : {}),
  };
}

export function estimateAiCost(provider: 'openai' | 'xai', model: string, usage: NormalizedAiUsage, serviceTier?:unknown): number | null {
  const registry = aiPricing[provider] as Record<string, { inputPerMillion: number; cachedInputPerMillion: number; outputPerMillion: number }>;
  const price = registry[model];
  if (!price) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const normalizedTier=typeof serviceTier==='string'?serviceTier.trim().toLowerCase():'';
  const multiplier=provider==='openai'&&(normalizedTier==='fast'||normalizedTier==='priority')?2:1;
  return multiplier*(uncached * price.inputPerMillion + usage.cachedInputTokens * price.cachedInputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000;
}

export type AiUsageSummary = {
  windows: Record<'today'|'sevenDays'|'thirtyDays',{costUsd:number;requests:number}>;
  byProvider:Record<string,{costUsd:number;requests:number}>;
  byModel:Record<string,{costUsd:number;requests:number}>;
  byOperation:Record<string,{costUsd:number;requests:number}>;
  bySubscriptionTier:Record<string,{costUsd:number;requests:number}>;
  averageCostPerDialogueTurn:number;averageInputTokens:number;averageOutputTokens:number;averageCachedInputTokens:number;cacheHitRate:number;grokRoutingPercentage:number;directorInvocationPercentage:number;
};
export function summarizeAiUsage(rows:Array<Record<string,unknown>>,now=new Date()):AiUsageSummary{
  const windows={today:{costUsd:0,requests:0},sevenDays:{costUsd:0,requests:0},thirtyDays:{costUsd:0,requests:0}},byProvider:AiUsageSummary['byProvider']={},byModel:AiUsageSummary['byModel']={},byOperation:AiUsageSummary['byOperation']={},bySubscriptionTier:AiUsageSummary['bySubscriptionTier']={};
  const todayStart=new Date(now);todayStart.setUTCHours(0,0,0,0);const seven=now.getTime()-7*86400000,thirty=now.getTime()-30*86400000;let inputs=0,outputs=0,cached=0,cacheHits=0,grok=0,directors=0,dialogue=0;
  for(const row of rows){const cost=Number(row['provider_cost_usd']??row['estimated_cost_usd']??0),created=new Date(scalar(row['created_at'])).getTime(),operation=scalar(row['operation']);if(created>=todayStart.getTime()){windows.today.costUsd+=cost;windows.today.requests++;}if(created>=seven){windows.sevenDays.costUsd+=cost;windows.sevenDays.requests++;}if(created>=thirty){windows.thirtyDays.costUsd+=cost;windows.thirtyDays.requests++;}add(byProvider,scalar(row['provider']),cost);add(byModel,scalar(row['model']),cost);add(byOperation,operation,cost);add(bySubscriptionTier,scalar(row['subscription_tier']),cost);inputs+=Number(row['input_tokens']??0);outputs+=Number(row['output_tokens']??0);cached+=Number(row['cached_input_tokens']??0);if(row['cache_hit'])cacheHits++;if(row['provider']==='xai')grok++;if(operation.startsWith('director_'))directors++;if(operation.startsWith('dialogue_')||operation==='shared_scene_dialogue')dialogue++;}
  const count=rows.length||1,totalDialogueCost=rows.filter((row)=>scalar(row['operation']).startsWith('dialogue_')||row['operation']==='shared_scene_dialogue').reduce((sum,row)=>sum+Number(row['provider_cost_usd']??row['estimated_cost_usd']??0),0);return{windows,byProvider,byModel,byOperation,bySubscriptionTier,averageCostPerDialogueTurn:dialogue?totalDialogueCost/dialogue:0,averageInputTokens:inputs/count,averageOutputTokens:outputs/count,averageCachedInputTokens:cached/count,cacheHitRate:cacheHits/count,grokRoutingPercentage:grok/count,directorInvocationPercentage:dialogue?directors/dialogue:0};
}
function add(target:Record<string,{costUsd:number;requests:number}>,key:string,cost:number){const current=target[key]??{costUsd:0,requests:0};current.costUsd+=cost;current.requests++;target[key]=current;}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'?value as Record<string,unknown>:{};}
function scalar(value:unknown):string{return typeof value==='string'||typeof value==='number'?String(value):'unknown';}
