export const schedulePriorities=['user_commitment','hard_obligation','recurring_routine','relationship_event','social_event','preferred_activity','spontaneous_activity'] as const;
export type SchedulePriority=typeof schedulePriorities[number];
export const scheduleVisibilities=['hidden','hint','known','shared'] as const;
export type ScheduleVisibility=typeof scheduleVisibilities[number];
export const interruptibilityLevels=['open','limited','busy','unavailable'] as const;
export type Interruptibility=typeof interruptibilityLevels[number];
export type OccupationPattern='fixed_weekdays'|'shifts'|'freelance'|'hybrid'|'remote'|'student'|'unemployed'|'custom';

export interface TimeRange { startMinute:number; endMinute:number }
export interface OccupationScheduleBlock {
  key:string;
  title:string;
  activityKey?:string;
  workDays:number[];
  startRange:TimeRange;
  durationMinutes:[number,number];
  primaryLocationId?:string;
  primaryLocationSlug?:string;
  locationCategories?:string[];
  activityVariants?:string[];
  breakPolicy?:'none'|'meal';
  probability?:number;
  recoverySleepMinutes?:[number,number];
  visibility?:ScheduleVisibility;
  interruptibility?:Interruptibility;
  metadata?:Record<string,unknown>;
}
export interface CharacterLifeProfile {
  version:number;
  occupation?:{title:string;primaryLocationId?:string;primaryLocationSlug?:string;workPattern:OccupationPattern;flexibility:number;workDays?:number[];startRange?:TimeRange;durationMinutes?:[number,number];activityVariants?:string[];breakPolicy?:'none'|'meal';scheduleBlocks?:OccupationScheduleBlock[]};
  sleep:{preferredBedtime:TimeRange;preferredWakeTime:TimeRange;variabilityMinutes:number;weekendShiftMinutes?:number};
  lifestyle:{social:number;adventurous:number;spontaneous:number;fitness:number;nightlife:number;outdoors:number;homebody:number;creativity:number};
  interests:string[];
  scheduling:{repetitionTolerance:number;spontaneity:number;preferredDailyActivityCount:[number,number]};
}
export interface LifeLocation {
  id:string; worldId:string; name:string; category:string; locationType:string;
  supportedActivities:string[]; tags:string[]; hours?:Record<string,unknown>;
  typicalDurationMinutes?:[number,number];
}
export interface ActivityTemplate {
  key:string; title:string; category:string; validTimeWindows:TimeRange[]; durationMinutes:[number,number];
  locationCategories:string[]; locationSlugs?:string[]; tags:string[]; affinity:number;
  preferredWeeklyFrequency:[number,number]; maximumWeeklyFrequency:number; minimumGapHours:number;
  energyRequirement?:'low'|'medium'|'high'; socialRequirement?:'solo'|'social'|'either';
  priority:Exclude<SchedulePriority,'user_commitment'|'hard_obligation'>; visibility:ScheduleVisibility;
  interruptibility:Interruptibility; activityLabel?:string; upcomingHint?:string;
  outcomeEligible?:boolean; outcomeProbability?:number; outcomeVariants?:string[]; rare?:boolean;
}
export interface ScheduleBlock {
  id?:string; activityKey:string; title:string; locationId:string|null; startsAt:string; endsAt:string;
  priority:SchedulePriority; visibility:ScheduleVisibility; source:'recurring'|'generated'|'user_plan'|'relationship'|'override';
  interruptibility:Interruptibility; participantInstanceIds?:string[]; generationKey:string; metadata?:Record<string,unknown>;
}
export interface ScheduleGenerationInput {
  characterInstanceId:string; seed:string; timezone:string; fromLocalDate:string; days:number;
  profile:CharacterLifeProfile; locations:LifeLocation[]; homeLocationId:string; activityTemplates:ActivityTemplate[];
  fixedCommitments?:ScheduleBlock[]; history?:ScheduleBlock[]; generationVersion?:string;
}
export interface CharacterPresence {
  characterInstanceId:string; locationId:string|null; activityKey:string; activity:string; scheduleEventId?:string;
  activityStartedAt:string; expectedEndAt?:string; state:'active'|'working'|'relaxing'|'sleeping'|'traveling'|'busy';
  interruptibility:Interruptibility; nextEvent?:ScheduleBlock; source:'plan'|'life_event'|'schedule'|'fallback';
}

