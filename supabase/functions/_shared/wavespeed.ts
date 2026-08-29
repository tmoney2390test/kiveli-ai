import{AppError}from'./types.ts';
import{verifyProviderWebhookHmac}from'../../../packages/together-domain/src/provider-webhook.ts';

// Keep these small provider-boundary helpers inside the Edge bundle. The
// remote Supabase bundler does not reliably upload this newer cross-workspace
// module even though local Deno resolution succeeds.
type WaveSpeedRequestOptions={enableSyncMode?:boolean|undefined;enableBase64Output?:boolean|undefined};
function buildWaveSpeedRequestBody(input:Record<string,unknown>,options:WaveSpeedRequestOptions={}):Record<string,unknown>{
  const body={...input};
  if(options.enableSyncMode!==undefined)body['enable_sync_mode']=options.enableSyncMode;
  if(options.enableBase64Output!==undefined)body['enable_base64_output']=options.enableBase64Output;
  return body;
}
function normalizeWaveSpeedOutputs(value:unknown):{urlOutputs:string[];textOutputs:string[]}{
  const urlOutputs:string[]=[],textOutputs:string[]=[];
  for(const output of Array.isArray(value)?value:[])collectWaveSpeedOutput(output,urlOutputs,textOutputs,0);
  return{urlOutputs:[...new Set(urlOutputs)],textOutputs:[...new Set(textOutputs)]};
}
function collectWaveSpeedOutput(value:unknown,urls:string[],texts:string[],depth:number):void{
  if(depth>4||value==null)return;
  if(typeof value==='string'){const normalized=value.trim();if(!normalized)return;if(isHttpsUrl(normalized))urls.push(normalized);else texts.push(normalized);return;}
  if(Array.isArray(value)){for(const item of value)collectWaveSpeedOutput(item,urls,texts,depth+1);return;}
  if(typeof value!=='object')return;
  const record=value as Record<string,unknown>,urlKeys=new Set(['url','uri','image_url','video_url','output_url']),textKeys=new Set(['text','answer','content','caption','response','message','value','output']),containerKeys=new Set(['data','result']);
  let collected=false;
  for(const[key,item]of Object.entries(record)){const normalizedKey=key.toLowerCase();if(urlKeys.has(normalizedKey)||textKeys.has(normalizedKey)||containerKeys.has(normalizedKey)){const before=urls.length+texts.length;collectWaveSpeedOutput(item,urls,texts,depth+1);collected=collected||urls.length+texts.length>before;}}
  if(!collected){try{const serialized=JSON.stringify(value);if(serialized)texts.push(serialized);}catch{/* Ignore non-serializable provider output. */}}
}

const API_BASE='https://api.wavespeed.ai/api/v3';
export type WaveSpeedStatus='created'|'processing'|'completed'|'failed'|'cancelled'|'timeout'|'deleted';
export type WaveSpeedPrediction={id:string;model:string;status:WaveSpeedStatus;outputs:string[];textOutputs?:string[];error?:string;createdAt?:string;getUrl?:string;inferenceMs?:number;hasNsfwContents?:boolean[]};
export type WaveSpeedSubmission={provider:'wavespeed';providerRequestId:string;model:string;status:'submitted'|'completed';result?:WaveSpeedPrediction};
export type WaveSpeedRunResult={prediction:WaveSpeedPrediction|null;providerRequestId:string;model:string;timedOut:boolean};
export type WaveSpeedSubmitOptions={webhook?:boolean|undefined}&WaveSpeedRequestOptions;
export type WaveSpeedQuote={amountUsd:number;currency:'USD';rawUnit?:string};

export type WaveSpeedEnvelope={code?:number;message?:string;data?:{id?:string;model?:string;status?:string;outputs?:unknown;error?:unknown;created_at?:string;urls?:{get?:string};timings?:{inference?:number};has_nsfw_contents?:unknown}};

export class WaveSpeedClient{
  constructor(private readonly apiKey:string,private readonly webhookUrl?:string){}

