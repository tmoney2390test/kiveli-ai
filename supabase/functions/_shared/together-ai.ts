import { AppError } from './types.ts';
import { extractMemories, extractOpenThread, normalizeContinuityKey, threadAnswered, type MemoryCandidate, type OpenThreadCandidate } from './together.ts';
import { buildCompanionPrompt } from './kivelle-intelligence.ts';
import type { KivelleConversationContext } from './kivelle-conversation-context.ts';

export type DialogueContext = KivelleConversationContext & { contentMode?:string };
export interface DialogueProvider { generate(context: DialogueContext): Promise<string>; stream(context: DialogueContext): AsyncIterable<string>; }
export interface EmbeddingProvider { embed(text: string): Promise<number[] | null>; }
export interface ModerationProvider { check(text: string): Promise<{ allowed: boolean; categories: string[] }>; }
export type ConversationActionCandidate = { type:'plan_create'|'plan_cancel'|'plan_reschedule'|'date'; confidence:number; payload:Record<string,unknown> };
export type ConversationAnalysisInput = { userMessage: string; assistantMessage: string; existingThreads: Array<Record<string, unknown>>; context?:DialogueContext };
export type ConversationAnalysisProposal = { relationshipChanges: Record<string, number>; memoryCandidates: MemoryCandidate[]; resolvedThreadIds: string[]; newThreads: OpenThreadCandidate[]; momentCandidate: boolean; moodEffects: Record<string, number>; actionCandidates:ConversationActionCandidate[]; referencedEntities:string[]; source: 'deterministic' | 'hybrid' };
export interface ConversationAnalysisProvider { analyze(input: ConversationAnalysisInput): Promise<ConversationAnalysisProposal>; }

const apiKey = () => Deno.env.get('OPENAI_API_KEY');
const geminiKey = () => Deno.env.get('GEMINI_API_KEY');
const model = (name: string, fallback: string) => Deno.env.get(name) ?? fallback;

export function dialogueProviderName(): 'openai' | 'gemini' | 'deterministic' {
  if (apiKey()) return 'openai';
  if (geminiKey()) return 'gemini';
  return 'deterministic';
}

export class ConfiguredDialogueProvider implements DialogueProvider {
  async generate(context: DialogueContext): Promise<string> {
    const key = apiKey();
    if (!key) {
      const googleKey = geminiKey();
      return googleKey ? generateGemini(context, googleKey) : fallbackDialogue(context);
    }
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('KIVELLE_DIALOGUE_MODEL', model('TOGETHER_DIALOGUE_MODEL', 'gpt-5-mini')), input: buildCompanionPrompt(context), max_output_tokens: responseTokenBudget(context) }) });
    if (!response.ok) {
      console.warn('Together dialogue provider failed', response.status, await response.text());
      if (response.status === 429) throw new AppError('RATE_LIMITED', 'Your companion needs a moment before replying.', 429, true);
      return fallbackDialogue(context);
    }
    const data = await response.json();
    const text = data.output_text ?? data.output?.flatMap((item: Record<string, unknown>) => Array.isArray(item.content) ? item.content : []).find((item: Record<string, unknown>) => item.type === 'output_text')?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : fallbackDialogue(context);
  }

  async *stream(context: DialogueContext): AsyncIterable<string> {
    const key = geminiKey();
    const openAIKey = apiKey();
    if (openAIKey) {
      let emitted = false;
      try { for await (const token of streamOpenAI(context, openAIKey)) { emitted = true; yield token; } return; } catch { if (emitted) throw new Error('OpenAI stream interrupted.'); yield* textChunks(await this.generate(context)); return; }
    }
    if (!key) {
      yield* textChunks(await this.generate(context));
      return;
    }

    let emitted = false;
    try {
      for await (const token of streamGemini(context, key)) {
        emitted = true;
        yield token;
      }
      if (!emitted) yield* textChunks(await this.generate(context));
    } catch (error) {
      if (emitted) throw error;
      yield* textChunks(await this.generate(context));
    }
  }
}