const priorityRank:Record<SchedulePriority,number>={user_commitment:7,hard_obligation:6,recurring_routine:5,relationship_event:4,social_event:3,preferred_activity:2,spontaneous_activity:1};

export function generateScheduleWindow(input:ScheduleGenerationInput):ScheduleBlock[] {
  const output:ScheduleBlock[]=[];
  const history=[...(input.history??[])];
  const fixed=[...(input.fixedCommitments??[])].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  for(let dayIndex=0;dayIndex<input.days;dayIndex++){
    const localDate=addLocalDays(input.fromLocalDate,dayIndex);
    const daySeed=`${input.seed}:${localDate}:${input.generationVersion??'life_engine_v1'}`;
    const weekday=weekdayForLocalDate(localDate);
    const daily:ScheduleBlock[]=[];
    const relevantFixed=fixed.filter((event)=>localDateKey(event.startsAt,input.timezone)===localDate||localDateKey(new Date(new Date(event.endsAt).getTime()-1),input.timezone)===localDate);
    daily.push(...relevantFixed);
    addSleep(daily,input,localDate,weekday,daySeed);
    addOccupation(daily,input,localDate,weekday,daySeed);
    const target=randomInRange(input.profile.scheduling.preferredDailyActivityCount,`${daySeed}:count`);
    for(let slot=0;slot<target;slot++){
      const candidate=selectActivity(input,localDate,weekday,slot,[...history,...output,...daily],daySeed);
      if(candidate)daily.push(candidate);
    }
    const normalized=resolveConflicts(daily).sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
    output.push(...normalized);history.push(...normalized);
  }
  // Overnight work and recovery blocks can cross into the next local date.
  // Resolve the full window once more so the following day's sleep/routine can
  // never overlap a carried obligation.
  return insertTravel(resolveConflicts(output).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)),input,input.fromLocalDate,`${input.seed}:window`);
}

export function resolvePresence(events:readonly ScheduleBlock[],now:Date,fallback:{characterInstanceId:string;locationId:string|null;activity?:string}):CharacterPresence {
  const sorted=[...events].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  const active=sorted.filter((event)=>new Date(event.startsAt)<=now&&new Date(event.endsAt)>now).sort((a,b)=>priorityRank[b.priority]-priorityRank[a.priority])[0];
  const next=sorted.find((event)=>new Date(event.startsAt)>now);
  if(!active)return{characterInstanceId:fallback.characterInstanceId,locationId:fallback.locationId,activityKey:'unstructured_time',activity:fallback.activity??'Having some unstructured time at home',activityStartedAt:now.toISOString(),interruptibility:'open',state:'relaxing',...(next?{nextEvent:next}:{}),source:'fallback'};
  const activityLabel=active.metadata?.['activityLabel'];
  return{characterInstanceId:fallback.characterInstanceId,locationId:active.locationId,activityKey:active.activityKey,activity:typeof activityLabel==='string'?activityLabel:active.title,...(active.id?{scheduleEventId:active.id}:{}),activityStartedAt:active.startsAt,expectedEndAt:active.endsAt,interruptibility:active.interruptibility,state:presenceState(active),...(next?{nextEvent:next}:{}),source:active.priority==='user_commitment'?'plan':'schedule'};
}

