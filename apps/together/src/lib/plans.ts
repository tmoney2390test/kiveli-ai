import type { DateSession, Location, ScheduleItem, SharedPlan } from '../types';

export type PlanActivityId=string;
export type PlanSource='chat'|'location'|'world'|'discover'|'home'|'story';
export type PlanDiscoveryIntent='tonight'|'date_night'|'casual'|'different'|'liked'|'companion_pick';
export type PlanDraft={
  companionId:string;
  activityIntent?:string;
  locationId?:string;
  date?:string;
  startsAt?:string;
  durationMinutes?:number;
  note?:string;
  source:PlanSource;
  confidence:{activity?:number;location?:number;time?:number};
};
export type PlanOption={id:string;title:string;description:string;locationId:string;locationName:string;activityKey:string;source:'location_activity'|'date'|'curated';tags:string[];durationMinutes:number;reason:string;hours?:Record<string,unknown>;score?:number;qualityLabel?:string};
export type PlanContext={activity:string;mood:string;locationId?:string|null;interests?:string[];userInterests?:string[];preferences?:string[];personality?:Record<string,number>;relationshipStage:string;hour?:number;locations:Location[];scopedLocationId?:string|null;chooseElsewhere?:boolean;previousPlans?:SharedPlan[];intent?:PlanDiscoveryIntent};
export type PlanSlot={label:string;detail:string;value:string;reason?:string;best?:boolean};
export type ResolvedPlanDraft={draft:PlanDraft;option?:PlanOption;slots:PlanSlot[];missing:Array<'activity'|'location'|'time'>;ready:boolean};

export function resolvePlanDraft(draft:PlanDraft,context:PlanContext&{schedules?:ScheduleItem[];plans?:SharedPlan[];dates?:DateSession[]}):ResolvedPlanDraft{
  const options=recommendPlanOptions({...context,scopedLocationId:draft.locationId??context.scopedLocationId});
  const activity=normalize(draft.activityIntent??'');
  const option=options.find((item)=>item.locationId===draft.locationId&&(!activity||matchesActivity(item,activity)))
    ??options.find((item)=>!activity||matchesActivity(item,activity))
    ??options[0];
  const resolved:PlanDraft={...draft,activityIntent:draft.activityIntent??option?.activityKey,locationId:draft.locationId??option?.locationId,durationMinutes:draft.durationMinutes??option?.durationMinutes,confidence:{activity:draft.confidence.activity??(draft.activityIntent?1:option?.id?.endsWith(':unknown')?.5:.76),location:draft.confidence.location??(draft.locationId?1:option?.score&&option.score>2?.9:.72),time:draft.confidence.time??(draft.startsAt?1:.65)}};
  const slots=draft.startsAt?[{label:'Selected time',detail:formatPlanDate(new Date(draft.startsAt)),value:draft.startsAt,reason:'The time you chose',best:true}]:buildPlanSlots({option,schedules:context.schedules,plans:context.plans,dates:context.dates});
  const missing:Array<'activity'|'location'|'time'>=[];
  if(!resolved.activityIntent)missing.push('activity');if(!resolved.locationId)missing.push('location');if(!resolved.startsAt&&!slots.length)missing.push('time');
  return{draft:resolved,option,slots,missing,ready:Boolean(option&&(draft.startsAt||slots[0]))};
}

export function companionPick(context:PlanContext){return recommendPlanOptions({...context,intent:'companion_pick'})[0];}

export function companionPickQuote(name:string,option:PlanOption,personality:Record<string,number>={}){
  if((personality.adventurous??personality.spontaneous??0)>.72)return`“${option.locationName}. I’m choosing something we’ll actually remember.”`;
  if((personality.homebody??personality.introspective??personality.thoughtful??0)>.72)return`“${option.locationName}. Good conversation, no fighting to hear each other.”`;
  if((personality.playful??personality.witty??personality.sarcastic??0)>.68)return`“${option.locationName}. I need to know whether your confidence is earned.”`;
  return`“${option.locationName} feels right for us. Let me have this one.”`;
}