async function* streamOpenAI(context: DialogueContext, key: string): AsyncIterable<string> {
  const response = await fetch('https://api.openai.com/v1/responses', { method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}, body:JSON.stringify({model:model('KIVELLE_DIALOGUE_MODEL',model('TOGETHER_DIALOGUE_MODEL','gpt-5-mini')),input:buildCompanionPrompt(context),max_output_tokens:responseTokenBudget(context),stream:true}) });
  if (!response.ok || !response.body) throw new Error(`OpenAI stream failed (${response.status})`);
  for await (const data of sseData(response.body)) { const event=JSON.parse(data) as { type?:string; delta?:string }; if(event.type==='response.output_text.delta' && event.delta) yield event.delta; }
}

export class ConfiguredEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[] | null> {
    const key = apiKey();
    if (!key) {
      const googleKey = geminiKey();
      return googleKey ? embedGemini(text, googleKey) : null;
    }
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('TOGETHER_EMBEDDING_MODEL', 'text-embedding-3-small'), input: text, dimensions: 1536 }) });
      if (!response.ok) return null;
      const data = await response.json();
      return data.data?.[0]?.embedding ?? null;
    } catch { return null; }
  }
}


export class ConfiguredModerationProvider implements ModerationProvider {
  async check(text: string): Promise<{ allowed: boolean; categories: string[] }> {
    const key = apiKey();
    if (!key) return { allowed: true, categories: [] };
    try {
      const response = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model('TOGETHER_MODERATION_MODEL', 'omni-moderation-latest'), input: text }) });
      if (!response.ok) return { allowed: true, categories: [] };
      const result = (await response.json()).results?.[0];
      return { allowed: !result?.flagged, categories: Object.entries(result?.categories ?? {}).filter(([, flagged]) => flagged).map(([category]) => category) };
    } catch { return { allowed: true, categories: [] }; }
  }
}

export class ConfiguredConversationAnalysisProvider implements ConversationAnalysisProvider {
  async analyze(input: ConversationAnalysisInput): Promise<ConversationAnalysisProposal> {
    const deterministic = deterministicAnalysis(input);
    const key = geminiKey();
    const enabled = Deno.env.get('TOGETHER_AI_ANALYSIS_ENABLED') !== 'false';
    if (!enabled || !key || !shouldUseModelAnalysis(input.userMessage)) return deterministic;
    try {
      const modelName = model('TOGETHER_ANALYSIS_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
      const response = await Promise.race([
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: analysisPrompt(input) }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 650, responseMimeType: 'application/json' },
          }),
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('analysis_timeout')), 3500)),
      ]);
      if (!response.ok) return deterministic;
      const payload = await response.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map((part: Record<string, unknown>) => part.text).filter(Boolean).join('');
      const modelProposal = validateAnalysisJson(typeof raw === 'string' ? JSON.parse(raw) : null, input);
      return mergeAnalysis(deterministic, modelProposal);
    } catch (error) {
      console.warn('Together post-conversation analysis fell back', error instanceof Error ? error.message : 'unknown_error');
      return deterministic;
    }
  }
}

function deterministicAnalysis(input: ConversationAnalysisInput): ConversationAnalysisProposal {
  const memoryCandidates = extractMemories(input.userMessage);
  const thread = extractOpenThread(input.userMessage);
  const meaningful = memoryCandidates.length > 0 || Boolean(thread);
  const tense = /\b(shut up|don'?t care|whatever|you(?:'re| are) annoying|hate talking to you|leave me alone)\b/i.test(input.userMessage);
  const repairing = /\b(i(?:'m| am) sorry|i apologize|can we talk|i didn'?t mean that|make this right)\b/i.test(input.userMessage);
  const relationshipChanges = tense ? { trust: -3, comfort: -3, affinity: -2, respect: -2, conflict: 4 } : repairing ? { trust: 2, comfort: 1, respect: 2, conflict: -4 } : meaningful ? { trust: 3, comfort: 2, familiarity: 3, affinity: 2, attraction: 1, respect: 1 } : { trust: 1, comfort: 1, familiarity: 2, affinity: 1 };
  return {
    relationshipChanges,
    memoryCandidates,
    resolvedThreadIds: input.existingThreads.filter((item) => threadAnswered(item, input.userMessage)).map((item) => String(item.id)),
    newThreads: thread ? [thread] : [],
    momentCandidate: false,
    moodEffects: {},
    actionCandidates: proposeActions(input),
    referencedEntities: referencedEntities(input),
    source: 'deterministic',
  };
}

