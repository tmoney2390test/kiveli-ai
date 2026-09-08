import { chatSpeedEnabled } from './kivelle-chat-latency.ts';
import { extractResponsesText } from '../../../packages/together-domain/src/ai-provider.ts';
import { directorRequest } from './kivelle-director-request.ts';
import { shouldUseDirector, type DirectorPolicy, type PromptInteractionQuality, type ResponseBrief } from '../../../packages/together-domain/src/index.ts';
import { normalizeResponsesUsage } from '../../../packages/together-domain/src/ai-usage.ts';
import { recordAiUsage, type AiUsageScope } from './kivelle-ai-usage.ts';

type DirectorContext={
  character?:Record<string,unknown>;
  persona?:Record<string,unknown>;
  relationshipStance?:Record<string,unknown>;
  characterGoals?:Record<string,unknown>;
  currentScene?:Record<string,unknown>;
  activeStory?:Record<string,unknown>|null;
  openThreads?:Array<Record<string,unknown>>;
  upcomingCommitments?:Array<Record<string,unknown>>;
  commitments?:Array<Record<string,unknown>>;
  sharedHistory?:Array<Record<string,unknown>>;
  recent?:Array<{role:string;content:string}>;
  userMessage:string;
};
export type DirectorResult={brief:ResponseBrief;directorUsed:boolean;provider:'openai'|'gemini'|'deterministic'};

const openAIKey=()=>Deno.env.get('OPENAI_API_KEY');
const geminiKey=()=>Deno.env.get('GEMINI_API_KEY');
const model=(name:string,fallback:string)=>Deno.env.get(name)?.trim()||fallback;

const failures = new Map<string, { count: number; retryAt: number }>();

export async function runKivelleDirector(input:{context:DirectorContext;baseBrief:ResponseBrief;policy:DirectorPolicy;interactionQuality:PromptInteractionQuality;pendingMilestone?:boolean;activeConflict?:boolean;reasoningPreference?:string;usageScope?:AiUsageScope}):Promise<DirectorResult>{
  const fallback:DirectorResult={brief:input.baseBrief,directorUsed:false,provider:'deterministic'};
  if(input.reasoningPreference==='none'&&chatSpeedEnabled('DIRECTOR_BYPASS'))return fallback;
  if(input.baseBrief.mode==='danger')return fallback;
  const storyIsResponseRelevant=input.baseBrief.actionCandidate==='story'||Boolean(input.baseBrief.callbackCandidate&&input.context.activeStory&&input.baseBrief.callbackCandidate===String(input.context.activeStory.title??''));
  if(!shouldUseDirector(input.policy,input.interactionQuality,{pendingMilestone:input.pendingMilestone,activeConflict:input.activeConflict,activeStory:storyIsResponseRelevant}))return fallback;
  const deadline=Date.now()+3000;
  for(const provider of ['openai','gemini'] as const){
    const key=provider==='openai'?openAIKey():geminiKey();
    const remaining=deadline-Date.now();
    if(!key||remaining<100||(failures.get(provider)?.retryAt??0)>Date.now())continue;
    try{
      const brief=await (provider==='openai'?directOpenAI:directGemini)(input.context,input.baseBrief,key,input.usageScope,remaining);
      failures.delete(provider);
      return{brief,directorUsed:true,provider};
    }catch{
      const count=(failures.get(provider)?.count??0)+1;
      failures.set(provider,{count,retryAt:count>=3?Date.now()+60_000:0});
    }
  }
  return fallback;
}

