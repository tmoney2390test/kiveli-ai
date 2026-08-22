import { buildAutoDialoguePrompt, deterministicAutoDialogue, inferAutoDialogueIntents, parseAutoDialogueSuggestion, buildResponsesRequestBody, executeResponsesHttp, extractResponsesText, normalizeResponsesUsage, type AutoDialogueInput, type AutoDialogueIntent, type AutoDialoguePreference, type NormalizedAiUsage } from '../../../packages/together-domain/src/index.ts';
import { recordAiUsage, type AiUsageScope } from './kivelle-ai-usage.ts';

export type AutoDialogueSource='openai'|'gemini'|'deterministic';
export type AutoDialogueResult={text:string;source:AutoDialogueSource;intent:AutoDialogueIntent;preference:AutoDialoguePreference};

const openAIKey=()=>Deno.env.get('OPENAI_API_KEY');
const geminiKey=()=>Deno.env.get('GEMINI_API_KEY');
const configuredModel=(name:string,fallback:string)=>Deno.env.get(name)?.trim()||fallback;

export class ConfiguredAutoDialogueProvider{
  async generate(input:AutoDialogueInput,options?:{usageScope?:AiUsageScope}):Promise<AutoDialogueResult>{
    const fallback=deterministicAutoDialogue(input),prompt=buildAutoDialoguePrompt(input),intent=inferAutoDialogueIntents(input)[0]??'curious',preference=input.preference??'natural';
    const openAI=openAIKey();
    if(openAI){
      const model=configuredModel('KIVELLE_SUGGESTION_MODEL',configuredModel('KIVELLE_OPENAI_DIALOGUE_MODEL',configuredModel('KIVELLE_DIALOGUE_MODEL','gpt-5.6-luna'))),started=Date.now();let response:Response|undefined;
      try{
        response=await withTimeout(executeResponsesHttp(fetch,'openai',openAI,buildResponsesRequestBody({model,prompt,maxOutputTokens:220,stream:false})),5500);
        if(!response.ok){await recordAiUsage(options?.usageScope,{provider:'openai',model,operation:'auto_dialogue_openai',latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});}
        else{
          const payload=await response.json(),usage=normalizeResponsesUsage('openai',payload.usage),raw=extractResponsesText(payload),text=parseProviderText(raw,fallback,input);
          await recordAiUsage(options?.usageScope,{provider:'openai',model,operation:'auto_dialogue_openai',usage,latencyMs:Date.now()-started,success:true,httpStatus:response.status,cacheHit:usage.cachedInputTokens>0});
          if(raw)return{text,source:'openai',intent,preference};
        }
      }catch(error){
        if(!response)await recordAiUsage(options?.usageScope,{provider:'openai',model,operation:'auto_dialogue_openai',latencyMs:Date.now()-started,success:false,errorCode:error instanceof Error&&error.message==='suggestion_timeout'?'TIMEOUT':'NETWORK_ERROR'});
        console.warn('Auto dialogue OpenAI fallback',error instanceof Error?error.message:'unknown_error');
      }
    }
    const gemini=geminiKey();
    if(gemini){
      const model=configuredModel('TOGETHER_SUGGESTION_MODEL',configuredModel('GEMINI_EXPLANATION_MODEL','gemini-2.5-flash')),started=Date.now();let response:Response|undefined;
      try{
        response=await withTimeout(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(gemini)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.72,maxOutputTokens:220,responseMimeType:'application/json'}})}),5500);
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
    await recordAiUsage(options?.usageScope,{provider:'deterministic',model:'kivelle-auto-dialogue-v1',operation:'auto_dialogue_deterministic',latencyMs:0,success:true,metadata:{providerFallback:Boolean(openAI||gemini)}});
    return{text:fallback,source:'deterministic',intent,preference};
  }
}

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