function shouldUseModelAnalysis(message: string): boolean {
  if (message.length < 32) return false;
  return /\b(i|i'm|i've|my|we|tomorrow|next|used to|actually|remember|important)\b/i.test(message);
}

function analysisPrompt(input: ConversationAnalysisInput): string {
  const threadList = input.existingThreads.map((item) => ({ id: item.id, topic: item.topic, eligible: item.follow_up_eligible, expectedAt: item.expected_at }));
  return `Analyze one conversation turn for a relationship simulation. Return JSON only. The application owns truth; propose small changes and only facts explicitly stated by the user.

USER MESSAGE
${input.userMessage}

CHARACTER RESPONSE
${input.assistantMessage}

OPEN THREADS
${JSON.stringify(threadList)}

Return this shape:
{"relationshipChanges":{"trust":0,"comfort":0,"attraction":0,"affinity":0,"familiarity":0,"respect":0,"conflict":0,"romantic_interest":0,"commitment":0},"memoryCandidates":[{"memory_type":"semantic|preference|episodic|relationship|emotional","canonical_text":"User ...","subject_key":"stable topic key","importance":0.0,"confidence":0.0,"sensitivity_category":"none|personal|sensitive","metadata":{}}],"resolvedThreadIds":[],"newThreads":[{"topic":"Ask how ... went.","subject":"presentation","expected_at":"ISO timestamp or null","importance":0.0}],"momentCandidate":false,"moodEffects":{}}

Rules: relationship deltas must be integers from -4 to 4. Ordinary chat should be 0 to 2. Never infer private facts. Do not create a memory from the character response. A correction must use the same subject_key as the earlier fact. Resolve only an eligible thread that this user message actually answers.`;
}

