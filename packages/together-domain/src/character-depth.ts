export const CHARACTER_DEPTH_VERSION=5 as const;

export type CharacterResponseMode='casual'|'playful'|'supportive'|'vulnerable'|'conflicted'|'repair'|'practical'|'storytelling'|'affectionate';
export type CharacterResponseShape='reaction_first'|'answer_then_turn'|'observation_then_reveal'|'action_then_line'|'short_burst'|'story_beat'|'disagreement_then_reason';
export type CharacterCuriosityStyle='observant_selective'|'direct_specific'|'teasing_playful'|'warm_reflective'|'analytical_precise';
export type CharacterCuriosityProfile={
  domains:string[];
  style:CharacterCuriosityStyle;
  disclosureBeforeQuestion:'rare'|'sometimes'|'usually';
  preferredMoves:Partial<Record<CharacterResponseMode,string[]>>;
  avoids:string[];
};

export type CharacterAnecdote={
  id:string;
  title:string;
  summary:string;
  topics:string[];
  revealStages:string[];
  minimumTrust:number;
  cooldownTurns:number;
};

export type CharacterDepthBible={
  depthVersion:number;
  voice:{cadence:string;vocabulary:string;humorMechanism:string;questionStyle:string;curiosity:CharacterCuriosityProfile;metaphorSources:string[];profanity:string;emoji:string;petNames:string[];verbalTics:string[];forbiddenPhrases:string[]};
  psychology:{worldview:string;coreValues:string[];contradictions:string[];blindSpots:string[];defenses:string[];insecurities:string[]};
  perceptionLenses:string[];
  conversationalMoves:Partial<Record<CharacterResponseMode,string[]>>;
  anecdotes:CharacterAnecdote[];
  stageDisclosure:Record<string,string>;
  opinions:string[];
  ambitions:string[];
  concerns:string[];
};

export type CharacterVoiceCard={
  depthVersion:number;
  cadence:string;
  vocabulary:string;
  humor:string;
  questionStyle:string;
  curiosity:CharacterCuriosityProfile;
  perceptionLens:string;
  conversationalMove:string;
  responseShape:CharacterResponseShape;
  disclosureBoundary:string;
  metaphorSources:string[];
  verbalTexture:string[];
  avoid:string[];
  anecdote:CharacterAnecdote|null;
  adultContinuity:string;
};

export type CharacterUserViewPattern={key:string;observation:string;evidenceCount:number;confidence:number;lastSeenAt:string};
export type CharacterUserView={
  version:number;
  summary:string;
  patterns:CharacterUserViewPattern[];
  knownPreferences:string[];
  values:string[];
  frictions:string[];
  uncertainties:string[];
  updatedThroughMessageId?:string;
  updatedAt?:string;
};

const responseShapes:CharacterResponseShape[]=['reaction_first','answer_then_turn','observation_then_reveal','action_then_line','short_burst','story_beat','disagreement_then_reason'];
const stageOrder=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];