export function validateSchedule(events:readonly ScheduleBlock[],locations:readonly LifeLocation[],timezone:string){
  const issues:string[]=[];const sorted=[...events].sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
  for(let index=0;index<sorted.length;index++){
    const event=sorted[index]!,start=new Date(event.startsAt),end=new Date(event.endsAt);
    if(!(end>start))issues.push(`invalid-duration:${event.generationKey}`);
    const next=sorted[index+1];if(next&&new Date(next.startsAt)<end)issues.push(`overlap:${event.generationKey}:${next.generationKey}`);
    const location=locations.find((item)=>item.id===event.locationId);
    if(location&&event.metadata?.['allowOutsidePublicHours']!==true&&!locationOpen(location,start,end,timezone))issues.push(`closed-location:${event.generationKey}`);
  }
  const sleepByDay=new Map<string,{hours:number;hasMorning:boolean}>();for(const event of events.filter((item)=>item.activityKey==='sleep')){const start=new Date(event.startsAt),startDate=localDateKey(start,timezone),minute=minuteInZone(start,timezone),key=minute>=18*60?addLocalDays(startDate,1):startDate,current=sleepByDay.get(key)??{hours:0,hasMorning:false};sleepByDay.set(key,{hours:current.hours+(new Date(event.endsAt).getTime()-start.getTime())/3600000,hasMorning:current.hasMorning||minute<18*60});}
  const firstGeneratedDate=sorted[0]?localDateKey(sorted[0].startsAt,timezone):null;
  for(const [day,sleep] of sleepByDay)if(day!==firstGeneratedDate&&sleep.hasMorning&&sleep.hours<5.5)issues.push(`missing-sleep:${day}`);
  return issues;
}

function addSleep(events:ScheduleBlock[],input:ScheduleGenerationInput,date:string,weekday:number,seed:string){
  const weekend=[0,6].includes(weekday)?Number(input.profile.sleep.weekendShiftMinutes??0):0;
  const wake=clampMinute(midpoint(input.profile.sleep.preferredWakeTime)+weekend+signedVariation(seed+':wake',input.profile.sleep.variabilityMinutes));
  const bedtimeMidpoint=midpoint(input.profile.sleep.preferredBedtime);
  const bedtimeBase=input.profile.sleep.preferredBedtime.endMinute<input.profile.sleep.preferredBedtime.startMinute&&bedtimeMidpoint<wake?bedtimeMidpoint+1440:bedtimeMidpoint;
  const bed=clampMinute(bedtimeBase+weekend+signedVariation(seed+':bed',input.profile.sleep.variabilityMinutes));
  pushIfFree(events,block(input,date,0,wake,'sleep','Sleeping',input.homeLocationId,'recurring_routine','hidden','recurring','unavailable',`${date}:sleep:morning`));
  if(bed>wake&&bed<1440)pushIfFree(events,block(input,date,bed,1440,'sleep','Sleeping',input.homeLocationId,'recurring_routine','hidden','recurring','unavailable',`${date}:sleep:night`));
}