function validateAnalysisJson(value: unknown, input: ConversationAnalysisInput): ConversationAnalysisProposal {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const changes = record.relationshipChanges && typeof record.relationshipChanges === 'object' ? record.relationshipChanges as Record<string, unknown> : {};
  const relationshipChanges = Object.fromEntries(['trust','comfort','attraction','affinity','familiarity','respect','conflict','romantic_interest','commitment'].map((key) => {
    const raw = Number(changes[key] ?? 0);
    return [key, Math.max(-4, Math.min(4, Number.isFinite(raw) ? Math.round(raw) : 0))];
  }));
  const memoryCandidates = (Array.isArray(record.memoryCandidates) ? record.memoryCandidates : []).slice(0, 4).flatMap((item): MemoryCandidate[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Record<string, unknown>;
    const memoryType = String(candidate.memory_type ?? '');
    const canonicalText = String(candidate.canonical_text ?? '').trim().slice(0, 600);
    const subjectKey = normalizeContinuityKey(String(candidate.subject_key ?? '')).replace(/\s+/g, ':').slice(0, 120);
    if (!['semantic','preference','episodic','relationship','emotional'].includes(memoryType) || !/^User\b/i.test(canonicalText) || !subjectKey) return [];
    const sensitivity = ['none','personal','sensitive'].includes(String(candidate.sensitivity_category)) ? String(candidate.sensitivity_category) : 'none';
    return [{ memory_type: memoryType, canonical_text: canonicalText, dedupe_key: `${memoryType}:${normalizeContinuityKey(canonicalText)}`, subject_key: subjectKey, importance: clampUnit(candidate.importance), confidence: Math.min(.85, clampUnit(candidate.confidence)), sensitivity_category: sensitivity, metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata as Record<string, unknown> : {} }];
  });
  const allowedThreadIds = new Set(input.existingThreads.filter((item) => threadAnswered(item, input.userMessage)).map((item) => String(item.id)));
  const resolvedThreadIds = (Array.isArray(record.resolvedThreadIds) ? record.resolvedThreadIds : []).map(String).filter((id) => allowedThreadIds.has(id));
  const newThreads = (Array.isArray(record.newThreads) ? record.newThreads : []).slice(0, 2).flatMap((item): OpenThreadCandidate[] => {
    if (!item || typeof item !== 'object') return [];
    const proposed = item as Record<string, unknown>;
    const subject = normalizeContinuityKey(String(proposed.subject ?? '')).slice(0, 80);
    const topic = String(proposed.topic ?? '').trim().slice(0, 240);
    const expectedAt = typeof proposed.expected_at === 'string' && !Number.isNaN(Date.parse(proposed.expected_at)) ? new Date(proposed.expected_at).toISOString() : null;
    if (!subject || !topic || !expectedAt) return [];
    return [{ topic, subject, display_subject:subject[0]!.toUpperCase()+subject.slice(1), followup_prompt:`I should tell you how my ${subject} went.`, dedupe_key: `event:${subject.replace(/\s+/g, ':')}:${expectedAt.slice(0, 10)}`, expected_at: expectedAt, importance: clampUnit(proposed.importance), metadata: { source: 'analysis', subject } }];
  });
  return { relationshipChanges, memoryCandidates, resolvedThreadIds, newThreads, momentCandidate: record.momentCandidate === true, moodEffects: {}, actionCandidates:proposeActions(input), referencedEntities:referencedEntities(input), source: 'hybrid' };
}

function mergeAnalysis(base: ConversationAnalysisProposal, modelProposal: ConversationAnalysisProposal): ConversationAnalysisProposal {
  const memories = new Map<string, MemoryCandidate>();
  for (const candidate of modelProposal.memoryCandidates) memories.set(candidate.subject_key, candidate);
  for (const candidate of base.memoryCandidates) memories.set(candidate.subject_key, candidate);
  const threads = new Map<string, OpenThreadCandidate>();
  for (const thread of [...modelProposal.newThreads, ...base.newThreads]) threads.set(thread.dedupe_key, thread);
  return {
    ...modelProposal,
    relationshipChanges: Number(base.relationshipChanges.conflict ?? 0) !== 0 ? base.relationshipChanges : modelProposal.relationshipChanges,
    memoryCandidates: [...memories.values()],
    resolvedThreadIds: [...new Set([...base.resolvedThreadIds, ...modelProposal.resolvedThreadIds])],
    newThreads: [...threads.values()],
    actionCandidates: base.actionCandidates,
    referencedEntities: [...new Set([...base.referencedEntities, ...modelProposal.referencedEntities])],
    source: 'hybrid',
  };
}

function clampUnit(value: unknown): number {
  const number = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : .5));
}