  async submit(model:string,input:Record<string,unknown>,options:WaveSpeedSubmitOptions={}):Promise<WaveSpeedSubmission>{
    const webhook=options.webhook===false?undefined:this.webhookUrl;
    const endpoint=`${API_BASE}/${model}${webhook?`?webhook=${encodeURIComponent(webhook)}`:''}`;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60_000);
    try{
      const body=buildWaveSpeedRequestBody(input,{enableSyncMode:options.enableSyncMode,enableBase64Output:options.enableBase64Output});
      const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const payload=await parseEnvelope(response);
      if(!response.ok||Number(payload.code??response.status)!==200)throw providerError(response.status,payload.message??safeProviderError(payload.data?.error));
      const prediction=normalizePrediction(payload,model);
      if(!prediction.id)throw new AppError('PROVIDER_SUBMISSION_UNKNOWN','The provider did not confirm the media request. No duplicate request was sent.',503,false);
      return{provider:'wavespeed',providerRequestId:prediction.id,model:prediction.model,status:prediction.status==='completed'?'completed':'submitted',...(prediction.status==='completed'?{result:prediction}:{})};
    }catch(error){
      if(error instanceof AppError)throw error;
      if(error instanceof DOMException&&error.name==='AbortError')throw new AppError('PROVIDER_SUBMISSION_UNKNOWN','The provider did not confirm the media request. No duplicate request was sent.',503,false);
      throw new AppError('PROVIDER_SUBMISSION_UNKNOWN','The provider did not confirm the media request. No duplicate request was sent.',503,false);
    }finally{clearTimeout(timeout);}
  }

  async getResult(providerRequestId:string):Promise<WaveSpeedPrediction>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30_000);
    try{
      const response=await fetch(`${API_BASE}/predictions/${encodeURIComponent(providerRequestId)}/result`,{headers:{Authorization:`Bearer ${this.apiKey}`},signal:controller.signal});
      const payload=await parseEnvelope(response);
      if(!response.ok||Number(payload.code??response.status)!==200)throw providerError(response.status,payload.message);
      return normalizePrediction(payload);
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The provider result could not be checked right now.',503,true);}finally{clearTimeout(timeout);}
  }

  /**
   * WaveSpeed's server-side price endpoint evaluates the exact model/input
   * combination. Kivelle never trusts a client price or submits a paid video
   * when the provider cannot return a finite quote.
   */
  async quote(model:string,input:Record<string,unknown>):Promise<WaveSpeedQuote>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
    try{
      const response=await fetch(`${API_BASE}/model/price`,{method:'POST',headers:{Authorization:`Bearer ${this.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model_id:model,inputs:input}),signal:controller.signal});
      const text=await response.text();let payload:unknown;try{payload=JSON.parse(text);}catch{payload=null;}
      if(!response.ok)throw providerError(response.status,safeProviderError(payload));
      const amount=findQuoteAmount(payload);
      if(!Number.isFinite(amount)||amount<0)throw new AppError('PROVIDER_UNAVAILABLE','The video model could not be priced safely.',503,true);
      return{amountUsd:amount,currency:'USD',rawUnit:'provider_quote'};
    }catch(error){if(error instanceof AppError)throw error;throw new AppError('PROVIDER_TIMEOUT','The video model price could not be checked right now.',503,true);}finally{clearTimeout(timeout);}
  }

  async runToCompletion(model:string,input:Record<string,unknown>,timeoutMs=30_000,options:WaveSpeedRequestOptions={}):Promise<WaveSpeedRunResult>{
    const submitted=await this.submit(model,input,{webhook:false,...options});
    if(submitted.status==='completed'&&submitted.result)return{prediction:submitted.result,providerRequestId:submitted.providerRequestId,model:submitted.model,timedOut:false};
    const deadline=Date.now()+timeoutMs;
    let lastPrediction:WaveSpeedPrediction|null=null;
    while(Date.now()<deadline){
      await new Promise((resolve)=>setTimeout(resolve,2_000));
      try{
        const prediction=await this.getResult(submitted.providerRequestId);lastPrediction=prediction;
        if(prediction.status==='completed'||['failed','cancelled','timeout','deleted'].includes(prediction.status))return{prediction,providerRequestId:submitted.providerRequestId,model:prediction.model||submitted.model,timedOut:false};
      }catch(error){if(!(error instanceof AppError)||!error.retryable)throw error;}
    }
    return{prediction:lastPrediction,providerRequestId:submitted.providerRequestId,model:lastPrediction?.model||submitted.model,timedOut:true};
  }
}

export function findQuoteAmount(payload:unknown):number{
  const candidates:string[]=['price','amount','cost','total','total_price','estimated_cost','usd'];
  const visit=(value:unknown,depth:number):number=>{
    if(depth>5||value==null)return Number.NaN;
    if(typeof value==='number')return value;
    if(typeof value==='string'){const parsed=Number(value.replace(/[^0-9.eE+-]/g,''));return Number.isFinite(parsed)?parsed:Number.NaN;}
    if(typeof value!=='object')return Number.NaN;
    const record=value as Record<string,unknown>;
    for(const key of candidates){if(key in record){const found=visit(record[key],depth+1);if(Number.isFinite(found))return found;}}
    for(const key of ['data','result','quote','pricing']){if(key in record){const found=visit(record[key],depth+1);if(Number.isFinite(found))return found;}}
    return Number.NaN;
  };
  return visit(payload,0);
}

async function parseEnvelope(response:Response):Promise<WaveSpeedEnvelope>{const text=await response.text();try{return JSON.parse(text) as WaveSpeedEnvelope;}catch{return{code:response.status,message:text.slice(0,160)}};}

export function normalizePrediction(payload:WaveSpeedEnvelope,fallbackModel=''):WaveSpeedPrediction{
  const data=payload.data??{},status=String(data.status??'created') as WaveSpeedStatus;
  const validStatuses:WaveSpeedStatus[]=['created','processing','completed','failed','cancelled','timeout','deleted'];
  const outputs=normalizeWaveSpeedOutputs(data.outputs);
  return{id:String(data.id??''),model:String(data.model??fallbackModel),status:validStatuses.includes(status)?status:'failed',outputs:outputs.urlOutputs,textOutputs:outputs.textOutputs,error:safeProviderError(data.error),createdAt:data.created_at,getUrl:isHttpsUrl(data.urls?.get)?data.urls?.get:undefined,inferenceMs:Number.isFinite(data.timings?.inference)?Number(data.timings?.inference):undefined,hasNsfwContents:Array.isArray(data.has_nsfw_contents)?data.has_nsfw_contents.map(Boolean):undefined};
}

export function normalizeWaveSpeedWebhook(payload:unknown):WaveSpeedPrediction{
  const value=payload&&typeof payload==='object'?payload as Record<string,unknown>:{};
  if(value.data&&typeof value.data==='object')return normalizePrediction(value as WaveSpeedEnvelope);
  return normalizePrediction({code:200,data:value as WaveSpeedEnvelope['data']});
}

function providerError(status:number,message?:string):AppError{
  if(status===401)return new AppError('PROVIDER_AUTH','The photo provider needs attention.',503,false);
  if(status===402||status===403)return new AppError('PROVIDER_QUOTA','Media generation is temporarily unavailable.',503,false);
  if(status===404)return new AppError('PROVIDER_MODEL','The configured media model is unavailable.',503,false);
  if(status===429)return new AppError('RATE_LIMITED','Media requests are busy right now. Try again soon.',429,true);
  if(status===400||status===422)return new AppError('PROVIDER_REQUEST_INVALID','The media request could not be processed.',422,false);
  if(/content|safety|nsfw|moderation/i.test(message??''))return new AppError('PROVIDER_CONTENT_BLOCKED','That media request could not be created.',422,false);
  return new AppError('PROVIDER_UNAVAILABLE','The media provider is temporarily unavailable.',503,status>=500);
}

function safeProviderError(value:unknown):string|undefined{
  if(typeof value==='string')return value.trim().slice(0,240)||undefined;
  if(!value||typeof value!=='object')return undefined;
  const record=value as Record<string,unknown>;
  for(const key of ['message','error','detail']){const nested=record[key];if(typeof nested==='string'&&nested.trim())return nested.trim().slice(0,240);}
  try{return JSON.stringify(value).slice(0,240)||undefined;}catch{return undefined;}
}

export async function verifyWaveSpeedWebhook(input:{rawBody:string;webhookId:string|null;timestamp:string|null;signature:string|null;secret:string;now?:Date;maxAgeSeconds?:number}):Promise<boolean>{
  return verifyProviderWebhookHmac({...input,scheme:'v3'});
}
function isHttpsUrl(value:unknown):value is string{if(typeof value!=='string')return false;try{return new URL(value).protocol==='https:';}catch{return false;}}

export function configuredWaveSpeedClient():WaveSpeedClient|null{
  const key=Deno.env.get('WAVESPEED_API_KEY');if(!key||!envBoolean('KIVELLE_WAVESPEED_ENABLED'))return null;
  const base=Deno.env.get('SUPABASE_URL');const webhook=base?`${base}/functions/v1/together-wavespeed-webhook`:undefined;
  return new WaveSpeedClient(key,webhook);
}

export function envBoolean(name:string,defaultValue=false):boolean{const value=Deno.env.get(name);if(value===undefined)return defaultValue;return['1','true','yes','on'].includes(value.toLowerCase());}
export function envNumber(name:string,defaultValue:number):number{const value=Number(Deno.env.get(name));return Number.isFinite(value)?value:defaultValue;}