function addOccupation(events:ScheduleBlock[],input:ScheduleGenerationInput,date:string,weekday:number,seed:string){
  const job=input.profile.occupation;if(!job||job.workPattern==='unemployed')return;
  if(job.scheduleBlocks?.length){
    for(const configured of job.scheduleBlocks){
      if(!configured.workDays.includes(weekday))continue;
      const probability=Math.max(0,Math.min(1,configured.probability??1));
      if((stableHash(`${seed}:occupation:${configured.key}:probability`)%10000)/10000>=probability)continue;
      addOccupationBlock(events,input,date,seed,configured);
    }
    return;
  }
  const days=job.workDays??defaultWorkDays(job.workPattern,seed);if(!days.includes(weekday))return;
  const range=job.startRange??({startMinute:9*60,endMinute:10*60});
  const start=range.startMinute+stableHash(seed+':work-start')%Math.max(1,range.endMinute-range.startMinute+1);
  const duration=randomInRange(job.durationMinutes??defaultWorkDuration(job.workPattern),seed+':work-duration');
  const location=job.primaryLocationId??chooseWorkLocation(input.locations,job.workPattern,input.homeLocationId,seed);
  const end=start+duration;
  const title=occupationActivity(job.title,job.activityVariants,seed);
  if(duration>=360&&(job.breakPolicy??'meal')==='meal'&&end<=1440){
    const lunchStart=Math.min(end-45,start+180+(stableHash(seed+':lunch')%75));
    pushIfFree(events,block(input,date,start,lunchStart,'work',title,location,'hard_obligation','known','recurring','busy',`${date}:work:am`,{activityLabel:title,occupationTitle:job.title,allowOutsidePublicHours:true}));
    const lunchLocation=chooseLocation(input.locations,{locationCategories:['cafe','restaurant'],locationSlugs:[],tags:['food'],key:'lunch'},input.homeLocationId,seed+':lunch-location',[],date,lunchStart,lunchStart+45,input.timezone)??location;
    pushIfFree(events,block(input,date,lunchStart,lunchStart+45,'lunch_break','Taking a meal break',lunchLocation,'recurring_routine','hidden','generated','limited',`${date}:work:lunch`,{activityLabel:'Taking a meal break'}));
    const afternoon=occupationActivity(job.title,job.activityVariants,seed+':pm');
    pushIfFree(events,block(input,date,lunchStart+45,end,'work',afternoon,location,'hard_obligation','known','recurring','busy',`${date}:work:pm`,{activityLabel:afternoon,occupationTitle:job.title,allowOutsidePublicHours:true}));
  }else pushIfFree(events,block(input,date,start,end,'work',title,location,'hard_obligation','known','recurring','busy',`${date}:work`,{activityLabel:title,occupationTitle:job.title,allowOutsidePublicHours:true}));
}

function addOccupationBlock(events:ScheduleBlock[],input:ScheduleGenerationInput,date:string,seed:string,configured:OccupationScheduleBlock){
  const range=configured.startRange;
  const start=range.startMinute+stableHash(`${seed}:${configured.key}:start`)%Math.max(1,range.endMinute-range.startMinute+1);
  const duration=randomInRange(configured.durationMinutes,`${seed}:${configured.key}:duration`),end=start+duration;
  const configuredLocation=configured.primaryLocationId??findLocationBySlug(input.locations,configured.primaryLocationSlug);
  const location=configuredLocation??chooseLocation(input.locations,{locationCategories:configured.locationCategories??['work','office','studio'],locationSlugs:configured.primaryLocationSlug?[configured.primaryLocationSlug]:[],tags:['work'],key:configured.activityKey??configured.key},input.homeLocationId,`${seed}:${configured.key}:location`,[],date,start,end,input.timezone)??input.homeLocationId;
  const title=occupationActivity(configured.title,configured.activityVariants,`${seed}:${configured.key}`);
  const activityKey=configured.activityKey??`occupation_${configured.key}`;
  const metadata={...(configured.metadata??{}),activityLabel:title,occupationBlockKey:configured.key,occupationTitle:configured.title,upcomingHint:typeof configured.metadata?.['upcomingHint']==='string'?configured.metadata['upcomingHint']:`${configured.title} later`,allowOutsidePublicHours:true};
  if(duration>=360&&(configured.breakPolicy??'none')==='meal'&&end<=1440){
    const mealStart=Math.min(end-45,start+180+(stableHash(`${seed}:${configured.key}:meal`)%75));
    pushIfFree(events,block(input,date,start,mealStart,activityKey,title,location,'hard_obligation',configured.visibility??'known','recurring',configured.interruptibility??'busy',`${date}:occupation:${configured.key}:before-meal`,metadata));
    const mealLocation=chooseLocation(input.locations,{locationCategories:['cafe','restaurant'],locationSlugs:[],tags:['food'],key:'meal_break'},input.homeLocationId,`${seed}:${configured.key}:meal-location`,[],date,mealStart,mealStart+45,input.timezone)??location;
    pushIfFree(events,block(input,date,mealStart,mealStart+45,'meal_break','Taking a meal break',mealLocation,'recurring_routine','hidden','generated','limited',`${date}:occupation:${configured.key}:meal`,{activityLabel:'Taking a meal break'}));
    const resumed=occupationActivity(configured.title,configured.activityVariants,`${seed}:${configured.key}:resumed`);
    pushIfFree(events,block(input,date,mealStart+45,end,activityKey,resumed,location,'hard_obligation',configured.visibility??'known','recurring',configured.interruptibility??'busy',`${date}:occupation:${configured.key}:after-meal`,{...metadata,activityLabel:resumed}));
  }else{
    pushIfFree(events,block(input,date,start,end,activityKey,title,location,'hard_obligation',configured.visibility??'known','recurring',configured.interruptibility??'busy',`${date}:occupation:${configured.key}`,metadata));
  }
  if(end>1440&&configured.recoverySleepMinutes){
    const recoveryStart=end+30,recoveryDuration=randomInRange(configured.recoverySleepMinutes,`${seed}:${configured.key}:recovery`);
    pushIfFree(events,block(input,date,recoveryStart,recoveryStart+recoveryDuration,'sleep','Sleeping after a late shift',input.homeLocationId,'recurring_routine','hidden','generated','unavailable',`${date}:occupation:${configured.key}:recovery`,{activityLabel:'Sleeping after a late shift',recoveryFrom:configured.key}));
  }
}