function proposeActions(input:ConversationAnalysisInput):ConversationActionCandidate[]{
  const text=input.userMessage.toLowerCase();
  const context=input.context;const commitments=context?.upcomingCommitments??[];const focus=context?.conversationFocus as Record<string,unknown>|null;
  const targetWords=(value:string)=>value.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter((word)=>word.length>3);
  const matching=commitments.filter((item)=>targetWords(item.title).some((word)=>text.includes(word))||text.includes(item.location.toLowerCase())||mentionsSameLocalDay(text,item.startsAt,context?.clock?.timezone));
  const focused=focus?.planId?commitments.find((item)=>item.id===focus.planId):undefined;
  const candidates=matching.length?matching:focused?[focused]:commitments;
  const cancelIntent=/\b(cancel|call off|forget (?:the|our)|can'?t make|cannot make|won'?t make)\b/.test(text);
  const rescheduleIntent=/\b(reschedule|move it|move the|make it (?:later|earlier|at|\d)|different time|another day|change (?:the )?time)\b/.test(text);
  if((cancelIntent||rescheduleIntent)&&candidates.length){
    if(candidates.length>1&&!matching.length&&!focused)return[{type:rescheduleIntent?'plan_reschedule':'plan_cancel',confidence:.75,payload:{ambiguous:true,options:candidates.map((item)=>({planId:item.id,targetType:item.type,title:item.title,startsAt:item.startsAt,location:item.location})),requiresConfirmation:true}}];
    const target=candidates[0]!;const proposedStartsAt=rescheduleIntent?(parsePlanTime(text,context?.clock)??parseTimeOnExistingDate(text,target.startsAt,context?.clock?.timezone)):null;
    return[{type:rescheduleIntent?'plan_reschedule':'plan_cancel',confidence:.92,payload:{planId:target.id,targetType:target.type,title:target.title,startsAt:target.startsAt,location:target.location,...(proposedStartsAt?{proposedStartsAt}:{}),requiresConfirmation:true}}];
  }
  const intent=planIntent(text);if(!intent||!/\b(let'?s|we should|want to|could we|how about|make plans|plan|go to|go back|meet|grab|get)\b/.test(text))return[];
  const catalog=context?.planningCatalog??[];
  const explicit=catalog.find((location)=>text.includes(location.name.toLowerCase())||text.includes(location.slug.replace(/-/g,' ')));
  const compatible=catalog.filter((location)=>[...location.activities,...location.dateTypes].some((item)=>normalizePlanWord(item).includes(intent.match)||intent.match.includes(normalizePlanWord(item))));
  const location=explicit??rankPlanLocation(compatible,context?.relationship?.relationship_stage,intent.match);
  const proposedStartsAt=parsePlanTime(text,context?.clock);
  if(!location)return[];
  const rawActivity=location.activities.find((item)=>normalizePlanWord(item).includes(intent.match)||intent.match.includes(normalizePlanWord(item)))??location.dateTypes.find((item)=>normalizePlanWord(item).includes(intent.match))??intent.label;
  const activityKey=normalizePlanWord(rawActivity).replace(/\s+/g,'_');
  const title=`${titleCase(rawActivity)} at ${location.name}`;
  return[{type:intent.match==='dinner'?'date':'plan_create',confidence:explicit?.id?0.96:0.86,payload:{activityIntent:intent.label,activityKey,locationId:location.id,location:location.name,title,durationMinutes:planDuration(intent.match),...(proposedStartsAt?{proposedStartsAt}:{}),relativeTime:relativeTimePhrase(text),reasoningCode:explicit?'explicit_location':'catalog_recommendation',requiresConfirmation:true}}];
}

function planIntent(text:string):{match:string;label:string}|null{const groups:[RegExp,string,string][]=[[/\b(cocktails?|drinks?|bar)\b/,'drinks','drinks'],[/\b(coffee|cafe|café)\b/,'coffee','coffee'],[/\b(dinner|food|eat)\b/,'dinner','dinner'],[/\b(rooftop movie|movie night|movies?)\b/,'movie','movie night'],[/\b(trivia)\b/,'trivia','trivia'],[/\b(open mic|live music|concert)\b/,'music','live music'],[/\b(bookstore|books?)\b/,'books','books'],[/\b(photo walk|photos?|photography)\b/,'photo','photos'],[/\b(walk|riverwalk|park)\b/,'walk','walk'],[/\b(shopping|shop)\b/,'shopping','shopping'],[/\b(karaoke)\b/,'karaoke','karaoke'],[/\b(comedy)\b/,'comedy','comedy']];for(const[pattern,match,label]of groups)if(pattern.test(text))return{match,label};return null;}
function rankPlanLocation(locations:any[],stage:unknown,intent:string){const romantic=['flirting','dating','exclusive','long_term'].includes(String(stage));return[...locations].sort((a,b)=>planLocationScore(b,romantic,intent)-planLocationScore(a,romantic,intent))[0];}
function planLocationScore(location:any,romantic:boolean,intent:string){let score=0;if(intent==='drinks'&&location.slug==='velvet-hour')score+=4;if(intent==='coffee'&&location.slug==='juniper-cafe')score+=3;if(intent==='books'&&location.slug==='paper-trail')score+=5;if(intent==='walk'&&['riverwalk','halcyon-park'].includes(location.slug))score+=4;if(romantic&&location.tags.includes('romantic'))score+=2;if(location.category==='work')score-=5;return score;}
function parsePlanTime(text:string,clock:any):string|null{if(!clock?.localDate||!clock?.timezone)return null;let date=String(clock.localDate);const base=new Date(`${date}T12:00:00Z`);if(/\btomorrow\b/.test(text)){base.setUTCDate(base.getUTCDate()+1);date=base.toISOString().slice(0,10);}else{const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];const index=days.findIndex((day)=>text.includes(day));if(index>=0){let delta=(index-Number(clock.weekday)+7)%7;if(delta===0)delta=7;base.setUTCDate(base.getUTCDate()+delta);date=base.toISOString().slice(0,10);}else if(/\bthis weekend\b/.test(text)){let delta=(6-Number(clock.weekday)+7)%7;if(delta===0)delta=7;base.setUTCDate(base.getUTCDate()+delta);date=base.toISOString().slice(0,10);}else if(!/\btonight\b/.test(text))return null;}
  const time=/\b(?:at|around|make it)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);let hour=time?Number(time[1]):(/night|evening|drinks|dinner/.test(text)?20:10);const minute=time?.[2]?Number(time[2]):0;if(time?.[3]==='pm'&&hour<12)hour+=12;if(time?.[3]==='am'&&hour===12)hour=0;if(!time?.[3]&&hour<=7&&/night|evening|dinner|drinks/.test(text))hour+=12;return localIso(date,hour,minute,String(clock.timezone));}
