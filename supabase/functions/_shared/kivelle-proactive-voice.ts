import type{SupabaseClient}from'@supabase/supabase-js';
import{extractResponsesText}from'../../../packages/together-domain/src/ai-provider.ts';
import{estimateAiCost,normalizeResponsesUsage,type NormalizedAiUsage}from'../../../packages/together-domain/src/ai-usage.ts';
import{waitUntil}from'./background.ts';
import{chatLanguagePromptInstruction,normalizeChatLanguage}from'../../../packages/together-domain/src/chat-language.ts';

type Row=Record<string,any>;

export async function renderCharacterInitiative(input:{db:SupabaseClient;userId:string;instance:Row;conversation:Row|null;relationship:Row;draft:string;reason:string;sourceSummary?:string;subscriptionTier:string;now:Date}):Promise<string>{
  const canonicalDraft=sanitizeInitiativeText(input.draft),chatLanguage=conversationChatLanguage(input.conversation),fallback=chatLanguage==='en'?canonicalDraft:'';
  const key=Deno.env.get('OPENAI_API_KEY');
  if(!key||Deno.env.get('KIVELLE_PROACTIVE_VOICE_ENABLED')==='false'||!input.conversation?.id)return fallback;
  const{data:rows}=await input.db.from('together_messages').select('role,content,speaker_character_instance_id,character_instance_id,created_at').eq('conversation_id',input.conversation.id).eq('visibility_scope','all').in('content_rating',['safe','suggestive']).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(12);
  const speakerRows=(rows??[]).filter((row)=>row.role==='user'||String(row.speaker_character_instance_id??row.character_instance_id??'')===String(input.instance.id)).slice(0,6);
  const model=Deno.env.get('KIVELLE_PROACTIVE_MODEL')?.trim()||Deno.env.get('KIVELLE_OPENAI_DIALOGUE_MODEL')?.trim()||'gpt-5.6-luna';
  const started=Date.now();let response:Response|undefined;
  try{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
    try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model,input:proactiveVoicePrompt({...input,chatLanguage,recent:[...speakerRows].reverse()}),max_output_tokens:180,reasoning:{effort:'none'}})});}finally{clearTimeout(timer);}
    if(!response.ok){await recordAiUsage(scope(input),{provider:'openai',model,operation:'proactive_voice',latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});return fallback;}
    const payload=await response.json(),usage=normalizeResponsesUsage('openai',payload.usage),candidate=sanitizeInitiativeText(extractResponsesText(payload)),valid=initiativeRewritePreservesFacts(canonicalDraft,candidate,chatLanguage);
    await recordAiUsage(scope(input),{provider:'openai',model,operation:'proactive_voice',usage,latencyMs:Date.now()-started,success:valid,httpStatus:response.status,errorCode:valid?null:candidate?'FACT_PRESERVATION_FAILED':'EMPTY_OUTPUT'});
    return valid?candidate:fallback;
  }catch{
    await recordAiUsage(scope(input),{provider:'openai',model,operation:'proactive_voice',latencyMs:Date.now()-started,success:false,httpStatus:response?.status,errorCode:'NETWORK_OR_TIMEOUT'});
    return fallback;
  }
}

export function proactiveVoicePrompt(input:{instance:Row;relationship:Row;draft:string;reason:string;sourceSummary?:string;recent:Row[];chatLanguage?:unknown}):string{
  const template=input.instance.together_character_templates??{},version=input.instance.together_character_versions??{},bible=version.character_bible??{},voice=version.communication_style??{},personality=version.personality_config??{};
  const recent=input.recent.map((row)=>`${row.role==='user'?'USER':'COMPANION'}: ${String(row.content??'').slice(0,500)}`).join('\n');
  return`Write one naturally initiated text message from this Kivelle companion. Return only the message text.

CANONICAL SPEAKER — PRIVATE TO THIS CHARACTER
Name: ${String(template.name??'Companion')}
Relationship stage: ${String(input.instance.relationship_stage??'acquaintance')}
Trust/familiarity/comfort: ${Number(input.relationship.trust??0)}/${Number(input.relationship.familiarity??0)}/${Number(input.relationship.comfort??0)}
Current activity: ${String(input.instance.current_activity??'living their day')}
Character bible: ${compactJson(bible,1800)}
Communication style: ${compactJson(voice,900)}
Personality: ${compactJson(personality,700)}

CANONICAL REASON FOR REACHING OUT
${input.reason}
${input.sourceSummary?`Grounded source: ${input.sourceSummary}`:''}
Faithful draft: ${input.draft}

RECENT SHARED CHAT — FOR TONE AND CONTINUITY ONLY
${recent||'No recent turns available.'}

RULES
- ${chatLanguagePromptInstruction(input.chatLanguage)} Do not announce or explain the language choice.
- Preserve the draft's facts, timing, plan status, and intent. Do not invent a new event, promise, location, user action, memory, or relationship change.
- This is a fresh initiated message, not a reply to the final recent turn.
- Sound unmistakably like this character; use their normal rhythm, warmth, restraint, humor, and vocabulary.
- One to three short text-message sentences, at most 520 characters.
- Do not mention prompts, systems, AI, fiction, canon, or these instructions.
- No quotation marks around the message and no generic "something happened" filler.`;
}