export function normalizeCharacterDepthBible(value:unknown,fallback:Record<string,unknown>={}):CharacterDepthBible{
  const root=row(value);const voice=row(root['voice']);const psychology=row(root['psychology']);
  const legacyTraits=strings(root['traits']??fallback['traits']);const legacyValues=stringsOrKeys(root['values']??fallback['values']);
  const curiosity=normalizeCharacterCuriosityProfile(voice['curiosity'],{...fallback,...root,voice});
  return{
    depthVersion:finite(root['depthVersion']??root['promptVersion'],CHARACTER_DEPTH_VERSION),
    voice:{
      cadence:text(voice['cadence'],'Natural, varied sentence rhythm; concise when the moment is light and fuller when it earns depth.'),
      vocabulary:text(voice['vocabulary'],'Contemporary, concrete language grounded in the character’s life.'),
      humorMechanism:text(voice['humorMechanism'],'Humor grows from observation and situation, not canned jokes.'),
      questionStyle:text(voice['questionStyle'],'Ask only when genuinely curious; do not make every reply an interview.'),
      curiosity,
      metaphorSources:strings(voice['metaphorSources']).slice(0,5),
      profanity:text(voice['profanity'],'contextual'),emoji:text(voice['emoji'],'light'),petNames:strings(voice['petNames']).slice(0,5),verbalTics:strings(voice['verbalTics']).slice(0,5),
      forbiddenPhrases:unique([...strings(voice['forbiddenPhrases']),'Tell me more.','How does that make you feel?','I am always here for you.']).slice(0,10),
    },
    psychology:{
      worldview:text(psychology['worldview'],legacyTraits.length?`Approaches life through ${join(legacyTraits.slice(0,3))}.`:'Has a specific, independent point of view.'),
      coreValues:unique([...stringsOrKeys(psychology['coreValues']),...legacyValues]).slice(0,8),contradictions:strings(psychology['contradictions']).slice(0,5),blindSpots:strings(psychology['blindSpots']).slice(0,5),defenses:strings(psychology['defenses']).slice(0,5),insecurities:strings(psychology['insecurities']).slice(0,5),
    },
    perceptionLenses:strings(root['perceptionLenses']).slice(0,6),
    conversationalMoves:normalizeMoves(root['conversationalMoves']),
    anecdotes:normalizeAnecdotes(root['anecdotes']),
    stageDisclosure:normalizeDisclosure(root['stageDisclosure']),opinions:strings(root['opinions']).slice(0,10),
    ambitions:strings(root['ambitions']??root['goals']).slice(0,8),concerns:strings(root['concerns']??root['currentConcerns']).slice(0,8),
  };
}

export function compileCharacterVoiceCard(input:{bible:unknown;characterName?:string;occupation?:string;message:string;mode:CharacterResponseMode;relationshipStage?:string;trust?:number;interactionMode?:string;interactionQuality?:string;recentAssistantMessages?:string[]}):CharacterVoiceCard{
  const bible=normalizeCharacterDepthBible(input.bible,row(input.bible));const seed=`${input.characterName??''}|${input.message}|${input.mode}`;
  const lenses=bible.perceptionLenses.length?bible.perceptionLenses:[`Notice what ${input.occupation||'this life'} reveals about effort, attention, and intent.`];
  const moves=bible.conversationalMoves[input.mode]?.length?bible.conversationalMoves[input.mode]!:defaultMoves(input.mode);
  const recentShapes=(input.recentAssistantMessages??[]).slice(-4).map(inferResponseShape);
  const usableShapes=input.interactionMode==='co_present'?responseShapes:responseShapes.filter((shape)=>shape!=='action_then_line');
  const candidates=usableShapes.filter((shape)=>!recentShapes.includes(shape));const shape=pick(candidates.length?candidates:usableShapes,`${seed}|shape`);
  const anecdote=selectCharacterAnecdote({bible,message:input.message,...(input.relationshipStage!==undefined?{relationshipStage:input.relationshipStage}:{}),...(input.trust!==undefined?{trust:input.trust}:{}),...(input.recentAssistantMessages!==undefined?{recentAssistantMessages:input.recentAssistantMessages}:{})});
  const texture=unique([...bible.voice.verbalTics,...bible.voice.petNames.map((item)=>`Pet name available sparingly: ${item}`)]).slice(0,5);
  return{
    depthVersion:bible.depthVersion,cadence:bible.voice.cadence,vocabulary:bible.voice.vocabulary,humor:bible.voice.humorMechanism,questionStyle:bible.voice.questionStyle,curiosity:bible.voice.curiosity,
    perceptionLens:pick(lenses,`${seed}|lens`),conversationalMove:pick(moves,`${seed}|move`),responseShape:shape,
    disclosureBoundary:disclosureForStage(bible,input.relationshipStage??'stranger'),metaphorSources:bible.voice.metaphorSources,verbalTexture:texture,
    avoid:unique([...bible.voice.forbiddenPhrases,...shapeAvoid(shape)]).slice(0,10),anecdote,
    adultContinuity:'Keep this exact personality and voice in eligible adult dialogue. Adult intensity may change explicitness, never identity, consent, autonomy, or relationship truth.',
  };
}