function localIso(date:string,hour:number,minute:number,timezone:string){let guess=Date.parse(`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`);for(let i=0;i<2;i++){const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const get=(type:string)=>Number(parts.find((part)=>part.type===type)?.value??0);const actual=Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'));const wanted=Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)),hour,minute);guess+=wanted-actual;}return new Date(guess).toISOString();}
function parseTimeOnExistingDate(text:string,startsAt:string,timezone:unknown){const time=/\b(?:at|around|make it)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);if(!time)return null;const zone=String(timezone??'UTC'),dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(startsAt)),get=(type:string)=>dateParts.find((part)=>part.type===type)?.value??'';let hour=Number(time[1]);const minute=Number(time[2]??0);if(time[3]==='pm'&&hour<12)hour+=12;if(time[3]==='am'&&hour===12)hour=0;if(!time[3]&&hour<=7)hour+=12;return localIso(`${get('year')}-${get('month')}-${get('day')}`,hour,minute,zone);}
function mentionsSameLocalDay(text:string,startsAt:string,timezone:unknown){try{const day=new Intl.DateTimeFormat('en-US',{timeZone:String(timezone??'UTC'),weekday:'long'}).format(new Date(startsAt)).toLowerCase();return text.includes(day);}catch{return false;}}
function normalizePlanWord(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function titleCase(value:string){return value.replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function planDuration(intent:string){return intent==='movie'?150:/trivia|music|dinner|karaoke|comedy/.test(intent)?120:/walk|books|shopping|photo/.test(intent)?90:60;}
function relativeTimePhrase(text:string){return/\b(tomorrow(?: night| evening)?|tonight|this weekend|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?: night| evening)?)\b/i.exec(text)?.[0]??null;}
function referencedEntities(input:ConversationAnalysisInput):string[]{const haystack=`${input.userMessage} ${input.assistantMessage}`.toLowerCase();return['Maya','Chloe','Alex','Juniper Café','Riverwalk','Skyline Rooftop','Northside Bar'].filter((name)=>haystack.includes(name.toLowerCase()));}

async function generateGemini(context: DialogueContext, key: string): Promise<string> {
  try {
    const geminiModel = model('TOGETHER_GEMINI_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildCompanionPrompt(context) }] }],
          generationConfig: { temperature: 0.82, maxOutputTokens: responseTokenBudget(context), topP: 0.9 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        }),
      },
    );
    if (!response.ok) {
      console.warn('Together Gemini dialogue request failed', response.status);
      return fallbackDialogue(context);
    }
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part: Record<string, unknown>) => part.text).filter(Boolean).join('');
    return typeof text === 'string' && text.trim() ? text.trim() : fallbackDialogue(context);
  } catch {
    return fallbackDialogue(context);
  }
}

