export type ConversationQueryIntent='general'|'schedule'|'plan'|'date'|'story'|'memory_overview'|'social'|'location'|'history';
export type SharedPlanLike={id:string;startsAt:string;endsAt?:string|null;status?:string;title?:string};

export type PresentRealitySource='scene'|'active_date'|'active_plan'|'active_event'|'schedule'|'life_engine'|'character_state';
export type PresentRealityCandidate={
  locationId?:string|null;
  activity?:string|null;
  activityKey?:string|null;
  mood?:string|null;
  energy?:string|null;
  availability?:string|null;
  interruptibility?:string|null;
  source?:string|null;
  activityStartedAt?:string|null;
  expectedEndAt?:string|null;
  scheduleEventId?:string|null;
  nextEvent?:Record<string,unknown>|null;
};
export type PresentReality=Omit<PresentRealityCandidate,'activity'|'mood'|'energy'|'availability'|'interruptibility'|'source'>&{activity:string;mood:string;energy:string;availability:string;interruptibility:string;source:PresentRealitySource};
export type PresentRealityInput={
  activeScene?:PresentRealityCandidate|null;
  activeDate?:PresentRealityCandidate|null;
  activePlan?:PresentRealityCandidate&{userPresent:boolean};
  lifeState?:PresentRealityCandidate|null;
  resolvedPresence?:PresentRealityCandidate|null;
  characterState?:PresentRealityCandidate|null;
};

export type LifeEventPresenceCandidate={
  locationId?:string|null;
  eventType?:string|null;
  metadata?:Record<string,unknown>|null;
};

/**
 * Life events are narrative evidence by default, not physical movement.
 * Only structured events that explicitly establish presence may move a
 * character away from the currently resolved schedule. An event at the same
 * place may still enrich activity/mood without creating a contradiction.
 */
export function lifeEventHasExplicitPresenceAuthority(event:LifeEventPresenceCandidate|null|undefined):boolean{
  const metadata=event?.metadata??{};
  const establishesPresence=metadata['establishesPresence'];
  if(establishesPresence===false)return false;
  const rawAuthority=metadata['presenceAuthority']??metadata['presence_authority'];
  const authority=typeof rawAuthority==='string'?rawAuthority.toLowerCase():'';
  return establishesPresence===true||authority==='explicit'||authority==='override';
}

export function lifeEventEstablishesPresentReality(event:LifeEventPresenceCandidate|null|undefined,current:{locationId?:string|null}|null|undefined):boolean{
  if(!event)return false;
  if(lifeEventHasExplicitPresenceAuthority(event))return true;
  const eventLocation=event.locationId?String(event.locationId):'';
  const currentLocation=current?.locationId?String(current.locationId):'';
  return Boolean(eventLocation&&currentLocation&&eventLocation===currentLocation);
}

/**
 * Resolves one present-tense source for location and activity. Historical
 * events are intentionally absent: an event may only win after the Life
 * Engine has promoted it into lifeState/resolvedPresence.
 */
export function resolvePresentReality(input:PresentRealityInput):PresentReality{
  const scene=usable(input.activeScene)?{...input.activeScene,source:'scene' as const}:null;
  const date=usable(input.activeDate)?{...input.activeDate,source:'active_date' as const}:null;
  const plan=input.activePlan?.userPresent&&usable(input.activePlan)?{...input.activePlan,source:'active_plan' as const}:null;
  const life=usable(input.lifeState)?{...input.lifeState,source:normalizePresentSource(input.lifeState?.source,'life_engine')}:null;
  const presence=usable(input.resolvedPresence)?{...input.resolvedPresence,source:normalizePresentSource(input.resolvedPresence?.source,'life_engine')}:null;
  const character={...(input.characterState??{}),source:'character_state' as const};
  const selected=scene??date??plan??life??presence??character;
  const liveTone=input.lifeState??input.resolvedPresence??input.characterState??{};
  return{
    ...selected,
    locationId:selected.locationId??null,
    activity:String(selected.activity??(selected.source==='scene'?'Spending time together':'having some unstructured time')),
    mood:String(selected.mood??liveTone.mood??'content'),
    energy:String(selected.energy??liveTone.energy??'medium'),
    availability:String(selected.availability??liveTone.availability??'available'),
    interruptibility:String(selected.interruptibility??liveTone.interruptibility??'open'),
    source:selected.source,
  };
}