function selectActivity(input:ScheduleGenerationInput,date:string,weekday:number,slot:number,recent:ScheduleBlock[],seed:string){
  const windows=slot===0?[{startMinute:8*60,endMinute:12*60}]:slot===1?[{startMinute:12*60,endMinute:17*60}]:[{startMinute:17*60,endMinute:23*60}];
  const scored=input.activityTemplates.map(template=>{
    const occurrences=recent.filter(item=>item.activityKey===template.key&&hoursApart(item.endsAt,localToUtc(date,0,input.timezone))<=7*24);
    const last=occurrences.sort((a,b)=>b.endsAt.localeCompare(a.endsAt))[0];
    if(occurrences.length>=template.maximumWeeklyFrequency)return null;
    if(last&&hoursApart(last.endsAt,localToUtc(date,windows[0]!.startMinute,input.timezone))<template.minimumGapHours)return null;
    const lifestyle=activityLifestyleFit(template,input.profile);
    const frequencyPressure=Math.max(0,template.preferredWeeklyFrequency[0]-occurrences.length)*12;
    const repetitionPenalty=occurrences.length*18*(1-input.profile.scheduling.repetitionTolerance);
    const score=template.affinity*60+lifestyle+frequencyPressure-repetitionPenalty+(stableHash(`${seed}:${slot}:${template.key}`)%2200)/100;
    return{template,score};
  }).filter((item):item is {template:ActivityTemplate;score:number}=>Boolean(item)).sort((a,b)=>b.score-a.score);
  for(const {template,score} of scored.slice(0,6)){
    const preferred=template.validTimeWindows.length?template.validTimeWindows:windows;
    const window=preferred[stableHash(`${seed}:${slot}:${template.key}:window`)%preferred.length]!;
    const duration=randomInRange(template.durationMinutes,`${seed}:${slot}:${template.key}:duration`);
    const earliest=Math.max(window.startMinute,slot===0?8*60:slot===1?12*60:17*60);
    const latest=Math.min(window.endMinute-duration,slot===0?12*60:slot===1?17*60:23*60);
    if(latest<earliest)continue;
    const start=earliest+stableHash(`${seed}:${slot}:${template.key}:start`)%Math.max(1,latest-earliest+1);
    const location=chooseLocation(input.locations,template,input.homeLocationId,`${seed}:${slot}:${template.key}:location`,recent,date,start,start+duration,input.timezone);
    if(!location)continue;
    const event=block(input,date,start,start+duration,template.key,template.title,location,template.priority,template.visibility,'generated',template.interruptibility,`${date}:activity:${slot}:${template.key}`,{score,reasons:['character affinity','time fit','location open',...(score>70?['routine pressure']:[])],activityLabel:template.activityLabel??template.title,upcomingHint:template.upcomingHint,outcomeEligible:template.outcomeEligible??false,outcomeProbability:template.outcomeProbability??0,outcomeVariants:template.outcomeVariants??[],rare:template.rare??false,weekday});
    if(!overlapsAny(event,recent.filter(item=>localDateKey(item.startsAt,input.timezone)===date)))return event;
  }
  return null;
}

