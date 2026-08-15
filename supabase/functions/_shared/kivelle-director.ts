import { shouldUseDirector, type DirectorPolicy, type PromptInteractionQuality, type ResponseBrief } from '../../../packages/together-domain/src/index.ts';

type DirectorContext={
  character?:Record<string,unknown>;
  persona?:Record<string,unknown>;
  relationshipStance?:Record<string,unknown>;
  characterGoals?:Record<string,unknown>;
  currentScene?:Record<string,unknown>;
  activeStory?:Record<string,unknown>|null;
  openThreads?:Array<Record<string,unknown>>;
  upcomingCommitments?:Array<Record<string,unknown>>;
  sharedHistory?:Array<Record<string,unknown>>;
  recent?:Array<{role:string;content:string}>;
  userMessage:string;
};
export type DirectorResult={brief:ResponseBrief;directorUsed:boolean;provider:'openai'|'gemini'|'deterministic'};

const openAIKey=()=>Deno.env.get('OPENAI_API_KEY');
const geminiKey=()=>Deno.env.get('GEMINI_API_KEY');
const model=(name:string,fallback:string)=>Deno.env.get(name)??fallback;

export async function runKivelleDirector(input:{context:DirectorContext;baseBrief:ResponseBrief;policy:DirectorPolicy;interactionQuality:PromptInteractionQuality;pendingMilestone?:boolean;activeConflict?:boolean}):Promise<DirectorResult>{
  if(!shouldUseDirector(input.policy,input.interactionQuality,{pendingMilestone:input.pendingMilestone,activeConflict:input.activeConflict,activeStory:Boolean(input.context.activeStory)}))return{brief:input.baseBrief,directorUsed:false,provider:'deterministic'};
  const key=openAIKey();if(key){try{const brief=await directOpenAI(input.context,input.baseBrief,key);return{brief,directorUsed:true,provider:'openai'};}catch(error){console.warn('Kivelle Director OpenAI fallback',error instanceof Error?error.message:'unknown_error');}}
  const google=geminiKey();if(google){try{const brief=await directGemini(input.context,input.baseBrief,google);return{brief,directorUsed:true,provider:'gemini'};}catch(error){console.warn('Kivelle Director Gemini fallback',error instanceof Error?error.message:'unknown_error');}}
  return{brief:input.baseBrief,directorUsed:false,provider:'deterministic'};
}

async function directOpenAI(context:DirectorContext,base:ResponseBrief,key:string):Promise<ResponseBrief>{
  const response=await Promise.race([
    fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:model('KIVELLE_DIRECTOR_MODEL','gpt-5-mini'),input:directorPrompt(context,base),max_output_tokens:450})}),
    timeout(3000),
  ]);
  if(!response.ok)throw new Error(`director_openai_${response.status}`);const data=await response.json();const raw=String(data.output_text??'').trim();return validateBrief(parseJson(raw),base);
}
async function directGemini(context:DirectorContext,base:ResponseBrief,key:string):Promise<ResponseBrief>{
  const modelName=model('KIVELLE_DIRECTOR_GEMINI_MODEL','gemini-2.5-flash');const response=await Promise.race([
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:directorPrompt(context,base)}]}],generationConfig:{temperature:.15,maxOutputTokens:450,responseMimeType:'application/json'}})}),
    timeout(3000),
  ]);
  if(!response.ok)throw new Error(`director_gemini_${response.status}`);const data=await response.json();const raw=data.candidates?.[0]?.content?.parts?.map((part:Record<string,unknown>)=>part.text).filter(Boolean).join('')??'';return validateBrief(parseJson(String(raw)),base);
}

function directorPrompt(context:DirectorContext,base:ResponseBrief):string{return `You are Kivelle Director. Return JSON only. You control expression strategy, never canonical reality. Do not add facts, events, memories, plans, locations, relationship changes, or future story outcomes.

Your job is to make the companion feel distinct, autonomous, non-repetitive, and emotionally proportional. It is acceptable to disagree, decline, redirect, tease, have another preference, or not ask a question. Never optimize for dependency, obedience, or retention.

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
{"mode":"casual|playful|supportive|vulnerable|conflicted|repair|practical|storytelling|affectionate","emotionalPosture":"short expression direction","initiative":"low|medium|high","callbackCandidate":"optional canonical callback already present above","selfDisclosure":"none|small|moderate","shouldAskQuestion":false,"actionCandidate":"none|plan|memory_followup|relationship|story","avoid":["short repetition warning"],"autonomy":"short autonomy direction"}

Rules: preserve the base brief when uncertain. Never require a question. Never tell the companion to agree. callbackCandidate must reference supplied context only. Avoid at most 4 items.`;}

function validateBrief(value:unknown,base:ResponseBrief):ResponseBrief{
  const row=value&&typeof value==='object'?value as Record<string,unknown>:{};const modes=new Set(['casual','playful','supportive','vulnerable','conflicted','repair','practical','storytelling','affectionate']);const initiatives=new Set(['low','medium','high']);const disclosures=new Set(['none','small','moderate']);const actions=new Set(['none','plan','memory_followup','relationship','story']);
  return{mode:modes.has(String(row.mode))?String(row.mode) as ResponseBrief['mode']:base.mode,emotionalPosture:text(row.emotionalPosture,220)??base.emotionalPosture,initiative:initiatives.has(String(row.initiative))?String(row.initiative) as ResponseBrief['initiative']:base.initiative,...(text(row.callbackCandidate,180)?{callbackCandidate:text(row.callbackCandidate,180)!}:base.callbackCandidate?{callbackCandidate:base.callbackCandidate}:{}),selfDisclosure:disclosures.has(String(row.selfDisclosure))?String(row.selfDisclosure) as ResponseBrief['selfDisclosure']:base.selfDisclosure,shouldAskQuestion:typeof row.shouldAskQuestion==='boolean'?row.shouldAskQuestion:base.shouldAskQuestion,actionCandidate:actions.has(String(row.actionCandidate))?String(row.actionCandidate) as ResponseBrief['actionCandidate']:base.actionCandidate,avoid:[...new Set([...base.avoid,...(Array.isArray(row.avoid)?row.avoid.map((item)=>text(item,160)).filter((item):item is string=>Boolean(item)):[])])].slice(0,4),autonomy:text(row.autonomy,220)??base.autonomy};
}
function parseJson(raw:string):unknown{try{return JSON.parse(raw);}catch{const match=raw.match(/\{[\s\S]*\}/);if(!match)return{};try{return JSON.parse(match[0]);}catch{return{};}}}
function text(value:unknown,max:number):string|null{if(typeof value!=='string'||!value.trim())return null;return value.trim().slice(0,max);}
function timeout(ms:number):Promise<Response>{return new Promise((_,reject)=>setTimeout(()=>reject(new Error('director_timeout')),ms));}
