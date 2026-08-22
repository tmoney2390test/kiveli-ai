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

export async function runKivelleDirector(input:{context:DirectorContext;baseBrief:ResponseBrief;policy:DirectorPolicy;interactionQuality:PromptInteractionQuality;pendingMilestone?:boolean;activeConflict?:boolean;usageScope?:AiUsageScope}):Promise<DirectorResult>{
  const storyIsResponseRelevant=input.baseBrief.actionCandidate==='story'||Boolean(input.baseBrief.callbackCandidate&&input.context.activeStory&&input.baseBrief.callbackCandidate===String(input.context.activeStory.title??''));
  if(!shouldUseDirector(input.policy,input.interactionQuality,{pendingMilestone:input.pendingMilestone,activeConflict:input.activeConflict,activeStory:storyIsResponseRelevant}))return{brief:input.baseBrief,directorUsed:false,provider:'deterministic'};
  const key=openAIKey();if(key){try{const brief=await directOpenAI(input.context,input.baseBrief,key,input.usageScope);return{brief,directorUsed:true,provider:'openai'};}catch(error){console.warn('Kivelle Director OpenAI fallback',error instanceof Error?error.message:'unknown_error');}}
  const google=geminiKey();if(google){try{const brief=await directGemini(input.context,input.baseBrief,google,input.usageScope);return{brief,directorUsed:true,provider:'gemini'};}catch(error){console.warn('Kivelle Director Gemini fallback',error instanceof Error?error.message:'unknown_error');}}
  return{brief:input.baseBrief,directorUsed:false,provider:'deterministic'};
}

async function directOpenAI(context:DirectorContext,base:ResponseBrief,key:string,scope?:AiUsageScope):Promise<ResponseBrief>{
  const started=Date.now(),modelName=model('KIVELLE_DIRECTOR_MODEL','gpt-5-mini');let response:Response|undefined;
  try{response=await Promise.race([
    fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelName,input:directorPrompt(context,base),max_output_tokens:450,...(Deno.env.get('KIVELLE_DIRECTOR_REASONING_EFFORT')?{reasoning:{effort:Deno.env.get('KIVELLE_DIRECTOR_REASONING_EFFORT')}}:{})})}),
    timeout(3000),
  ]);
  if(!response.ok){await recordAiUsage(scope,{provider:'openai',model:modelName,operation:'director_openai',latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});throw new Error(`director_openai_${response.status}`);}const data=await response.json(),usage=normalizeResponsesUsage('openai',data.usage);await recordAiUsage(scope,{provider:'openai',model:modelName,operation:'director_openai',usage,latencyMs:Date.now()-started,success:true,httpStatus:response.status});const raw=String(data.output_text??'').trim();return validateBrief(parseJson(raw),base);
  }catch(error){if(!response)await recordAiUsage(scope,{provider:'openai',model:modelName,operation:'director_openai',latencyMs:Date.now()-started,success:false,errorCode:'NETWORK_OR_TIMEOUT'});throw error;}
}
async function directGemini(context:DirectorContext,base:ResponseBrief,key:string,scope?:AiUsageScope):Promise<ResponseBrief>{
  const modelName=model('KIVELLE_DIRECTOR_GEMINI_MODEL','gemini-2.5-flash'),started=Date.now();let response:Response;
  try{response=await Promise.race([
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:directorPrompt(context,base)}]}],generationConfig:{temperature:.15,maxOutputTokens:450,responseMimeType:'application/json'}})}),
    timeout(3000),
  ]);}catch(error){await recordAiUsage(scope,{provider:'gemini',model:modelName,operation:'director_gemini',latencyMs:Date.now()-started,success:false,errorCode:'NETWORK_OR_TIMEOUT'});throw error;}
  if(!response.ok){await recordAiUsage(scope,{provider:'gemini',model:modelName,operation:'director_gemini',latencyMs:Date.now()-started,success:false,httpStatus:response.status,errorCode:`HTTP_${response.status}`});throw new Error(`director_gemini_${response.status}`);}const data=await response.json(),usageMetadata=data.usageMetadata??{},usage={inputTokens:Number(usageMetadata.promptTokenCount??0),cachedInputTokens:Number(usageMetadata.cachedContentTokenCount??0),outputTokens:Number(usageMetadata.candidatesTokenCount??0),reasoningTokens:Number(usageMetadata.thoughtsTokenCount??0),totalTokens:Number(usageMetadata.totalTokenCount??0)};await recordAiUsage(scope,{provider:'gemini',model:modelName,operation:'director_gemini',usage,latencyMs:Date.now()-started,success:true,httpStatus:response.status});const raw=data.candidates?.[0]?.content?.parts?.map((part:Record<string,unknown>)=>part.text).filter(Boolean).join('')??'';return validateBrief(parseJson(String(raw)),base);
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
function parseJson(raw:string):unknown{try{return JSON.parse(raw);}catch{const match=raw.match(/\{[\s\S]*\}/);if(!match)return{};try{return JSON.parse(match[0]);}catch{return{};}}}
function text(value:unknown,max:number):string|null{if(typeof value!=='string'||!value.trim())return null;return value.trim().slice(0,max);}
function timeout(ms:number):Promise<Response>{return new Promise((_,reject)=>setTimeout(()=>reject(new Error('director_timeout')),ms));}