function insertTravel(events:ScheduleBlock[],input:ScheduleGenerationInput,date:string,seed:string){
  const out:ScheduleBlock[]=[];
  for(const originalEvent of events){
    let event=originalEvent;
    let previous=out[out.length-1];
    if(previous&&previous.locationId&&event.locationId&&previous.locationId!==event.locationId){
      const minutes=travelMinutes(previous.locationId,event.locationId,seed+event.generationKey);
      let desiredStart=new Date(event.startsAt).getTime()-minutes*60000;
      const previousEnd=new Date(previous.endsAt).getTime();
      if(desiredStart<previousEnd){
        const shortenedEnd=desiredStart;
        const shortenedDuration=(shortenedEnd-new Date(previous.startsAt).getTime())/60000;
        if(previous.source!=='user_plan'&&shortenedDuration>=30){
          previous={...previous,endsAt:new Date(shortenedEnd).toISOString(),metadata:{...previous.metadata,travelAdjusted:true}};
          out[out.length-1]=previous;
        }else if(event.source!=='user_plan'){
          const shiftedStart=previousEnd+minutes*60000;
          const shiftedDuration=(new Date(event.endsAt).getTime()-shiftedStart)/60000;
          if(shiftedDuration>=30){
            event={...event,startsAt:new Date(shiftedStart).toISOString(),metadata:{...event.metadata,travelAdjusted:true}};
            desiredStart=previousEnd;
          }
        }
      }
      if(desiredStart>=new Date(previous.endsAt).getTime())out.push({...block(input,date,0,1,'travel','On the move',null,'recurring_routine','hidden','generated','limited',`${event.generationKey}:travel`,{fromLocationId:previous.locationId,toLocationId:event.locationId,activityLabel:'On the move'}),startsAt:new Date(desiredStart).toISOString(),endsAt:event.startsAt});
    }
    out.push(event);
  }
  return out;
}

