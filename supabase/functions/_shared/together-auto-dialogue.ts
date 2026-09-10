import {requireScopedAiConsent} from './kivelle-ai-consent.ts';
import { buildAutoDialoguePrompt, deterministicAutoDialogue, inferAutoDialogueIntents, parseAutoDialogueSuggestion, buildResponsesRequestBody, executeResponsesHttp, extractResponsesText, normalizeResponsesUsage, shouldUseSpicyAutoDialogue, type AutoDialogueInput, type AutoDialogueIntent, type AutoDialoguePreference, type NormalizedAiUsage } from '../../../packages/together-domain/src/index.ts';
import { recordAiUsage, type AiUsageScope } from './kivelle-ai-usage.ts';

export type AutoDialogueSource='openai'|'xai'|'gemini'|'deterministic';
export type AutoDialogueResult={text:string;source:AutoDialogueSource;intent:AutoDialogueIntent;preference:AutoDialoguePreference};

const openAIKey=()=>Deno.env.get('OPENAI_API_KEY');
const xaiKey=()=>Deno.env.get('XAI_API_KEY');
const geminiKey=()=>Deno.env.get('GEMINI_API_KEY');
const configuredModel=(name:string,fallback:string)=>Deno.env.get(name)?.trim()||fallback;

export class ConfiguredAutoDialogueProvider{
  constructor(private readonly fetchImpl:typeof fetch=fetch){}

  async generate(input:AutoDialogueInput,options?:{usageScope?:AiUsageScope}):Promise<AutoDialogueResult>{
    await requireScopedAiConsent(options?.usageScope);
    const fallback=deterministicAutoDialogue(input),prompt=buildAutoDialoguePrompt(input),intent=inferAutoDialogueIntents(input)[0]??'curious',preference=input.preference??'natural';
    if(shouldUseSpicyAutoDialogue(input)){
      const xai=xaiSpicyRouteEnabled()?xaiKey():undefined;
      if(xai){
        const model=configuredModel('KIVELLE_XAI_SUGGESTION_MODEL',configuredModel('KIVELLE_XAI_DIALOGUE_MODEL','grok-4.3'));
        const result=await this.generateResponses('xai',xai,model,prompt,fallback,input,options?.usageScope);
        if(result)return{...result,intent,preference};
      }
      await recordAiUsage(options?.usageScope,{provider:'deterministic',model:'kivelle-auto-dialogue-v2',operation:'auto_dialogue_deterministic',latencyMs:0,success:true,metadata:{providerFallback:Boolean(xai),preferredProvider:'xai',reason:xai?'xai_failed':'xai_unavailable'}});
      return{text:fallback,source:'deterministic',intent,preference};
    }
    const openAI=openAIKey();
    if(openAI){
      const model=configuredModel('KIVELLE_SUGGESTION_MODEL',configuredModel('KIVELLE_OPENAI_DIALOGUE_MODEL',configuredModel('KIVELLE_DIALOGUE_MODEL','gpt-5.6-luna'))),result=await this.generateResponses('openai',openAI,model,prompt,fallback,input,options?.usageScope);
      if(result)return{...result,intent,preference};
    }
    const gemini=geminiKey();
    if(gemini){
      const model=configuredModel('TOGETHER_SUGGESTION_MODEL',configuredModel('GEMINI_EXPLANATION_MODEL','gemini-2.5-flash')),started=Date.now();let response:Response|undefined;
      try{
        response=await withTimeout(this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gemini)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.68,maxOutputTokens:260,responseMimeType:'application/json'}})}),6500);
        if(!response.ok){await recordAiUsage(options?.usageScope,{provider:'gemini',model,operation:'auto_dialogue_gemini',latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});}
        else{
          const payload=await response.json(),usage=geminiUsage(payload.usageMetadata),raw=payload.candidates?.[0]?.content?.parts?.map((part:Record<string,unknown>)=>part.text).filter(Boolean).join('');
          await recordAiUsage(options?.usageScope,{provider:'gemini',model,operation:'auto_dialogue_gemini',usage,latencyMs:Date.now()-started,success:true,httpStatus:response.status,cacheHit:usage.cachedInputTokens>0,metadata:{fallbackFrom:openAI?'openai':undefined}});
          if(raw)return{text:parseProviderText(raw,fallback,input),source:'gemini',intent,preference};
        }
      }catch(error){
        if(!response)await recordAiUsage(options?.usageScope,{provider:'gemini',model,operation:'auto_dialogue_gemini',latencyMs:Date.now()-started,success:false,errorCode:error instanceof Error&&error.message==='suggestion_timeout'?'TIMEOUT':'NETWORK_ERROR'});
        console.warn('Auto dialogue Gemini fallback',error instanceof Error?error.message:'unknown_error');
      }
    }
    await recordAiUsage(options?.usageScope,{provider:'deterministic',model:'kivelle-auto-dialogue-v2',operation:'auto_dialogue_deterministic',latencyMs:0,success:true,metadata:{providerFallback:Boolean(openAI||gemini)}});
    return{text:fallback,source:'deterministic',intent,preference};
  }

  private async generateResponses(provider:'openai'|'xai',key:string,model:string,prompt:string,fallback:string,input:AutoDialogueInput,usageScope?:AiUsageScope):Promise<{text:string;source:'openai'|'xai'}|null>{
    const started=Date.now();let response:Response|undefined;
    try{
      response=await withTimeout(executeResponsesHttp(this.fetchImpl,provider,key,buildResponsesRequestBody({model,prompt,maxOutputTokens:300,stream:false})),provider==='xai'?8000:6500);
      if(!response.ok){await recordAiUsage(usageScope,{provider,model,operation:`auto_dialogue_${provider}`,latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});return null;}
      const payload=await response.json(),usage=normalizeResponsesUsage(provider,payload.usage),raw=extractResponsesText(payload),text=parseProviderText(raw,fallback,input);
      await recordAiUsage(usageScope,{provider,model,operation:`auto_dialogue_${provider}`,usage,latencyMs:Date.now()-started,success:Boolean(raw),httpStatus:response.status,cacheHit:usage.cachedInputTokens>0,...(!raw?{errorCode:'EMPTY_RESPONSE'}:{})});
      return raw?{text,source:provider}:null;
    }catch(error){
      if(!response)await recordAiUsage(usageScope,{provider,model,operation:`auto_dialogue_${provider}`,latencyMs:Date.now()-started,success:false,errorCode:error instanceof Error&&error.message==='suggestion_timeout'?'TIMEOUT':'NETWORK_ERROR'});
      console.warn(`Auto dialogue ${provider} fallback`,error instanceof Error?error.message:'unknown_error');
      return null;
    }
  }
}

