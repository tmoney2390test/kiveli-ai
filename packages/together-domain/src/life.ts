import type{CharacterLifeState,LifeEventTemplate,ScheduleEntry,SimulatedLifeEvent}from'./types';

export type LifeSimulationTrigger='conversation_continued'|'home_opened'|'scheduled_dispatch';
export function shouldMaterializeLifeEvents(trigger:LifeSimulationTrigger):boolean{return trigger==='conversation_continued';}

export function resolveCharacterState(entries:readonly ScheduleEntry[],timestamp:Date,seed='maya'):CharacterLifeState{
  const minute=timestamp.getHours()*60+timestamp.getMinutes(),day=timestamp.getDay();
  const entry=entries.find((candidate)=>candidate.dayOfWeek===day&&minute>=candidate.startMinute&&minute<candidate.endMinute)??fallback(timestamp);
  const variation=hash(`${seed}:${timestamp.toISOString().slice(0,10)}`)%7;
  const energyScore=(minute<9*60?0:minute>21*60?-1:1)+entry.energyDelta+(variation===0?-1:0);
  return{location:entry.location,activity:entry.activity,availability:entry.availability,mood:entry.moodInfluence??(variation===1?'thoughtful':variation===2?'playful':'content'),energy:energyScore<=0?'low':energyScore>=2?'high':'medium',resolvedAt:timestamp.toISOString()};
}
export function simulateSince(lastSimulatedAt:Date,now:Date,templates:readonly LifeEventTemplate[],seed='maya'):SimulatedLifeEvent[]{
  const elapsed=Math.max(0,now.getTime()-lastSimulatedAt.getTime()),days=Math.min(30,Math.floor(elapsed/86400000));if(days<1||!templates.length)return[];
  const candidates:SimulatedLifeEvent[]=[];const used=new Set<string>();
  for(let day=1;day<=days;day++){
    const date=new Date(lastSimulatedAt.getTime()+Math.min(elapsed-1,day*86400000));
    const ranked=[...templates].sort((a,b)=>(hash(`${seed}:${date.toISOString().slice(0,10)}:${a.id}`)%10000)/10000-(hash(`${seed}:${date.toISOString().slice(0,10)}:${b.id}`)%10000)/10000);
    const pick=ranked.find((item)=>!used.has(item.id)&&(hash(`${seed}:chance:${date.toISOString().slice(0,10)}:${item.id}`)%10000)/10000<Math.max(.04,Math.min(.8,item.significance*.28)));
    if(!pick||pick.significance<.45)continue;used.add(pick.id);date.setUTCHours(12+(hash(`${seed}:hour:${date.toISOString().slice(0,10)}`)%8),hash(`${seed}:minute:${date.toISOString().slice(0,10)}`)%60,0,0);candidates.push({...pick,occurredAt:date.toISOString(),userVisible:pick.significance>=.55});
  }
  return candidates.sort((a,b)=>b.significance-a.significance||b.occurredAt.localeCompare(a.occurredAt)).slice(0,2).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
}
export function shouldInitiateMessage(input:{event?:LifeEventTemplate;hoursSinceConversation:number;hoursSinceProactive?:number;quietHours:boolean;relationshipStage:string;seed:string}):boolean{
  if(input.quietHours||input.hoursSinceConversation<5||(input.hoursSinceProactive??Infinity)<18||!input.event?.proactiveEligible||input.event.significance<.55)return false;
  const stageWeight=['friend','flirting','dating','exclusive','long_term'].includes(input.relationshipStage)?35:10;
  return(hash(input.seed)%100)<Math.min(72,stageWeight+Math.floor(input.hoursSinceConversation));
}
export function isQuietHours(now:Date,start='23:00',end='08:00',timezone='UTC'):boolean{
  const minute=localMinute(now,timezone),startMinute=parseMinute(start),endMinute=parseMinute(end);return startMinute>endMinute?minute>=startMinute||minute<endMinute:minute>=startMinute&&minute<endMinute;
}
export function composeProactiveMessage(input:{eventTitle?:string;eventSummary?:string;threadSubject?:string;relationshipStage:string;memory?:string}):string{
  if(input.threadSubject)return`Hey—how did your ${input.threadSubject} go? You mentioned it was important.`;
  const title=input.eventTitle??'';
  if(/coffee with chloe/i.test(title))return'Chloe just tried to talk me into rooftop trivia. Her confidence is wildly outpacing our actual chances.';
  if(/client cancels/i.test(title))return'My client canceled at the last minute, so I suddenly have an afternoon I did not plan for. Weirdly freeing.';
  if(/stressful client/i.test(title))return'I survived a client who used the phrase “make it pop” six times. I deserve a very specific kind of coffee now.';
  if(/successful photo/i.test(title))return'I just wrapped a shoot I’m actually proud of. There’s one frame I keep going back to.';
  if(/old camera/i.test(title))return'I found an old camera while reorganizing, and now I have a mildly irresponsible weekend idea.';
  if(/trivia/i.test(title))return'Alex is trying to recruit us for Northside trivia. I have concerns about how confident he is.';
  if(/reminder of the user/i.test(title)&&input.memory)return`Something on my photo walk reminded me of what you said about ${memoryCallback(input.memory)}. Not a dramatic story—just a nice little callback.`;
  return input.eventSummary?.trim()||'Something happened in the city today that I think you would appreciate.';
}
function fallback(timestamp:Date):ScheduleEntry{return{dayOfWeek:timestamp.getDay(),startMinute:0,endMinute:1440,location:"Maya's Apartment",activity:timestamp.getHours()<8?'sleeping':timestamp.getHours()>21?'winding down':'taking care of a few things',availability:timestamp.getHours()<8?'busy':'available',energyDelta:0};}
function hash(value:string):number{let result=2166136261;for(let index=0;index<value.length;index++){result^=value.charCodeAt(index);result=Math.imul(result,16777619);}return result>>>0;}
function parseMinute(value:string):number{const[hour='0',minute='0']=value.split(':');return Number(hour)*60+Number(minute);}
function localMinute(now:Date,timezone:string):number{try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);return Number(parts.find((part)=>part.type==='hour')?.value??0)*60+Number(parts.find((part)=>part.type==='minute')?.value??0);}catch{return now.getUTCHours()*60+now.getUTCMinutes();}}
function memoryCallback(memory:string):string{return memory.replace(/^User's\s+/i,'your ').replace(/^User\s+(?:likes|dislikes|feels|has|is)\s+/i,'').replace(/[.!]$/,'').slice(0,80);}