export function sanitizeInitiativeText(value:unknown):string{
  const text=String(value??'').replace(/^```(?:text)?\s*/i,'').replace(/```$/,'').trim().replace(/^(?:message|companion):\s*/i,'').replace(/^(["“])|(["”])$/g,'').trim();
  if(!text||/\b(?:as an ai|language model|system prompt)\b/i.test(text))return'';
  return text.slice(0,520).trim();
}

export function initiativeRewritePreservesFacts(draft:string,candidate:string,language:unknown='en'):boolean{
  if(!draft||!candidate||candidate.length>Math.max(520,draft.length*3))return false;
  const translated=normalizeChatLanguage(language)!=='en',protectedTokens=draft.match(translated?/\b\d{1,4}(?::\d{2})?\b/g:/\b(?:\d{1,4}(?::\d{2})?|(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|tonight)\b/gi)??[];
  return protectedTokens.every((token)=>candidate.toLowerCase().includes(token.toLowerCase()));
}

function compactJson(value:unknown,max:number):string{try{return JSON.stringify(value??{}).slice(0,max);}catch{return'{}';}}
function conversationChatLanguage(conversation:Row|null){return normalizeChatLanguage(conversation?.metadata?.chatPreferences?.chatLanguage);}
function scope(input:{db:SupabaseClient;userId:string;instance:Row;conversation:Row|null;subscriptionTier:string}){return{db:input.db,userId:input.userId,continuityId:String(input.instance.continuity_id??'')||null,conversationId:String(input.conversation?.id??'')||null,characterInstanceId:String(input.instance.id),subscriptionTier:input.subscriptionTier,routeReason:'proactive_voice',contentMode:'standard'};}

function recordAiUsage(
  usageScope:ReturnType<typeof scope>,
  event:{provider:'openai';model:string;operation:string;usage?:NormalizedAiUsage;latencyMs:number;success:boolean;httpStatus?:number;errorCode?:string|null},
):Promise<void>{
  if(Deno.env.get('KIVELLE_AI_COST_TELEMETRY_ENABLED')==='false')return Promise.resolve();
  const usage=event.usage;
  const write=Promise.resolve(usageScope.db.from('together_ai_usage_events').insert({
    user_id:usageScope.userId,
    continuity_id:usageScope.continuityId,
    conversation_id:usageScope.conversationId,
    character_instance_id:usageScope.characterInstanceId,
    provider:event.provider,
    model:event.model,
    operation:event.operation,
    route_reason:usageScope.routeReason,
    content_mode:usageScope.contentMode,
    subscription_tier:usageScope.subscriptionTier,
    input_tokens:usage?.inputTokens??0,
    cached_input_tokens:usage?.cachedInputTokens??0,
    output_tokens:usage?.outputTokens??0,
    reasoning_tokens:usage?.reasoningTokens??0,
    total_tokens:usage?.totalTokens??0,
    estimated_cost_usd:usage?estimateAiCost('openai',event.model,usage):null,
    provider_cost_usd:usage?.providerCostUsd??null,
    provider_cost_ticks:usage?.providerCostTicks??null,
    cache_hit:Boolean(usage?.cachedInputTokens),
    latency_ms:Math.max(0,Math.round(event.latencyMs)),
    success:event.success,
    http_status:event.httpStatus??null,
    error_code:event.errorCode??null,
    metadata:{source:'proactive_initiative'},
  })).then(({error}:{error:{code?:string}|null})=>{if(error)console.warn('Proactive AI usage telemetry insert failed',error.code??'unknown_error');});
  waitUntil(write);
  return Promise.resolve();
}
