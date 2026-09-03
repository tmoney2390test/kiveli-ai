export type WorldPulseStatus='scheduled'|'active'|'completed'|'cancelled';
export type WorldPulseKnowledgeScope='public'|'local'|'insider'|'private';

export interface WorldPulseEvent{
  id:string;
  templateId:string;
  worldId:string;
  locationId:string|null;
  districtLocationId:string|null;
  title:string;
  summary:string;
  eventType:string;
  startsAt:string;
  endsAt:string;
  status:WorldPulseStatus;
  knowledgeScope:WorldPulseKnowledgeScope;
  significance:number;
  topicTags:string[];
  activityTags:string[];
  participantCharacterInstanceIds:string[];
  participantNames?:string[];
  characterIsParticipant?:boolean;
  locationName?:string|null;
  locationSlug?:string|null;
  atmosphere?:string|null;
  weather?:Record<string,unknown>;
  planAffordances?:Record<string,unknown>;
  metadata?:Record<string,unknown>;
}

export interface WorldPulseContextEvent extends WorldPulseEvent{
  relevance:number;
  reasonCodes:string[];
}

export interface AroundTownItem{
  id:string;
  kind:'happening_now'|'later_today'|'upcoming';
  title:string;
  summary:string;
  startsAt:string;
  endsAt:string;
  locationId:string|null;
  locationName?:string|null;
  locationSlug?:string|null;
  participantCharacterInstanceIds:string[];
  participantNames:string[];
  action:'open_place'|'open_world';
  eventType:string;
  significance:number;
}

export function selectWorldPulseForContext(events:readonly WorldPulseEvent[],input:{
  now?:Date;
  userMessage:string;
  currentLocationId?:string|null;
  districtLocationId?:string|null;
  characterInstanceId?:string|null;
  characterIsLocal?:boolean;
  directWorldQuery?:boolean;
  maximumResults?:number;
}):WorldPulseContextEvent[]{
  const now=input.now??new Date(),terms=tokenize(input.userMessage),direct=input.directWorldQuery===true||worldQuery(input.userMessage);
  const maximum=Math.max(0,Math.min(3,input.maximumResults??(direct?3:2)));
  if(!maximum)return[];
  return events.flatMap((event):WorldPulseContextEvent[]=>{
    if(event.status==='cancelled'||new Date(event.endsAt).getTime()<now.getTime()-18*3600000||new Date(event.startsAt).getTime()>now.getTime()+48*3600000)return[];
    const participant=Boolean(input.characterInstanceId&&event.participantCharacterInstanceIds.includes(input.characterInstanceId));
    const sameLocation=Boolean(input.currentLocationId&&event.locationId===input.currentLocationId);
    const sameDistrict=Boolean(input.districtLocationId&&event.districtLocationId===input.districtLocationId);
    if(event.knowledgeScope==='private'&&!participant)return[];
    if(event.knowledgeScope==='insider'&&!participant)return[];
    if(event.knowledgeScope==='local'&&!participant&&!input.characterIsLocal&&!sameLocation&&!sameDistrict)return[];
    const text=`${event.title} ${event.summary} ${event.eventType} ${event.topicTags.join(' ')} ${event.activityTags.join(' ')}`.toLowerCase();
    const lexical=[...terms].filter((term)=>text.includes(term)).length;
    const active=new Date(event.startsAt)<=now&&new Date(event.endsAt)>now;
    const upcoming=new Date(event.startsAt)>now;
    let relevance=event.significance*18+(active?34:upcoming?12:5)+(sameLocation?55:0)+(sameDistrict?28:0)+(participant?45:0)+Math.min(45,lexical*15)+(direct?12:0);
    const reasonCodes=[active?'active_now':'',upcoming?'upcoming':'',sameLocation?'current_location':'',sameDistrict?'current_district':'',participant?'character_participant':'',lexical?'topic_match':'',direct?'direct_world_query':''].filter(Boolean);
    // Ambient events must earn their way into a normal reply. This prevents a
    // casual greeting from turning into a local-news recital.
    if(!direct&&!participant&&!sameLocation&&!sameDistrict&&!lexical)relevance-=32;
    if(relevance<18)return[];
    return[{...event,characterIsParticipant:participant,relevance,reasonCodes}];
  }).sort((a,b)=>b.relevance-a.relevance||a.startsAt.localeCompare(b.startsAt)||a.id.localeCompare(b.id)).slice(0,maximum);
}