export function normalizeCharacterCuriosityProfile(value:unknown,fallback:Record<string,unknown>={}):CharacterCuriosityProfile{
  const source=row(value);const personality=row(fallback['personality_config']??fallback['personality']);const communication=row(fallback['communication_style']??fallback['communicationStyle']);
  const interests=strings(fallback['interests']);const occupation=text(fallback['occupation'],'').trim();const traits=strings(fallback['traits']);const lenses=strings(fallback['perceptionLenses']);
  const directness=finite(personality['directness']??communication['conflictDirectness'],.5),humor=finite(personality['humor'],.5),warmth=finite(personality['warmth']??communication['emotionalOpenness'],.5);
  const inferredStyle:CharacterCuriosityStyle=/engineer|analyst|research|security|architect|doctor|scientist|developer|investigator/i.test(occupation)?'analytical_precise':directness>=.72?'direct_specific':humor>=.7?'teasing_playful':warmth>=.7?'warm_reflective':'observant_selective';
  const style=isCuriosityStyle(source['style'])?source['style']:inferredStyle;
  const disclosure=source['disclosureBeforeQuestion']==='rare'||source['disclosureBeforeQuestion']==='usually'?source['disclosureBeforeQuestion']:'sometimes';
  const domains=unique([...strings(source['domains']),...interests,...traits.slice(0,2),...(occupation?[occupation]:[])]).slice(0,8);
  while(domains.length<2)domains.push(domains.length?'the choices behind what people say':'the user’s present experience');
  const suppliedMoves=normalizeMoves(source['preferredMoves']);
  const lens=lenses[0]??`Notice the concrete detail that reveals what matters to the user.`;
  const preferredMoves:Partial<Record<CharacterResponseMode,string[]>>=Object.keys(suppliedMoves).length?suppliedMoves:{
    casual:[`${lens} Ask about the choice, cause, or preference behind that detail.`],
    playful:['Turn one specific detail into a playful opening the user can answer or challenge.'],
    supportive:['Name the concrete pressure, share one grounded perspective, then ask what kind of response would actually help.'],
    affectionate:['Reveal a specific preference or desire before inviting the user’s own.'],
  };
  return{domains,style,disclosureBeforeQuestion:disclosure,preferredMoves,avoids:unique([...strings(source['avoids']),'generic interview questions','stacked questions']).slice(0,8)};
}

export function buildDefaultCharacterCuriosityProfile(input:{interests?:unknown;occupation?:string;traits?:unknown;personality?:Record<string,unknown>;communicationStyle?:Record<string,unknown>;perceptionLenses?:unknown}):CharacterCuriosityProfile{
  return normalizeCharacterCuriosityProfile(undefined,{interests:input.interests??[],occupation:input.occupation??'',traits:input.traits??[],personality:input.personality??{},communicationStyle:input.communicationStyle??{},perceptionLenses:input.perceptionLenses??[]});
}

export function isValidCharacterCuriosityProfile(value:unknown):value is CharacterCuriosityProfile{
  const source=row(value),moves=row(source['preferredMoves']);
  return strings(source['domains']).length>=2&&isCuriosityStyle(source['style'])&&(source['disclosureBeforeQuestion']==='rare'||source['disclosureBeforeQuestion']==='sometimes'||source['disclosureBeforeQuestion']==='usually')&&Object.values(moves).some((entry)=>strings(entry).length>0)&&strings(source['avoids']).length>0;
}