function xaiSpicyRouteEnabled():boolean{return['KIVELLE_XAI_ENABLED','KIVELLE_XAI_EXPLICIT_ENABLED'].every((name)=>Deno.env.get(name)?.trim().toLowerCase()==='true')&&Deno.env.get('KIVELLE_PRIVATE_ADULT_TEXT_MODE')?.trim().toLowerCase()==='on';}

function parseProviderText(raw:unknown,fallback:string,input:AutoDialogueInput):string{
  if(typeof raw!=='string')return fallback;
  const trimmed=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  try{return parseAutoDialogueSuggestion(JSON.parse(trimmed),fallback,input);}catch{return parseAutoDialogueSuggestion(trimmed,fallback,input);}
}

function geminiUsage(value:unknown):NormalizedAiUsage{
  const usage=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const inputTokens=Number(usage.promptTokenCount??0),cachedInputTokens=Number(usage.cachedContentTokenCount??0),outputTokens=Number(usage.candidatesTokenCount??0),reasoningTokens=Number(usage.thoughtsTokenCount??0);
  return{inputTokens,cachedInputTokens,outputTokens,reasoningTokens,totalTokens:Number(usage.totalTokenCount??inputTokens+outputTokens)};
}

async function withTimeout<T>(promise:Promise<T>,milliseconds:number):Promise<T>{
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('suggestion_timeout')),milliseconds);})]);}
  finally{if(timeout)clearTimeout(timeout);}
}