export function recommendPlanOptions(context:PlanContext):PlanOption[]{
  const available=context.locations.filter((location)=>location.category!=='home'&&location.category!=='work'&&location.metadata?.private!==true);
  const scoped=context.scopedLocationId&&!context.chooseElsewhere?available.filter((location)=>location.id===context.scopedLocationId):available;
  const companionWords=normalize(`${context.activity} ${context.mood} ${(context.interests??[]).join(' ')}`);
  const userWords=normalize(`${(context.userInterests??[]).join(' ')} ${(context.preferences??[]).join(' ')}`);
  const dislikes=extractDislikes(context.preferences??[]);
  const romantic=['flirting','dating','exclusive','long_term'].includes(context.relationshipStage);
  const hour=context.hour??new Date().getHours();
  const history=context.previousPlans??[];
  return scoped.flatMap((location)=>activityLabels(location).map((activity,index)=>{
    const activityKey=normalize(activity).replace(/\s+/g,'_');const tags=locationTags(location,activity);let score=-index*.001;
    for(const tag of tags){if(companionWords.includes(normalize(tag)))score+=1.15;if(userWords.includes(normalize(tag)))score+=1.35;if(dislikes.some((word)=>normalize(tag).includes(word)))score-=8;}
    if(romantic&&tags.includes('romantic'))score+=1.1;if(!romantic&&tags.includes('romantic'))score-=1.1;
    if(location.id===context.locationId)score+=.15;
    if(hour>=17&&['nightlife','music','bar','lounge','cinema'].some((tag)=>tags.includes(tag)))score+=.7;
    if(hour<16&&['coffee','bakery','park','gallery','bookstore'].some((tag)=>tags.includes(tag)))score+=.7;
    score+=personalityFit(tags,context.personality??{});
    const completed=history.filter((plan)=>plan.location_id===location.id&&plan.status==='completed');
    const recent=history.filter((plan)=>plan.location_id===location.id&&new Date(plan.starts_at).getTime()>Date.now()-30*86400000).length;
    if(context.intent==='liked'&&completed.length)score+=3;else if(completed.length)score+=.45;
    if(context.intent==='different')score-=recent*2.2;else score-=Math.max(0,recent-1)*.8;
    if(context.intent==='date_night')score+=tags.some((tag)=>['romantic','restaurant','nightlife','rooftop'].includes(tag))?2:-.6;
    if(context.intent==='casual')score+=tags.some((tag)=>['coffee','park','bookstore','walk','bakery'].includes(tag))?2:-.35;
    if(context.intent==='tonight'&&tags.some((tag)=>['nightlife','music','bar','lounge','trivia'].includes(tag)))score+=1.5;
    const reason=recommendationReason({location,activity,companionWords,userWords,romantic,completed:completed.length,recent,currentLocation:location.id===context.locationId,intent:context.intent});
    return{option:{id:`${location.id}:${activityKey}`,title:defaultTitle(activity,location.name),description:location.description,locationId:location.id,locationName:location.name,activityKey,source:'location_activity' as const,tags,durationMinutes:durationFor(activity),reason,hours:location.hours,score,qualityLabel:qualityLabel(reason)},score};
  })).sort((left,right)=>right.score-left.score).slice(0,context.scopedLocationId&&!context.chooseElsewhere?8:8).map(({option})=>option);
}