async function directOpenAI(context:DirectorContext,base:ResponseBrief,key:string,scope:AiUsageScope|undefined,timeoutMs:number):Promise<ResponseBrief>{
  const started=Date.now(),modelName=model('KIVELLE_DIRECTOR_MODEL','gpt-5-mini');
  try{
    const {response,data}=await directorRequest('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:modelName,input:directorPrompt(context,base),max_output_tokens:450,...(Deno.env.get('KIVELLE_DIRECTOR_REASONING_EFFORT')?{reasoning:{effort:Deno.env.get('KIVELLE_DIRECTOR_REASONING_EFFORT')}}:{})}),
    },timeoutMs);
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const raw=extractResponsesText(data);
    if(!raw)throw new Error('EMPTY_DIRECTOR_RESPONSE');
    const brief=validateBrief(parseJson(raw),base);
    await recordAiUsage(scope,{provider:'openai',model:modelName,operation:'director_openai',usage:normalizeResponsesUsage('openai',data.usage),latencyMs:Date.now()-started,success:true,httpStatus:response.status});
    return brief;
  }catch(error){
    await recordAiUsage(scope,{provider:'openai',model:modelName,operation:'director_openai',latencyMs:Date.now()-started,success:false,errorCode:error instanceof Error&&error.message.startsWith('HTTP_')?error.message:'NETWORK_OR_TIMEOUT'});
    throw error;
  }
}
async function directGemini(context:DirectorContext,base:ResponseBrief,key:string,scope:AiUsageScope|undefined,timeoutMs:number):Promise<ResponseBrief>{
  const modelName=model('KIVELLE_DIRECTOR_GEMINI_MODEL','gemini-2.5-flash'),started=Date.now();
  try{
    const {response,data}=await directorRequest(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:directorPrompt(context,base)}]}],generationConfig:{temperature:.15,maxOutputTokens:450,responseMimeType:'application/json'}}),
    },timeoutMs);
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    const usageMetadata=data.usageMetadata??{},usage={inputTokens:Number(usageMetadata.promptTokenCount??0),cachedInputTokens:Number(usageMetadata.cachedContentTokenCount??0),outputTokens:Number(usageMetadata.candidatesTokenCount??0),reasoningTokens:Number(usageMetadata.thoughtsTokenCount??0),totalTokens:Number(usageMetadata.totalTokenCount??0)};
    const raw=data.candidates?.[0]?.content?.parts?.map((part:Record<string,unknown>)=>part.text).filter(Boolean).join('')??'';
    if(!raw)throw new Error('EMPTY_DIRECTOR_RESPONSE');
    const brief=validateBrief(parseJson(String(raw)),base);
    await recordAiUsage(scope,{provider:'gemini',model:modelName,operation:'director_gemini',usage,latencyMs:Date.now()-started,success:true,httpStatus:response.status});
    return brief;
  }catch(error){
    await recordAiUsage(scope,{provider:'gemini',model:modelName,operation:'director_gemini',latencyMs:Date.now()-started,success:false,errorCode:error instanceof Error&&error.message.startsWith('HTTP_')?error.message:'NETWORK_OR_TIMEOUT'});
    throw error;
  }
}

function directorPrompt(context:DirectorContext,base:ResponseBrief):string{return `You are Kivelle Director. Return JSON only. You control expression strategy, never canonical reality. Do not add facts, events, memories, plans, locations, relationship changes, or future story outcomes.

Your job is to make the companion feel distinct, autonomous, curious, reciprocal, non-repetitive, and emotionally proportional. It is acceptable to disagree, decline, redirect, tease, have another preference, or leave space without a question. Never optimize for dependency, obedience, or retention.

Continuity discipline: canonical commitments, open threads, active stories, and shared history below are reference material, not required subject matter. Do not surface one merely to prove memory. Preserve callbackCandidate from the deterministic base brief as the gate: if the base brief has no callbackCandidate, return no callbackCandidate. Do not switch to storytelling merely because an ACTIVE STORY exists. If a plan/story/thread appeared in recent assistant messages, keep it in the background unless the USER MESSAGE clearly reopens it.

CHARACTER
${JSON.stringify({name:context.character?.name,occupation:context.character?.occupation,personality:context.character?.personality_config,communication:context.character?.communication_style,bible:context.character?.character_bible})}

RELATIONSHIP STANCE
${JSON.stringify(context.relationshipStance??{})}

CURRENT SELF / GOALS
${JSON.stringify(context.characterGoals??{})}

CURRENT SCENE
${JSON.stringify(context.currentScene??{})}

ACTIVE STORY
${JSON.stringify(context.activeStory??null)}

CANONICAL COMMITMENTS
${JSON.stringify((context.commitments??[]).slice(0,4))}

UPCOMING
${JSON.stringify((context.upcomingCommitments??[]).slice(0,3))}

OPEN THREADS
${JSON.stringify((context.openThreads??[]).slice(0,3))}

RECENT SHARED HISTORY
${JSON.stringify((context.sharedHistory??[]).slice(0,4))}

RECENT ASSISTANT MESSAGES
${JSON.stringify((context.recent??[]).filter((turn)=>turn.role==='assistant').slice(-6).map((turn)=>turn.content))}

USER MESSAGE
${context.userMessage}

DETERMINISTIC BASE BRIEF
${JSON.stringify(base)}

Return exactly this shape:
{"mode":"casual|playful|supportive|vulnerable|conflicted|repair|practical|storytelling|affectionate","emotionalPosture":"short expression direction","initiative":"low|medium|high","callbackCandidate":"optional canonical callback already present in the base brief","selfDisclosure":"none|small|moderate","handoff":{"mode":"none|specific_question|playful_prompt|self_disclosure_return|earned_followup","source":"none|current_message|open_thread|scene|relationship","target":"optional concrete subject","openThreadId":"optional authorized thread id","reciprocityDebt":0},"actionCandidate":"none|plan|memory_followup|relationship|story","avoid":["short repetition warning"],"autonomy":"short autonomy direction"}

Rules: preserve the base brief when uncertain. Respect the deterministic handoff gate. You may refine an authorized current-message handoff or use self-disclosure instead of a question, but may not invent a handoff when the base mode is none. Preserve an earned_followup's source, target, and openThreadId exactly. Prefer one concrete, character-specific question over generic or stacked questions. Never tell the companion to agree. callbackCandidate may refine an existing base callback but may not introduce a new one. Avoid at most 4 items.`;}