export function buildAroundTownFeed(events:readonly WorldPulseEvent[],input:{now?:Date;limit?:number}={}):AroundTownItem[]{
  const now=input.now??new Date(),limit=Math.max(1,Math.min(12,input.limit??6));
  const candidates=events.filter((event)=>isPublicWorldHappening(event)&&event.status!=='cancelled'&&new Date(event.endsAt)>now&&new Date(event.startsAt).getTime()<now.getTime()+7*86400000&&(event.knowledgeScope==='public'||event.knowledgeScope==='local'))
    .sort((left,right)=>{
      const leftActive=new Date(left.startsAt)<=now&&new Date(left.endsAt)>now,rightActive=new Date(right.startsAt)<=now&&new Date(right.endsAt)>now;
      return Number(rightActive)-Number(leftActive)||new Date(left.startsAt).getTime()-new Date(right.startsAt).getTime()||right.significance-left.significance;
    });
  const seen=new Set<string>(),items:AroundTownItem[]=[];
  for(const event of candidates){
    const identity=`${normalizeEventTitle(event.title)}|${event.locationId??event.districtLocationId??event.worldId}`;
    if(seen.has(identity))continue;
    seen.add(identity);
      const active=new Date(event.startsAt)<=now&&new Date(event.endsAt)>now;
      const today=localDate(event.startsAt)===localDate(now.toISOString());
    items.push({id:event.id,kind:active?'happening_now':today?'later_today':'upcoming',title:event.title,summary:event.summary,startsAt:event.startsAt,endsAt:event.endsAt,locationId:event.locationId,...(event.locationName!==undefined?{locationName:event.locationName}:{}),...(event.locationSlug!==undefined?{locationSlug:event.locationSlug}:{}),participantCharacterInstanceIds:event.participantCharacterInstanceIds,participantNames:event.participantNames??[],action:event.locationId?'open_place':'open_world',eventType:event.eventType,significance:event.significance});
    if(items.length>=limit)break;
  }
  return items;
}

export function worldPulsePlanBoost(locationId:string,events:readonly Pick<WorldPulseEvent,'locationId'|'startsAt'|'endsAt'|'status'|'significance'|'planAffordances'>[],now=new Date()):{score:number;reason?:string}{
  const event=events.filter((item)=>item.locationId===locationId&&item.status!=='cancelled'&&new Date(item.endsAt)>now&&new Date(item.startsAt).getTime()<now.getTime()+36*3600000).sort((a,b)=>Number(b.significance)-Number(a.significance))[0];
  if(!event)return{score:0};
  const label=typeof event.planAffordances?.['reason']==='string'?String(event.planAffordances['reason']):undefined;
  return{score:1.25+Math.max(0,Math.min(1,event.significance)),...(label?{reason:label}:{})};
}

export function temporalContinuitySummary(input:{lastMessageAt?:string|null;now?:Date;events:readonly {title:string;summary:string;startsAt:string;significance?:number}[]}):{elapsedHours:number|null;events:Array<{title:string;summary:string;startsAt:string}>}{
  const now=input.now??new Date(),last=input.lastMessageAt?new Date(input.lastMessageAt):null;
  const validLast=last&&Number.isFinite(last.getTime())?last:null;
  const events=input.events.filter((event)=>new Date(event.startsAt)<=now&&(!validLast||new Date(event.startsAt)>validLast)).sort((a,b)=>Number(b.significance??.5)-Number(a.significance??.5)||b.startsAt.localeCompare(a.startsAt)).slice(0,2).map(({title,summary,startsAt})=>({title,summary,startsAt}));
  return{elapsedHours:validLast?Math.max(0,(now.getTime()-validLast.getTime())/3600000):null,events};
}

export function stableWorldPulseHash(value:string):number{let hash=2166136261;for(const character of value){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}

function tokenize(value:string){return new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter((term)=>term.length>2));}
function worldQuery(value:string){return /\b(?:what(?:'s| is) happening|around town|going on|tonight|this weekend|events?|weather|crowded|busy|open|where should|anything happening)\b/i.test(value);}
function localDate(value:string){return value.slice(0,10);}
function isPublicWorldHappening(event:WorldPulseEvent){
  const type=event.eventType.trim().toLowerCase(),metadata=event.metadata??{};
  if(type.startsWith('commitment_')||type.startsWith('schedule_')||type.startsWith('shared_plan_')||type.startsWith('plan_'))return false;
  if(metadata['canonicalPlanId']||metadata['commitmentBeat']||metadata['source']==='character_schedule')return false;
  return true;
}
function normalizeEventTitle(value:string){return value.trim().toLowerCase().replace(/^(?:getting ready for|heading to|waiting for you at)\s+/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