function block(input:ScheduleGenerationInput,date:string,start:number,end:number,key:string,title:string,locationId:string|null,priority:SchedulePriority,visibility:ScheduleVisibility,source:ScheduleBlock['source'],interruptibility:Interruptibility,generationKey:string,metadata:Record<string,unknown>={}):ScheduleBlock{return{activityKey:key,title,locationId,startsAt:localToUtc(date,start,input.timezone).toISOString(),endsAt:localToUtc(date,end,input.timezone).toISOString(),priority,visibility,source,interruptibility,generationKey:`${input.generationVersion??'life_engine_v1'}:${generationKey}`,metadata};}
function pushIfFree(events:ScheduleBlock[],event:ScheduleBlock){const conflicts=events.filter(item=>overlaps(item,event));if(!conflicts.length){events.push(event);return;}if(conflicts.every(item=>priorityRank[event.priority]>priorityRank[item.priority])){for(const conflict of conflicts){const index=events.indexOf(conflict);if(index>=0)events.splice(index,1);}events.push(event);}}
function resolveConflicts(events:ScheduleBlock[]){return [...events].sort((a,b)=>priorityRank[b.priority]-priorityRank[a.priority]||a.startsAt.localeCompare(b.startsAt)).reduce<ScheduleBlock[]>((kept,event)=>{const conflicts=kept.filter(item=>overlaps(item,event));if(!conflicts.length)kept.push(event);return kept;},[]);}
function overlapsAny(event:ScheduleBlock,events:readonly ScheduleBlock[]){return events.some(item=>overlaps(item,event));}
function overlaps(a:ScheduleBlock,b:ScheduleBlock){return new Date(a.startsAt)<new Date(b.endsAt)&&new Date(b.startsAt)<new Date(a.endsAt);}
function presenceState(event:ScheduleBlock):CharacterPresence['state']{if(event.activityKey==='sleep')return'sleeping';if(event.activityKey==='travel')return'traveling';if(event.activityKey==='work'||event.activityKey.startsWith('occupation_'))return'working';if(event.interruptibility==='busy'||event.interruptibility==='unavailable')return'busy';if(/home|read|cook|relax/.test(event.activityKey))return'relaxing';return'active';}
function chooseWorkLocation(locations:LifeLocation[],pattern:OccupationPattern,home:string,seed:string){if(pattern==='remote'&&stableHash(seed)%100<70)return home;return locations.find(item=>['work','studio','office'].some(tag=>`${item.category} ${item.tags.join(' ')}`.toLowerCase().includes(tag)))?.id??home;}
function chooseLocation(locations:LifeLocation[],template:Pick<ActivityTemplate,'locationCategories'|'locationSlugs'|'tags'|'key'>,home:string,seed:string,recent:ScheduleBlock[],date?:string,startMinute?:number,endMinute?:number,timezone?:string):string|null{const candidates=locations.filter(location=>(template.locationSlugs?.includes(slug(location.name))||template.locationCategories.includes(location.category)||template.locationCategories.includes(location.locationType)||template.tags.some(tag=>location.tags.includes(tag))||location.supportedActivities.includes(template.key))&&(!date||startMinute===undefined||endMinute===undefined||!timezone||locationOpen(location,localToUtc(date,startMinute,timezone),localToUtc(date,endMinute,timezone),timezone)));if(!candidates.length)return template.locationCategories.includes('residence')||template.locationCategories.includes('home')?home:null;return candidates.map(location=>({location,score:(stableHash(`${seed}:${location.id}`)%1000)/100-recent.filter(item=>item.locationId===location.id).length*4})).sort((a,b)=>b.score-a.score)[0]!.location.id;}
function activityLifestyleFit(template:ActivityTemplate,profile:CharacterLifeProfile){const text=`${template.key} ${template.category} ${template.tags.join(' ')}`;let score=0;if(/photo|art|creative|music|book/.test(text))score+=profile.lifestyle.creativity*24;if(/park|walk|outdoor/.test(text))score+=profile.lifestyle.outdoors*22;if(/gym|fitness/.test(text))score+=profile.lifestyle.fitness*24;if(/bar|night|club|music/.test(text))score+=profile.lifestyle.nightlife*20;if(/social|friend|drink|dinner/.test(text))score+=profile.lifestyle.social*18;if(/home|read|cook|relax/.test(text))score+=profile.lifestyle.homebody*18;return score;}
function occupationActivity(title:string,variants:string[]|undefined,seed:string){const authored=(variants??[]).filter(value=>value.trim().length>0);if(authored.length)return authored[stableHash(seed)%authored.length]!;return`Working as ${article(title)} ${title}`;}
function article(value:string){return /^[aeiou]/i.test(value.trim())?'an':'a';}
function findLocationBySlug(locations:LifeLocation[],value:string|undefined){if(!value)return undefined;return locations.find(location=>slug(location.name)===value)?.id;}
function defaultWorkDays(pattern:OccupationPattern,seed:string){if(pattern==='shifts')return[0,1,3,5].map(day=>(day+stableHash(seed)%2)%7);if(pattern==='freelance')return[1,2,4,5];if(pattern==='student')return[1,2,3,4];return[1,2,3,4,5];}
function defaultWorkDuration(pattern:OccupationPattern):[number,number]{if(pattern==='shifts')return[420,720];if(pattern==='freelance')return[240,420];if(pattern==='student')return[180,360];return[450,510];}
function travelMinutes(from:string,to:string,seed:string){return 10+stableHash(`${from}:${to}:${seed}`)%17;}
function locationOpen(location:LifeLocation,start:Date,end:Date,timezone:string){
  if(!location.hours||Object.keys(location.hours).length===0)return true;
  const weekday=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short'}).format(start).toLowerCase().slice(0,3);
  const raw=location.hours[weekday]??location.hours['default']??location.hours;
  if(raw==='closed'||(isRecord(raw)&&raw['closed']===true))return false;
  const windows=openingWindows(raw);
  if(!windows.length)return true;
  const startMinute=minuteInZone(start,timezone),endMinute=minuteInZone(end,timezone);
  return windows.some(([open,close])=>close<open?(startMinute>=open||endMinute<=close):startMinute>=open&&endMinute<=close);
}
function openingWindows(raw:unknown):Array<[number,number]>{
  if(Array.isArray(raw)){
    if(raw.length===2&&raw.every(value=>typeof value==='string')){const pair=timePair(raw[0],raw[1]);return pair?[pair]:[];}
    return raw.flatMap(openingWindows);
  }
  if(typeof raw==='string'){
    const match=raw.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
    if(!match)return[];
    return[[Number(match[1])*60+Number(match[2]??0),Number(match[3])*60+Number(match[4]??0)]];
  }
  if(isRecord(raw)){
    const open=raw['open']??raw['opensAt']??raw['start'];
    const close=raw['close']??raw['closesAt']??raw['end'];
    const pair=timePair(open,close);
    if(pair)return[pair];
    const nested=raw['windows']??raw['periods'];
    return nested===undefined?[]:openingWindows(nested);
  }
  return[];
}
function timePair(open:unknown,close:unknown):[number,number]|null{const start=parseClock(open),end=parseClock(close);return start===null||end===null?null:[start,end];}
function parseClock(value:unknown){if(typeof value!=='string')return null;const match=value.match(/^(\d{1,2})(?::(\d{2}))?$/);if(!match)return null;const hour=Number(match[1]),minute=Number(match[2]??0);return hour<=24&&minute<60?hour*60+minute:null;}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
export function localToUtc(localDate:string,minute:number,timezone:string){const dayOffset=Math.floor(minute/1440),normalized=((minute%1440)+1440)%1440,date=addLocalDays(localDate,dayOffset);const desired=Date.parse(`${date}T${String(Math.floor(normalized/60)).padStart(2,'0')}:${String(normalized%60).padStart(2,'0')}:00Z`);let candidate=new Date(desired);for(let attempt=0;attempt<4;attempt++){const actual=localParts(candidate,timezone),actualStamp=Date.parse(`${actual.date}T${actual.time}:00Z`);const delta=desired-actualStamp;if(!delta)break;candidate=new Date(candidate.getTime()+delta);}return candidate;}
function localParts(date:Date,timezone:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:string)=>parts.find(item=>item.type===type)?.value??'00';return{date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};}
function localDateKey(value:string|Date,timezone:string){return localParts(typeof value==='string'?new Date(value):value,timezone).date;}
function minuteInZone(value:Date,timezone:string){const time=localParts(value,timezone).time.split(':').map(Number);return time[0]!*60+time[1]!;}
function weekdayForLocalDate(date:string){return new Date(`${date}T12:00:00Z`).getUTCDay();}
function addLocalDays(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function randomInRange(range:[number,number],seed:string){return range[0]+stableHash(seed)%Math.max(1,range[1]-range[0]+1);}
function midpoint(range:TimeRange){const span=range.endMinute>=range.startMinute?range.endMinute-range.startMinute:1440-range.startMinute+range.endMinute;return Math.round((range.startMinute+span/2)%1440);}
function signedVariation(seed:string,max:number){return max?stableHash(seed)%(max*2+1)-max:0;}
function clampMinute(value:number){return Math.max(0,Math.min(1440,value));}
function hoursApart(a:string,b:Date){return Math.abs(b.getTime()-new Date(a).getTime())/3600000;}
function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
export function stableScheduleHash(value:string){return stableHash(value);}
function stableHash(value:string){let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
