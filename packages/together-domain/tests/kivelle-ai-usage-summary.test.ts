import { describe,expect,it } from 'vitest';
import { summarizeAiUsage } from '../src/ai-usage.ts';

describe('Kivelle AI operational usage summary',()=>{
  it('keeps retries, Director, and shared-scene inference as distinct requests',()=>{
    const now=new Date('2026-08-18T12:00:00Z');
    const rows=[
      {provider:'openai',model:'gpt-5.6-luna',operation:'dialogue_openai',estimated_cost_usd:.001,input_tokens:100,cached_input_tokens:0,output_tokens:20,cache_hit:false,success:false,created_at:'2026-08-18T11:00:00Z'},
      {provider:'gemini',model:'gemini-2.5-flash',operation:'dialogue_gemini',estimated_cost_usd:0,input_tokens:90,cached_input_tokens:0,output_tokens:18,cache_hit:false,success:true,created_at:'2026-08-18T11:00:01Z'},
      {provider:'openai',model:'gpt-5-mini',operation:'director_openai',estimated_cost_usd:.0002,input_tokens:40,cached_input_tokens:10,output_tokens:5,cache_hit:true,success:true,created_at:'2026-08-18T11:00:02Z'},
      {provider:'xai',model:'grok-4.3',operation:'shared_scene_dialogue',provider_cost_usd:.002,input_tokens:120,cached_input_tokens:80,output_tokens:30,cache_hit:true,success:true,created_at:'2026-08-18T11:00:03Z'},
    ];
    const summary=summarizeAiUsage(rows,now);
    expect(summary.windows.today.requests).toBe(4);
    expect(summary.byOperation['dialogue_openai']?.requests).toBe(1);
    expect(summary.byOperation['shared_scene_dialogue']?.requests).toBe(1);
    expect(summary.byProvider['xai']?.costUsd).toBe(.002);
    expect(summary.cacheHitRate).toBe(.5);
    expect(summary.directorInvocationPercentage).toBeCloseTo(1/3);
  });
});