function validateBrief(value:unknown,base:ResponseBrief):ResponseBrief{
  const row=value&&typeof value==='object'?value as Record<string,unknown>:{};const modes=new Set(['casual','playful','supportive','vulnerable','conflicted','repair','practical','storytelling','affectionate']);const initiatives=new Set(['low','medium','high']);const disclosures=new Set(['none','small','moderate']);const actions=new Set(['none','plan','memory_followup','relationship','story']);
  const directedCallback=base.callbackCandidate?text(row.callbackCandidate,180):null;
  const handoff=validateDirectedHandoff(row.handoff,base.handoff);
  const shouldAskQuestion=handoff.mode==='specific_question'||handoff.mode==='earned_followup';
  return{mode:modes.has(String(row.mode))?String(row.mode) as ResponseBrief['mode']:base.mode,emotionalPosture:text(row.emotionalPosture,220)??base.emotionalPosture,initiative:initiatives.has(String(row.initiative))?String(row.initiative) as ResponseBrief['initiative']:base.initiative,...(base.callbackCandidate?{callbackCandidate:directedCallback??base.callbackCandidate}:{}),selfDisclosure:disclosures.has(String(row.selfDisclosure))?String(row.selfDisclosure) as ResponseBrief['selfDisclosure']:base.selfDisclosure,shouldAskQuestion,handoff,actionCandidate:actions.has(String(row.actionCandidate))?String(row.actionCandidate) as ResponseBrief['actionCandidate']:base.actionCandidate,avoid:[...new Set([...base.avoid,...(Array.isArray(row.avoid)?row.avoid.map((item)=>text(item,160)).filter((item):item is string=>Boolean(item)):[])])].slice(0,4),autonomy:text(row.autonomy,220)??base.autonomy};
}
function validateDirectedHandoff(value:unknown,base:ResponseBrief['handoff']):ResponseBrief['handoff']{
  if(base.mode==='none')return base;
  if(base.mode==='earned_followup')return base;
  const row=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const modes=new Set(['specific_question','playful_prompt','self_disclosure_return']);
  const mode=modes.has(String(row.mode))?String(row.mode) as ResponseBrief['handoff']['mode']:base.mode;
  const target=text(row.target,180)??base.target;
  return{mode,source:base.source,...(target?{target}:{}),reciprocityDebt:base.reciprocityDebt};
}
function parseJson(raw:string):unknown{try{return JSON.parse(raw);}catch{const match=raw.match(/\{[\s\S]*\}/);if(!match)throw new Error('INVALID_DIRECTOR_RESPONSE');return JSON.parse(match[0]);}}
function text(value:unknown,max:number):string|null{if(typeof value!=='string'||!value.trim())return null;return value.trim().slice(0,max);}