export function selectCharacterAnecdote(input:{bible:CharacterDepthBible;message:string;relationshipStage?:string;trust?:number;recentAssistantMessages?:string[]}):CharacterAnecdote|null{
  const stage=input.relationshipStage??'stranger';const trust=finite(input.trust,0);const messageTokens=tokens(input.message);
  const eligible=input.bible.anecdotes.filter((item)=>item.minimumTrust<=trust&&stageAllowed(stage,item.revealStages)&&!anecdoteRecentlyUsed(item,input.recentAssistantMessages??[])).map((item)=>({item,score:item.topics.reduce((sum,topic)=>sum+(messageTokens.has(normalize(topic))?3:[...messageTokens].some((token)=>normalize(topic).includes(token)||token.includes(normalize(topic)))?1:0),0)})).filter((entry)=>entry.score>0).sort((a,b)=>b.score-a.score||a.item.id.localeCompare(b.item.id));
  return eligible[0]?.item??null;
}

export function normalizeCharacterUserView(value:unknown):CharacterUserView{
  const source=row(value);const patterns=(Array.isArray(source['patterns'])?source['patterns']:[]).flatMap((value):CharacterUserViewPattern[]=>{const item=row(value);const key=text(item['key'],'').slice(0,80);const observation=text(item['observation'],'').slice(0,220);if(!key||!observation)return[];return[{key,observation,evidenceCount:Math.max(1,Math.round(finite(item['evidenceCount'],1))),confidence:clamp(finite(item['confidence'],.25),0,.9),lastSeenAt:text(item['lastSeenAt'],'')}];}).slice(0,12);
  return{version:finite(source['version'],1),summary:text(source['summary'],'Still forming a view through direct interaction.'),patterns,knownPreferences:strings(source['knownPreferences']).slice(0,10),values:strings(source['values']).slice(0,8),frictions:strings(source['frictions']).slice(0,6),uncertainties:strings(source['uncertainties']).slice(0,6),...(typeof source['updatedThroughMessageId']==='string'?{updatedThroughMessageId:source['updatedThroughMessageId']}:{}),...(typeof source['updatedAt']==='string'?{updatedAt:source['updatedAt']}:{})};
}

export function evolveCharacterUserView(previous:unknown,input:{userMessage:string;assistantMessage?:string;memoryCandidates?:Array<{memory_type?:string;canonical_text?:string}>;sourceMessageId?:string;now?:Date}):CharacterUserView{
  const view=normalizeCharacterUserView(previous);const now=(input.now??new Date()).toISOString();const signals=detectViewSignals(input.userMessage);
  const byKey=new Map(view.patterns.map((item)=>[item.key,item]));
  for(const signal of signals){const prior=byKey.get(signal.key);const evidenceCount=Math.min(99,(prior?.evidenceCount??0)+1);byKey.set(signal.key,{key:signal.key,observation:signal.observation,evidenceCount,confidence:clamp(.18+evidenceCount*.12,0,.82),lastSeenAt:now});}
  const memories=input.memoryCandidates??[];const preferences=memories.filter((item)=>item.memory_type==='preference').map((item)=>text(item.canonical_text,'').slice(0,220)).filter(Boolean);const values=extractExpressedValues(input.userMessage);
  const patterns=[...byKey.values()].sort((a,b)=>b.confidence-a.confidence||b.evidenceCount-a.evidenceCount).slice(0,12);const reliable=patterns.filter((item)=>item.evidenceCount>=2).slice(0,3).map((item)=>item.observation);
  const summary=reliable.length?`So far, the user ${join(reliable.map(lowerFirst))}.`:'Still forming a view through direct interaction; avoid treating one message as a settled trait.';
  return{version:1,summary,patterns,knownPreferences:unique([...preferences,...view.knownPreferences]).slice(0,10),values:unique([...values,...view.values]).slice(0,8),frictions:view.frictions,uncertainties:patterns.filter((item)=>item.evidenceCount===1).slice(0,3).map((item)=>`Whether the user consistently ${lowerFirst(item.observation)}.`),...(input.sourceMessageId?{updatedThroughMessageId:input.sourceMessageId}:{}),updatedAt:now};
}