async function* streamGemini(context: DialogueContext, key: string): AsyncIterable<string> {
  const geminiModel = model('TOGETHER_GEMINI_MODEL', Deno.env.get('GEMINI_EXPLANATION_MODEL') ?? 'gemini-2.5-flash');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildCompanionPrompt(context) }] }],
        generationConfig: { temperature: 0.82, maxOutputTokens: responseTokenBudget(context), topP: 0.9 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    },
  );
  if (!response.ok || !response.body) throw new Error(`Gemini stream failed (${response.status})`);
  for await (const data of sseData(response.body)) {
    const payload = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const token = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    if (token) yield token;
  }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const data = event.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
      if (data && data !== '[DONE]') yield data;
    }
    if (done) break;
  }
  if (buffer.startsWith('data: ')) yield buffer.slice(6).trim();
}

function* textChunks(content: string): Iterable<string> {
  yield* content.match(/\S+\s*/g) ?? [content];
}

function responseTokenBudget(context: DialogueContext): number {
  const messageLength = context.userMessage.length;
  if (messageLength < 45) return 100;
  if (messageLength > 700 || /\b(story|tell me about|why|how did)\b/i.test(context.userMessage)) return 520;
  if (context.progression || /\b(date|relationship|sorry|hurt|love)\b/i.test(context.userMessage)) return 380;
  return 220;
}

async function embedGemini(text: string, key: string): Promise<number[] | null> {
  try {
    const embeddingModel = model('TOGETHER_GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(embeddingModel)}:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: `models/${embeddingModel}`, content: { parts: [{ text }] }, outputDimensionality: 1536 }),
      },
    );
    if (!response.ok) return null;
    const values = (await response.json()).embedding?.values;
    return Array.isArray(values) && values.length === 1536 ? values : null;
  } catch {
    return null;
  }
}

function fallbackDialogue(context: DialogueContext): string {
  const lower = context.userMessage.toLowerCase();
  if (/dog.*name is/.test(lower)) return "Okay, that is important information. I'm going to remember that—Cooper is a very good name. What kind of trouble does he get into?";
  if (/presentation|interview|exam/.test(lower)) return "That sounds like a big deal. I'll be rooting for you—and I want to hear how it goes afterward.";
  if (/olive/.test(lower)) return "Noted. If olives show up on our table, they're staying very far away from your side.";
  if (/hello|\bhi\b|\bhey\b/.test(lower)) return "Hey. I was just sorting through a shoot that somehow produced three hundred photos of the same crooked lamp. How's your day going?";
  const memory = context.memories[0]?.text;
  return memory ? `You know, that reminds me of something you told me before—${memory.replace(/^User /, 'you ')} Anyway, tell me the part of this that matters most to you.` : "Okay, you have my attention. Tell me more—but give me the real version, not the polished one.";
}