export function buildPlanSlots(input:Date|{now?:Date;option?:PlanOption;schedules?:ScheduleItem[];plans?:SharedPlan[];dates?:DateSession[];timezone?:string}={}) :PlanSlot[]{
  const config=input instanceof Date?{now:input}:{...input};const now=config.now??new Date();
  const values:Array<{label:string;date:Date}>=[];
  const tonight=atLocalTime(now,0,19,30);if(tonight.getTime()<now.getTime()+45*60000)tonight.setDate(tonight.getDate()+1);values.push({label:tonight.getDate()===now.getDate()?'Tonight':'Tomorrow evening',date:tonight});
  values.push({label:'Tomorrow evening',date:atLocalTime(now,1,19,30)});
  const saturday=(6-now.getDay()+7)%7||7;values.push({label:'Saturday',date:atLocalTime(now,saturday,19,30)});
  values.push({label:'This weekend',date:atLocalTime(now,saturday,11,0)});
  return values.filter((value,index,list)=>list.findIndex((item)=>item.date.getTime()===value.date.getTime())===index).flatMap(({label,date})=>{
    const result=nextAvailableTime(date,config.option,config.schedules??[],config.plans??[],config.dates??[]);if(!result)return[];
    return[{label,detail:formatPlanDate(result.date),value:result.date.toISOString(),reason:result.reason??openReason(config.option),best:false}];
  }).slice(0,4).map((slot,index)=>({...slot,best:index===0,label:index===0?'Best time':slot.label}));
}

export function isLocationOpen(location:Location,start:Date,durationMinutes:number){if(!location.hours)return true;const open=parseMinute(location.hours.open),close=parseMinute(location.hours.close);if(open===null||close===null)return true;const startMinute=start.getHours()*60+start.getMinutes(),endMinute=startMinute+durationMinutes;if(close>open)return startMinute>=open&&endMinute<=close;return(startMinute>=open||startMinute<close)&&((endMinute%1440)>open||(endMinute%1440)<=close);}
export function hasPlanConflict(start:Date,durationMinutes:number,plans:SharedPlan[],dates:DateSession[],excludePlanId?:string){const end=start.getTime()+durationMinutes*60000;const plan=plans.find((item)=>item.id!==excludePlanId&&['proposed','scheduled','active'].includes(item.status)&&new Date(item.starts_at).getTime()<end&&new Date(item.ends_at).getTime()>start.getTime());if(plan)return{kind:'plan' as const,title:plan.title,id:plan.id};const date=dates.find((item)=>item.status==='upcoming'&&item.scheduled_for&&new Date(item.scheduled_for).getTime()<end&&new Date(item.scheduled_for).getTime()+3*3600000>start.getTime());return date?{kind:'date' as const,title:date.together_date_templates.name,id:date.id}:null;}
export function parseCustomPlanTime(dateValue:string,timeValue:string){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim()),time=/^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());if(!match||!time)return null;const value=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(time[1]),Number(time[2]),0,0);return Number.isFinite(value.getTime())?value:null;}

