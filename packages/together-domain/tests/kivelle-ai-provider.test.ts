import { describe,expect,it,vi } from 'vitest';
import { buildResponsesRequestBody, canRetryStreamFailure, deriveOpaquePromptCacheKey, dialogueFallbackProvider, executeResponsesHttp, extractResponsesText, parseResponsesStreamEvent } from '../src/ai-provider.ts';

describe('Kivelle Responses provider adapter',()=>{
  it.each([['openai','https://api.openai.com/v1/responses','gpt-5.6-luna'],['xai','https://api.x.ai/v1/responses','grok-4.3']] as const)('uses the correct %s endpoint, model, disabled reasoning, and token budget',async(provider,endpoint,model)=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({output_text:'hello',usage:{input_tokens:10,output_tokens:2}}),{status:200})) as unknown as typeof fetch;
    const requestBody=buildResponsesRequestBody({model,prompt:'same canonical prompt',maxOutputTokens:160,stream:false,...(provider==='xai'?{promptCacheKey:'kivelle_opaque'}:{})});
    await executeResponsesHttp(fetchMock,provider,'server-secret',requestBody);
    expect(fetchMock).toHaveBeenCalledOnce();
    const calls=vi.mocked(fetchMock).mock.calls;const[url,init]=calls[0]??[];expect(url).toBe(endpoint);const request=init as RequestInit,parsedBody=JSON.parse(typeof request.body==='string'?request.body:'{}') as Record<string,unknown>,headers=request.headers as Record<string,string>;expect(parsedBody).toMatchObject({model,input:'same canonical prompt',max_output_tokens:160,reasoning:{effort:'none'}});expect(headers['Authorization']).toBe('Bearer server-secret');
    if(provider==='xai')expect(parsedBody['prompt_cache_key']).toBe('kivelle_opaque');
  });
  it('parses non-streaming text and streaming completion usage',()=>{
    expect(extractResponsesText({output_text:' hi '})).toBe('hi');
    expect(parseResponsesStreamEvent({type:'response.output_text.delta',delta:'hey'})).toEqual({token:'hey'});
    expect(parseResponsesStreamEvent({type:'response.completed',response:{usage:{input_tokens:5}}})).toEqual({usage:{input_tokens:5}});
  });
  it('derives a stable opaque cache key without exposing conversation identifiers',async()=>{
    const scope={conversationId:'conversation-private',continuityId:'life-private',characterInstanceId:'character-private'};
    const first=await deriveOpaquePromptCacheKey(scope),second=await deriveOpaquePromptCacheKey(scope);
    expect(first).toBe(second);expect(first).toMatch(/^kivelle_[0-9a-f]{64}$/);expect(first).not.toContain('conversation-private');
  });
  it('never retries another provider after partial output and never sends explicit fallback to OpenAI',()=>{
    expect(canRetryStreamFailure(false)).toBe(true);expect(canRetryStreamFailure(true)).toBe(false);
    expect(dialogueFallbackProvider('openai',true)).toBe('gemini');expect(dialogueFallbackProvider('xai',true)).toBe('deterministic');
  });
  it('surfaces provider HTTP failures to the orchestration layer without inventing output',async()=>{
    const fetchMock=vi.fn(async()=>new Response('',{status:503})) as unknown as typeof fetch;
    const response=await executeResponsesHttp(fetchMock,'xai','server-secret',buildResponsesRequestBody({model:'grok-4.3',prompt:'bounded',maxOutputTokens:160,stream:false}));
    expect(response.status).toBe(503);
  });
});
