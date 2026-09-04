import { describe, expect, it } from 'vitest';
import { estimateAiCost, normalizeResponsesUsage } from './ai-usage.ts';

describe('AI usage normalization',()=>{
  it('normalizes cached OpenAI Responses usage and prices only the uncached portion at full rate',()=>{
    const usage=normalizeResponsesUsage('openai',{input_tokens:10_000,input_tokens_details:{cached_tokens:8_000},output_tokens:1_000,output_tokens_details:{reasoning_tokens:0},total_tokens:11_000});
    expect(usage).toMatchObject({inputTokens:10_000,cachedInputTokens:8_000,outputTokens:1_000,totalTokens:11_000});
    expect(estimateAiCost('openai','gpt-5.6-luna',usage)).toBeCloseTo(.00176,8);
    expect(estimateAiCost('openai','gpt-5.6-luna',usage,'fast')).toBeCloseTo(.00352,8);
    expect(estimateAiCost('openai','gpt-4.1-nano',usage)).toBeCloseTo(.0008,8);
  });
  it('normalizes xAI exact cost ticks',()=>{
    const usage=normalizeResponsesUsage('xai',{input_tokens:100,input_tokens_details:{cached_tokens:20},output_tokens:40,cost_in_usd_ticks:1_250_000});
    expect(usage.providerCostUsd).toBe(.000125);
    expect(usage.providerCostTicks).toBe(1_250_000);
  });
  it('handles zero cache and unknown model pricing safely',()=>{
    const usage=normalizeResponsesUsage('openai',{input_tokens:100,output_tokens:10});
    expect(usage.cachedInputTokens).toBe(0);
    expect(estimateAiCost('openai','unknown',usage)).toBeNull();
  });
});