function nextAvailableTime(value:Date,option:PlanOption|undefined,schedules:ScheduleItem[],plans:SharedPlan[],dates:DateSession[]){let date=new Date(value);let reason:string|undefined;for(let attempts=0;attempts<16;attempts++){const schedule=schedules.find((item)=>item.day_of_week===date.getDay()&&item.availability==='busy'&&date.getHours()*60+date.getMinutes()<item.end_minute&&date.getHours()*60+date.getMinutes()+(option?.durationMinutes??90)>item.start_minute);if(schedule){date=atLocalTime(date,0,Math.floor((schedule.end_minute+30)/60),((schedule.end_minute+30)%60));reason=`Companion is free after ${friendlyActivity(schedule.activity)}`;continue;}if(option){if(option.hours&&!isLocationOpen({hours:option.hours}as Location,date,option.durationMinutes)){const open=parseMinute(option.hours.open);const close=parseMinute(option.hours.close);if(open!==null&&close!==null&&close>open&&open+option.durationMinutes<=close){date=atLocalTime(date,0,Math.floor(open/60),open%60);reason=`${option.locationName} is open then`;if(date.getTime()<Date.now()+10*60000){date.setDate(date.getDate()+1);continue;}}else return null;}const conflict=hasPlanConflict(date,option.durationMinutes,plans,dates);if(conflict){date=new Date(date.getTime()+30*60000);reason=`After ${conflict.title}`;continue;}}return{date,reason};}return null;}
function activityLabels(location:Location){const metadata=location.metadata??{};return[...new Set([...(location.possible_activities??[]),...(Array.isArray(metadata.date_types)?metadata.date_types.map(String):[])])].filter((item)=>!/^client|editing|planning|rest$/i.test(item));}
function locationTags(location:Location,activity:string){const metadata=location.metadata??{};return[...new Set([location.category,normalize(activity),...(Array.isArray(metadata.tags)?metadata.tags.map(String):[]),String(metadata.social_energy??''),String(metadata.privacy??'')])].map(normalize).filter(Boolean);}
function recommendationReason(input:{location:Location;activity:string;companionWords:string;userWords:string;romantic:boolean;completed:number;recent:number;currentLocation:boolean;intent?:PlanDiscoveryIntent}){if(input.intent==='different'&&input.recent===0)return`Somewhere you have not done together recently.`;if(input.completed)return`You both liked ${input.location.name} before.`;if(input.userWords.includes(normalize(input.activity)))return`It matches something you enjoy.`;if(input.activity.toLowerCase().includes('music'))return`${input.location.name} fits ${input.companionWords.includes('playful')?'the playful mood':'a night out together'}.`;if(input.romantic&&(input.location.metadata?.tags as string[]|undefined)?.includes('romantic'))return'It fits where your relationship is right now.';if(input.currentLocation)return`It works naturally from where your companion is now.`;if(input.companionWords.includes(normalize(input.activity)))return`It matches an interest you share.`;return`${input.location.name} is a strong fit for ${input.activity.toLowerCase()}.`;}
function personalityFit(tags:string[],personality:Record<string,number>){let score=0;const has=(...values:string[])=>tags.some((tag)=>values.includes(tag));if(has('nightlife','bar','music','social'))score+=(personality.social??personality.outgoing??0)*1.1;if(has('park','outdoors','walk'))score+=(personality.outdoorsy??personality.adventurous??0)*1.2;if(has('bookstore','quiet','coffee','gallery'))score+=(personality.thoughtful??personality.introspective??personality.homebody??0)*1.1;if(has('arcade','trivia','games'))score+=(personality.playful??personality.witty??0)*1.2;return score;}
function extractDislikes(preferences:string[]){return preferences.flatMap((value)=>{const match=normalize(value).match(/(?:hates?|dislikes?|avoids?|not like)\s+(.+)/);return match?.[1]?[match[1]]:[];});}
function matchesActivity(option:PlanOption,activity:string){return normalize(option.activityKey).includes(activity)||activity.includes(normalize(option.activityKey))||option.tags.some((tag)=>activity.includes(tag)||tag.includes(activity));}
function qualityLabel(reason:string){if(reason.includes('liked'))return'You both liked this';if(reason.includes('not done'))return'Something different';if(reason.includes('works naturally'))return'Works nearby';return'Best fit';}
function openReason(option:PlanOption|undefined){if(!option?.hours?.close)return'You are both free';const close=parseMinute(option.hours.close);return close!==null&&close>=22*60?`${option.locationName} is open late`:'You are both free';}
function friendlyActivity(activity:string){return activity.replace(/^(client\s+)?/i,'').replace(/\b\w/g,(letter)=>letter.toUpperCase());}
function formatPlanDate(value:Date){return value.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function defaultTitle(activity:string,location:string){return`${activity.replace(/\b\w/g,(letter)=>letter.toUpperCase())} at ${location}`;}
function durationFor(activity:string){const value=activity.toLowerCase();if(/movie/.test(value))return 150;if(/trivia|music|dinner|karaoke|comedy/.test(value))return 120;if(/walk|shopping|gallery|books|records|photos/.test(value))return 90;if(/coffee|pastry/.test(value))return 60;return 90;}
function parseMinute(value:unknown){const match=/^(\d{1,2}):(\d{2})$/.exec(String(value??''));return match?Number(match[1])*60+Number(match[2]):null;}
function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function atLocalTime(now:Date,days:number,hour:number,minute:number){const value=new Date(now);value.setDate(value.getDate()+days);value.setHours(hour,minute,0,0);return value;}
