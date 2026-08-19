export function responsesProviderEndpoint(provider:'openai'|'xai'):string{return provider==='openai'?'https://api.openai.com/v1/responses':'https://api.x.ai/v1/responses';}
export function buildResponsesRequestBody(input:{model:string;prompt:string;maxOutputTokens:number;stream:boolean;promptCacheKey?:string}){return{model:input.model,input:input.prompt,max_output_tokens:input.maxOutputTokens,reasoning:{effort:'none' as const},stream:input.stream,...(input.promptCacheKey?{prompt_cache_key:input.promptCacheKey}:{})};}
export async function executeResponsesHttp(fetchImpl:typeof fetch,provider:'openai'|'xai',key:string,body:Record<string,unknown>):Promise<Response>{return fetchImpl(responsesProviderEndpoint(provider),{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}
export function extractResponsesText(data:Record<string,unknown>):string{
  if(typeof data['output_text']==='string')return data['output_text'].trim();
  const output=Array.isArray(data['output'])?data['output']:[];
  for(const rawItem of output){const item=asRecord(rawItem),content=Array.isArray(item['content'])?item['content']:[];for(const rawContent of content){const part=asRecord(rawContent);if(part['type']==='output_text'&&typeof part['text']==='string')return part['text'].trim();}}
  return'';
}
export function parseResponsesStreamEvent(event:Record<string,unknown>):{token?:string;usage?:unknown}{if(event['type']==='response.output_text.delta'&&typeof event['delta']==='string')return{token:event['delta']};if(event['type']==='response.completed'){const response=asRecord(event['response']);return{usage:response['usage']??event['usage']};}return{};}
export function canRetryStreamFailure(tokensEmitted:boolean):boolean{return !tokensEmitted;}
export function dialogueFallbackProvider(provider:'openai'|'xai',geminiAvailable:boolean):'gemini'|'deterministic'{return provider==='openai'&&geminiAvailable?'gemini':'deterministic';}

export async function deriveOpaquePromptCacheKey(input:{conversationId?:string|null|undefined;continuityId?:string|null|undefined;characterInstanceId?:string|null|undefined}):Promise<string>{const source=`kivelle-dialogue:v1:${input.conversationId??'none'}:${input.continuityId??'none'}:${input.characterInstanceId??'none'}`,bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));return`kivelle_${Array.from(new Uint8Array(bytes)).map((byte)=>byte.toString(16).padStart(2,'0')).join('')}`;}
function asRecord(value:unknown):Record<string,unknown>{return value&&typeof value==='object'?value as Record<string,unknown>:{};}