export function classifyConversationQuery(message:string):ConversationQueryIntent{
  const text=message.toLowerCase().replace(/[’]/g,"'");
  const multilingualIntent=classifyMultilingualConversationQuery(text);
  if(multilingualIntent)return multilingualIntent;
  if(/\b(remember|memories|what do you know about me|forgot)\b/.test(text))return'memory_overview';
  const historicalMarker=/\b(yesterday|last (?:time|night|week|month|year)|before|earlier|back then|our first|history|moment|used to)\b/.test(text);
  const historicalLocation=/\bwhere (?:were|was)\b|\bwhere did (?:we|you|they|she|he) go\b/.test(text)&&historicalMarker;
  if(historicalLocation||historicalMarker&&/\b(where|place|location|went|go)\b/.test(text))return'history';
  if(/\bwhere (?:are|r) (?:you|we)\b|\bwhere (?:you|we) at\b|\bwhat (?:place|location) (?:are|r) (?:you|we) at\b|\bare (?:you|we) still (?:at|there|in)\b|\bdid (?:you|we) leave\b|\bwhere did (?:you|we) go\b|\bwhat (?:are|r) you doing (?:there|here|right now)\b|\bwhat is this place\b|\bnearby\b|\bneighbou?rhood\b/.test(text))return'location';
  if(/\b(when|schedule|today|tomorrow|tonight|free|busy|available|what are you doing)\b/.test(text))return'schedule';
  if(/\b(plan|cancel|reschedule|move it|make plans)\b/.test(text))return'plan';
  if(/\b(date|dinner|riverwalk|rooftop movie)\b/.test(text))return'date';
  if(/\b(story|chapter|what happened next)\b/.test(text))return'story';
  if(/\b(?:do|did) you know\b|\bhave you met\b|\bhow do you know\b|\bwho(?:'s| is)\b|\bwhat do you think (?:of|about)\b|\bhow are you related to\b|\b(?:your|her|his|their) relationship (?:with|to)\b|\bwhat is [^.!?]{1,80} to you\b|\btell me about (?:queen|king|princess|prince|lady|lord|duke|duchess|captain|doctor|dr\.?|mr\.?|ms\.?|miss|sir|dame)\s+/i.test(text))return'social';
  if(/\b(chloe|alex|friend|friends|people)\b/.test(text))return'social';
  if(/\b(where|location|juniper|rooftop|riverwalk|northside|studio)\b/.test(text))return'location';
  if(/\b(last time|before|our first|history|moment)\b/.test(text))return'history';
  return'general';
}

export function conversationReferencesKnownCharacter(message:string,characters:Array<{name?:string|null;slug?:string|null}>):boolean{
  const normalized=` ${message.toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9']+/g,' ').trim()} `;
  if(normalized.trim().length<3)return false;
  const honorifics=new Set(['queen','king','princess','prince','lady','lord','duke','duchess','captain','doctor','dr','mister','miss','ms','sir','dame']);
  return characters.some((character)=>{
    const phrases=[character.name,character.slug].map((value)=>String(value??'').toLowerCase().replace(/[^a-z0-9']+/g,' ').trim()).filter(Boolean);
    if(phrases.some((phrase)=>phrase.length>=4&&normalized.includes(` ${phrase} `)))return true;
    const distinctive=phrases.flatMap((phrase)=>phrase.split(' ')).filter((part)=>part.length>=4&&!honorifics.has(part));
    return distinctive.some((part)=>normalized.includes(` ${part} `));
  });
}

/** High-confidence launch-language phrases keep context retrieval working even
 * though canonical world names and stored facts remain authored in English. */
function classifyMultilingualConversationQuery(text:string):ConversationQueryIntent|null{
  if(/(?:\b(?:recuerd(?:as|a|o)|memorias?|qué sabes de mí|olvidaste|souviens|souvenir|mémoire|ricord(?:i|a)|memori[ae]|dimenticat|erinnerst|erinnerung|vergessen|lembra|memórias?|esqueceu)\b|覚えて|思い出|忘れた|記憶|기억|추억|잊었|记得|回忆|忘了)/iu.test(text))return'memory_overview';
  if(/(?:\b(?:ayer|anoche|la última vez|antes|en aquel entonces|hier|la dernière fois|autrefois|avant|ieri|l['’]ultima volta|prima|un tempo|gestern|letztes mal|damals|vorher|ontem|da última vez|antigamente|antes)\b|昨日|前回|昔|以前|어제|지난번|예전에|이전에|昨天|上次|以前|从前)/iu.test(text))return'history';
  if(/(?:\b(?:dónde (?:estás|estamos|andas)|en qué lugar|sigues (?:en|ahí)|où (?:es-tu|sommes-nous|êtes-vous)|quel endroit|dove (?:sei|siamo)|sei ancora (?:a|lì)|wo (?:bist du|sind wir)|bist du noch|onde (?:você está|estamos)|ainda está)\b|tu es où|どこにいる|今どこ|まだ.+にいる|어디에 있어|지금 어디|아직.+있어|你在哪里|现在在哪|还在.+吗)/iu.test(text))return'location';
  if(/(?:\b(?:cuándo|horario|hoy|mañana|esta noche|libre|ocupad[oa]|disponible|quand|horaire|aujourd['’]hui|demain|ce soir|libre|occupé|disponible|quando|orario|oggi|domani|stasera|liber[oa]|impegnat[oa]|wann|zeitplan|heute|morgen|heute abend|frei|beschäftigt|quando|horário|hoje|amanhã|esta noite|livre|ocupad[oa]|disponível)\b|今日|明日|今夜|予定|空いて|忙しい|오늘|내일|오늘 밤|일정|시간 있어|바빠|今天|明天|今晚|日程|有空|忙吗)/iu.test(text))return'schedule';
  if(/(?:\b(?:planear|planes|cancelar|reprogramar|cambiar la hora|planifier|annuler|reprogrammer|faire des projets|pianificare|annullare|riprogrammare|fare programmi|planen|absagen|verschieben|pläne machen|planejar|planos|cancelar|reagendar)\b|予定を立て|計画|キャンセル|変更し|계획|약속 잡|취소|일정 변경|计划|安排|取消|改时间)/iu.test(text))return'plan';
  if(/(?:\b(?:una cita|salir contigo|cena romántica|rendez-vous|sortir ensemble|dîner romantique|appuntamento|uscire insieme|cena romantica|verabredung|date mit|romantisches essen|encontro romântico|sair com você|jantar romântico)\b|デート|데이트|约会)/iu.test(text))return'date';
  if(/(?:\b(?:historia|qué pasó después|histoire|que s['’]est-il passé ensuite|storia|cosa è successo dopo|geschichte|was geschah als nächstes|história|o que aconteceu depois)\b|物語|次に何が起き|이야기|다음에 무슨 일이|故事|接下来发生了什么)/iu.test(text))return'story';
  if(/(?:\b(?:amig[oa]s?|a quién conoces|quién conoces|amis?|qui connais-tu|amic[oi]|chi conosci|freunde|wen kennst du|amig[oa]s?|quem você conhece)\b|友達|誰を知って|친구|누구를 알아|朋友|你认识谁)/iu.test(text))return'social';
  return null;
}
export function planLifecycle(plan:SharedPlanLike,now=new Date()):'scheduled'|'active'|'completed'|'cancelled'{if(plan.status==='cancelled')return'cancelled';const start=new Date(plan.startsAt).getTime(),end=plan.endsAt?new Date(plan.endsAt).getTime():start+2*3600000;if(now.getTime()<start)return'scheduled';if(now.getTime()<=end)return'active';return'completed';}
export function currentEvent<T extends SharedPlanLike>(events:T[],now=new Date()):T|undefined{return events.filter((event)=>planLifecycle(event,now)==='active').sort((a,b)=>new Date(b.startsAt).getTime()-new Date(a.startsAt).getTime())[0];}
export function cleanOpenThread(thread:{topic:string;subject?:string|null;displaySubject?:string|null;followupPrompt?:string|null}):{label:string;prompt:string}{const inferred=thread.topic.match(/user's\s+([a-z ]+)/i)?.[1]?.replace(/\s+went.*$/i,'')??'something important';const subject=thread.displaySubject??thread.subject??inferred;return{label:subject,prompt:thread.followupPrompt??`I should tell you how my ${subject.toLowerCase()} went.`};}
export function dedupeCommitments<T extends {type:'plan'|'date';title:string;startsAt:string}>(items:T[]):T[]{const seen=new Set<string>();return [...items].sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime()).filter((item)=>{const key=`${item.title.toLowerCase().replace(/[^a-z0-9]/g,'')}:${item.startsAt.slice(0,13)}`;if(seen.has(key))return false;seen.add(key);return true;});}
export function timezoneParts(now:Date,timezone:string):{weekday:number;minuteOfDay:number;localDate:string}{const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const get=(type:string)=>parts.find((item)=>item.type===type)?.value??'';return{weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minuteOfDay:(Number(get('hour'))%24)*60+Number(get('minute')),localDate:`${get('year')}-${get('month')}-${get('day')}`};}
export function proposedAction(message:string,commitments:Array<{id:string;type:'plan'|'date';title:string;startsAt:string;location?:string}>,focusId?:string):{type:'plan_create'|'date'|'plan_cancel'|'plan_reschedule';payload:Record<string,unknown>}|null{const text=message.toLowerCase(),focused=commitments.find((item)=>item.id===focusId),matching=commitments.filter((item)=>text.includes(item.title.toLowerCase().split(' ')[0]!)||(item.location&&text.includes(item.location.toLowerCase()))),targets=matching.length?matching:focused?[focused]:commitments,cancel=/\b(cancel|call off|can'?t make)\b/.test(text),move=/\b(reschedule|move|make it \d|different time|another day)\b/.test(text);if((cancel||move)&&targets.length>1&&!matching.length&&!focused)return{type:move?'plan_reschedule':'plan_cancel',payload:{ambiguous:true,options:targets.map((item)=>item.id)}};if((cancel||move)&&targets[0])return{type:move?'plan_reschedule':'plan_cancel',payload:{planId:targets[0].id,requiresConfirmation:true}};const activity=/\b(coffee|dinner|drinks?|cocktails?|riverwalk|walk|bookstore|books?|open mic|rooftop movie|trivia|photo walk)\b/.exec(text)?.[1];return activity&&/\b(let'?s|we should|want to|could we|how about|plan|get|grab|go)\b/.test(text)?{type:activity==='dinner'?'date':'plan_create',payload:{activityIntent:activity,requiresConfirmation:true}}:null;}
export function companionPlans<T extends{characterInstanceId:string;status:string}>(plans:T[],characterInstanceId:string){return plans.filter((plan)=>plan.characterInstanceId===characterInstanceId&&plan.status!=='cancelled');}

function usable(value:PresentRealityCandidate|null|undefined):value is PresentRealityCandidate{return Boolean(value?.locationId);}
function normalizePresentSource(value:unknown,fallback:PresentRealitySource):PresentRealitySource{switch(value){case'scene':case'active_date':case'active_plan':case'active_event':case'schedule':case'life_engine':case'character_state':return value;case'plan':return'active_plan';case'life_event':return'active_event';default:return fallback;}}