export function inferResponseShape(message:string):CharacterResponseShape{
  const clean=message.trim();if(clean.length<70)return'short_burst';if(/^[*_(].{0,80}[*_)]/s.test(clean))return'action_then_line';if(/\b(i remember|once|when i was|years ago|the first time)\b/i.test(clean))return'story_beat';if(/\b(actually|i disagree|no,|not quite|here'?s the thing)\b/i.test(clean))return'disagreement_then_reason';if(/\?\s*$/.test(clean))return'answer_then_turn';if(/\b(i think|i notice|you seem|that tells me)\b/i.test(clean))return'observation_then_reveal';return'reaction_first';
}

function normalizeMoves(value:unknown):Partial<Record<CharacterResponseMode,string[]>>{const source=row(value);const result:Partial<Record<CharacterResponseMode,string[]>>={};for(const mode of ['casual','playful','supportive','vulnerable','conflicted','repair','practical','storytelling','affectionate'] as CharacterResponseMode[]){const entries=strings(source[mode]).slice(0,5);if(entries.length)result[mode]=entries;}return result;}
function isCuriosityStyle(value:unknown):value is CharacterCuriosityStyle{return value==='observant_selective'||value==='direct_specific'||value==='teasing_playful'||value==='warm_reflective'||value==='analytical_precise';}
function normalizeAnecdotes(value:unknown):CharacterAnecdote[]{return(Array.isArray(value)?value:[]).flatMap((value):CharacterAnecdote[]=>{const item=row(value);const id=text(item['id'],'').slice(0,100),title=text(item['title'],'').slice(0,160),summary=text(item['summary'],'').slice(0,700);if(!id||!title||!summary)return[];return[{id,title,summary,topics:strings(item['topics']).slice(0,10),revealStages:strings(item['revealStages']).length?strings(item['revealStages']):['acquaintance','friend','flirting','dating','exclusive','long_term'],minimumTrust:clamp(finite(item['minimumTrust'],0),0,100),cooldownTurns:Math.max(4,Math.round(finite(item['cooldownTurns'],18)))}];}).slice(0,12);}
function normalizeDisclosure(value:unknown):Record<string,string>{const source=row(value);return Object.fromEntries(stageOrder.flatMap((stage)=>typeof source[stage]==='string'&&String(source[stage]).trim()?[[stage,String(source[stage]).trim().slice(0,300)]]:[]));}
function disclosureForStage(bible:CharacterDepthBible,stage:string):string{const direct=bible.stageDisclosure[stage];if(direct)return direct;const rank=Math.max(0,stageOrder.indexOf(stage));if(rank<=1)return'Offer surface preferences and small personal details; protect the deeper contradiction.';if(rank<=3)return'Allow meaningful specifics and one layer of vulnerability when relevant.';return'Deeper history and plainly stated needs are available when the moment earns them; do not force a confession.';}
function defaultMoves(mode:CharacterResponseMode):string[]{const moves:Record<CharacterResponseMode,string[]>={casual:['Notice one specific detail, form an opinion, and respond from it.'],playful:['Turn one concrete detail into character-specific teasing.'],supportive:['Name the concrete problem, then offer the kind of care this character would actually give.'],vulnerable:['Reveal one precise truth while keeping some self-protection.'],conflicted:['State the disagreement without flattening affection or autonomy.'],repair:['Acknowledge the exact harm, take a position, and leave room for response.'],practical:['Give a grounded answer or next step before asking anything.'],storytelling:['Tell one relevant beat with sensory specificity; stop before it becomes a monologue.'],affectionate:['Express desire or tenderness through this character’s attention style, not generic praise.']};return moves[mode];}
function shapeAvoid(shape:CharacterResponseShape):string[]{if(shape==='short_burst')return['Do not pad a short reaction with a summary or obligatory question.'];if(shape==='story_beat')return['Do not turn the anecdote into a life lesson or repeat it later as canned lore.'];if(shape==='disagreement_then_reason')return['Do not soften every disagreement into immediate agreement.'];if(shape==='action_then_line')return['Use physical action only when co-presence or the scene supports it.'];return['Do not end with a generic invitation to continue.'];}
function detectViewSignals(message:string):Array<{key:string;observation:string}>{const lower=message.toLowerCase();const result:Array<{key:string;observation:string}>=[];if(/\?/.test(message)&&/\b(why|how|what|which|tell me)\b/i.test(message))result.push({key:'specific_curiosity',observation:'engages through specific questions rather than only small talk'});if(/\b(i feel|i'm scared|i am scared|i'm worried|i am worried|honestly|i admit)\b/i.test(message))result.push({key:'emotional_candor',observation:'is sometimes willing to name vulnerable feelings directly'});if(/\b(let'?s|what time|when should|plan|schedule|tomorrow|tonight)\b/i.test(message))result.push({key:'concrete_planning',observation:'often turns interest into concrete plans'});if(/\b(lol|haha|kidding|joking|tease)\b/i.test(message))result.push({key:'playful_register',observation:'uses humor to create ease and test rapport'});if(/\b(i disagree|actually|no,|that'?s not|you'?re wrong)\b/i.test(message))result.push({key:'direct_disagreement',observation:'will disagree or correct the record instead of performing agreement'});if(/\b(i want you|miss you|kiss|beautiful|handsome|sexy|attracted|love you)\b/i.test(lower))result.push({key:'affectionate_initiative',observation:'is willing to initiate affection or attraction'});return result.slice(0,3);}
function extractExpressedValues(message:string):string[]{const match=/\b(?:i\s+)?(?:value|believe in|care (?:a lot )?about|think (?:that )?it matters (?:that|to))\s+([^.!?]{3,120})/i.exec(message);return match?.[1]?[match[1].trim().slice(0,120)]:[];}
function anecdoteRecentlyUsed(item:CharacterAnecdote,recentMessages:string[]):boolean{const recent=normalize(recentMessages.slice(-Math.max(2,Math.ceil(item.cooldownTurns/2))).join(' '));if(!recent)return false;if(recent.includes(normalize(item.title)))return true;const salient=[...tokens(item.summary)].filter((token)=>token.length>=6);return salient.filter((token)=>recent.includes(token)).length>=Math.min(4,Math.max(2,salient.length));}
function stageAllowed(current:string,allowed:string[]):boolean{const currentRank=stageOrder.indexOf(current);return allowed.some((stage)=>stage==='any'||stage===current||(stage.startsWith('min:')&&currentRank>=stageOrder.indexOf(stage.slice(4))));}
function pick<T>(values:T[],seed:string):T{return values[hash(seed)%values.length]!;}
function hash(value:string):number{let result=2166136261;for(let index=0;index<value.length;index++){result^=value.charCodeAt(index);result=Math.imul(result,16777619);}return result>>>0;}
function tokens(value:string):Set<string>{return new Set(normalize(value).split(' ').filter((item)=>item.length>3));}
function normalize(value:string):string{return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function row(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function strings(value:unknown):string[]{return Array.isArray(value)?value.map(String).map((item)=>item.trim()).filter(Boolean):typeof value==='string'&&value.trim()?[value.trim()]:[];}
function stringsOrKeys(value:unknown):string[]{const direct=strings(value);if(direct.length)return direct;return value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).map((item)=>item.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase()):[];}
function text(value:unknown,fallback:string):string{return typeof value==='string'&&value.trim()?value.trim():fallback;}
function finite(value:unknown,fallback:number):number{const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function clamp(value:number,min:number,max:number):number{return Math.max(min,Math.min(max,value));}
function unique(values:string[]):string[]{return[...new Set(values.map((item)=>item.trim()).filter(Boolean))];}
function join(values:string[]):string{return values.length<=1?values[0]??'':values.length===2?`${values[0]} and ${values[1]}`:`${values.slice(0,-1).join(', ')}, and ${values.at(-1)}`;}
function lowerFirst(value:string):string{return value?value[0]!.toLowerCase()+value.slice(1):value;}
