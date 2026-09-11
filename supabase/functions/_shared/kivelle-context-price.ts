import { wavespeedChatRate } from '../../../packages/together-domain/src/wavespeed-chat.ts';
import { veniceChatRate } from '../../../packages/together-domain/src/venice-chat.ts';
import { AppError } from './types.ts';

// Rates are microdollars per million tokens. Reviewed 2026-09-07.
// Price the entire response when expanded context is useful. This conservative
// launch budget leaves room for included plan benefits, payment fees and retries.
export const CONTEXT_PRICE_VERSION='context-2026-09-08-v2';
export const CONTEXT_COMPILER_VERSION='context-v1';
export const COST_BUDGET_MICRODOLLARS=10_000;
export const SUPPORT_ALLOWANCE_MICRODOLLARS=4_000;
const rates:Record<string,{input:number;cached:number;output:number}>={
  'openai:gpt-5.6-luna':{input:250_000,cached:20_000,output:1_200_000},
  'openai:gpt-4.1-nano':{input:100_000,cached:25_000,output:400_000},
  'xai:grok-4.3':{input:1_250_000,cached:200_000,output:2_500_000},
};
export function assertContextPricingCurrent(now=Date.now()):void{if(now>Date.parse('2026-10-07T00:00:00Z'))throw new AppError('PROVIDER_UNAVAILABLE','Expanded context pricing is being updated. Choose Included for now.',503,true);}
export function contextCredits(input:{provider:string;model:string;inputTokens:number;outputTokens:number;cachedInputTokens?:number;serviceTier?:string}):number{
  const veniceRate=input.provider==='venice'?veniceChatRate(input.model):undefined;
  const waveRate=input.provider==='wavespeed'?wavespeedChatRate(input.model):undefined;
  const rate=veniceRate?{input:Math.round(veniceRate.inputPerMillion*1_000_000),cached:Math.round(veniceRate.inputPerMillion*1_000_000),output:Math.round(veniceRate.outputPerMillion*1_000_000)}:waveRate?{input:Math.round(waveRate.inputPerMillion*1_000_000),cached:Math.round(waveRate.cachedInputPerMillion*1_000_000),output:Math.round(waveRate.outputPerMillion*1_000_000)}:rates[`${input.provider}:${input.model}`];
  if(!rate)throw new AppError('PROVIDER_UNAVAILABLE','Expanded context pricing is being updated. Choose Included for now.',503,true);
  const tokens=Math.max(0,Math.ceil(input.inputTokens)),cached=Math.min(tokens,Math.max(0,Math.floor(input.cachedInputTokens??0)));
  const multiplier=input.serviceTier==='priority'&&input.provider==='openai'?2:input.provider==='xai'&&tokens>200000?2:1;
  const cost=Math.ceil(multiplier*((tokens-cached)*rate.input+cached*rate.cached+Math.max(0,Math.ceil(input.outputTokens))*rate.output)/1_000_000)+SUPPORT_ALLOWANCE_MICRODOLLARS;
  return Math.max(1,Math.ceil(cost/COST_BUDGET_MICRODOLLARS));
}
