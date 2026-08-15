import type { DateSession, Location, ScheduleItem, SharedPlan } from '../types';

export type PlanActivityId=string;
export type PlanOption={id:string;title:string;description:string;locationId:string;locationName:string;activityKey:string;source:'location_activity'|'date'|'curated';tags:string[];durationMinutes:number;reason:string;hours?:Record<string,unknown>};
export type PlanContext={activity:string;mood:string;locationId?:string|null;interests?:string[];relationshipStage:string;hour?:number;locations:Location[];scopedLocationId?:string|null;chooseElsewhere?:boolean;previousPlans?:SharedPlan[]};
export type PlanSlot={label:string;detail:string;value:string;reason?:string};

export function recommendPlanOptions(context:PlanContext):PlanOption[]{
  const available=context.locations.filter((location)=>location.category!=='home'&&location.category!=='work'&&location.metadata?.private!==true);
  const scoped=context.scopedLocationId&&!context.chooseElsewhere?available.filter((location)=>location.id===context.scopedLocationId):available;
  const words=normalize(`${context.activity} ${context.mood} ${(context.interests??[]).join(' ')}`);
  const romantic=['flirting','dating','exclusive','long_term'].includes(context.relationshipStage);
  const hour=context.hour??new Date().getHours();
  return scoped.flatMap((location)=>activityLabels(location).map((activity,index)=>{
    const activityKey=normalize(activity).replace(/\s+/g,'_');const tags=locationTags(location,activity);let score=-index*.001;
    for(const tag of tags)if(words.includes(normalize(tag)))score+=1.5;
    if(romantic&&tags.includes('romantic'))score+=1.2;
    if(!romantic&&tags.includes('romantic'))score-=.35;
    if(location.id===context.locationId)score+=.2;
    if(hour>=17&&['nightlife','music','bar','lounge','cinema'].some((tag)=>tags.includes(tag)))score+=.8;
    if(hour<16&&['coffee','bakery','park','gallery','bookstore'].some((tag)=>tags.includes(tag)))score+=.8;
    const previous=(context.previousPlans??[]).filter((plan)=>plan.location_id===location.id&&plan.status==='completed').length;if(previous)score+=.55;
    return{option:{id:`${location.id}:${activityKey}`,title:defaultTitle(activity,location.name),description:location.description,locationId:location.id,locationName:location.name,activityKey,source:'location_activity' as const,tags,durationMinutes:durationFor(activity),reason:recommendationReason({location,activity,words,romantic,previous,currentLocation:location.id===context.locationId}),hours:location.hours},score};
  })).sort((left,right)=>right.score-left.score).slice(0,context.scopedLocationId&&!context.chooseElsewhere?8:6).map(({option})=>option);
}

export function buildPlanSlots(input:Date|{now?:Date;option?:PlanOption;schedules?:ScheduleItem[];plans?:SharedPlan[];dates?:DateSession[];timezone?:string}={}) :PlanSlot[]{
  const config=input instanceof Date?{now:input}:{...input};const now=config.now??new Date();
  const values:Array<{label:string;date:Date}>=[];
  const tonight=atLocalTime(now,0,19,30);if(tonight.getTime()<now.getTime()+45*60000)tonight.setDate(tonight.getDate()+1);values.push({label:tonight.getDate()===now.getDate()?'Tonight':'Tomorrow evening',date:tonight});
  values.push({label:'Tomorrow evening',date:atLocalTime(now,1,19,30)});
  const saturday=(6-now.getDay()+7)%7||7;values.push({label:'Saturday',date:atLocalTime(now,saturday,19,30)});
  values.push({label:'This weekend',date:atLocalTime(now,saturday,11,0)});
  return values.filter((value,index,list)=>list.findIndex((item)=>item.date.getTime()===value.date.getTime())===index).flatMap(({label,date})=>{
    const adjusted=nextAvailableTime(date,config.option,config.schedules??[],config.plans??[],config.dates??[]);
    if(!adjusted)return[];
    const reason=adjusted.getTime()!==date.getTime()?'After your companion is free':undefined;
    return[{label,detail:adjusted.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),value:adjusted.toISOString(),reason}];
  }).slice(0,4);
}

export function isLocationOpen(location:Location,start:Date,durationMinutes:number){if(!location.hours)return true;const open=parseMinute(location.hours.open),close=parseMinute(location.hours.close);if(open===null||close===null)return true;const startMinute=start.getHours()*60+start.getMinutes(),endMinute=startMinute+durationMinutes;if(close>open)return startMinute>=open&&endMinute<=close;return(startMinute>=open||startMinute<close)&&((endMinute%1440)>open||(endMinute%1440)<=close);}
export function hasPlanConflict(start:Date,durationMinutes:number,plans:SharedPlan[],dates:DateSession[],excludePlanId?:string){const end=start.getTime()+durationMinutes*60000;const plan=plans.find((item)=>item.id!==excludePlanId&&['proposed','scheduled','active'].includes(item.status)&&new Date(item.starts_at).getTime()<end&&new Date(item.ends_at).getTime()>start.getTime());if(plan)return{kind:'plan' as const,title:plan.title,id:plan.id};const date=dates.find((item)=>item.status==='upcoming'&&item.scheduled_for&&new Date(item.scheduled_for).getTime()<end&&new Date(item.scheduled_for).getTime()+3*3600000>start.getTime());return date?{kind:'date' as const,title:date.together_date_templates.name,id:date.id}:null;}
export function parseCustomPlanTime(dateValue:string,timeValue:string){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim()),time=/^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());if(!match||!time)return null;const value=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(time[1]),Number(time[2]),0,0);return Number.isFinite(value.getTime())?value:null;}

function nextAvailableTime(value:Date,option:PlanOption|undefined,schedules:ScheduleItem[],plans:SharedPlan[],dates:DateSession[]){let date=new Date(value);for(let attempts=0;attempts<10;attempts++){const schedule=schedules.find((item)=>item.day_of_week===date.getDay()&&item.availability==='busy'&&date.getHours()*60+date.getMinutes()<item.end_minute&&date.getHours()*60+date.getMinutes()+(option?.durationMinutes??90)>item.start_minute);if(schedule){date=atLocalTime(date,0,Math.floor((schedule.end_minute+30)/60),((schedule.end_minute+30)%60));continue;}if(option){if(option.hours&&!isLocationOpen({hours:option.hours}as Location,date,option.durationMinutes))return null;if(hasPlanConflict(date,option.durationMinutes,plans,dates)){date=new Date(date.getTime()+30*60000);continue;}}return date;}return null;}
function activityLabels(location:Location){const metadata=location.metadata??{};return[...new Set([...(location.possible_activities??[]),...(Array.isArray(metadata.date_types)?metadata.date_types.map(String):[])])].filter((item)=>!/^client|editing|planning|rest$/i.test(item));}
function locationTags(location:Location,activity:string){const metadata=location.metadata??{};return[...new Set([location.category,normalize(activity),...(Array.isArray(metadata.tags)?metadata.tags.map(String):[]),String(metadata.social_energy??''),String(metadata.privacy??'')])].filter(Boolean);}
function recommendationReason(input:{location:Location;activity:string;words:string;romantic:boolean;previous:number;currentLocation:boolean}){if(input.previous)return`You both enjoyed ${input.location.name} before.`;if(input.activity.toLowerCase().includes('music'))return`${input.location.name} fits ${input.words.includes('playful')?'the playful mood':'a night out together'}.`;if(input.romantic&&(input.location.metadata?.tags as string[]|undefined)?.includes('romantic'))return'It fits where your relationship is right now.';if(input.currentLocation)return`Convenient from where your companion is now.`;if(input.words.includes(normalize(input.activity)))return`Matches an interest you share.`;return`${input.location.name} offers ${input.activity.toLowerCase()} at this time of day.`;}
function defaultTitle(activity:string,location:string){return`${activity.replace(/\b\w/g,(letter)=>letter.toUpperCase())} at ${location}`;}
function durationFor(activity:string){const value=activity.toLowerCase();if(/movie/.test(value))return 150;if(/trivia|music|dinner|karaoke|comedy/.test(value))return 120;if(/walk|shopping|gallery|books|records|photos/.test(value))return 90;if(/coffee|pastry/.test(value))return 60;return 90;}
function parseMinute(value:unknown){const match=/^(\d{1,2}):(\d{2})$/.exec(String(value??''));return match?Number(match[1])*60+Number(match[2]):null;}
function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function atLocalTime(now:Date,days:number,hour:number,minute:number){const value=new Date(now);value.setDate(value.getDate()+days);value.setHours(hour,minute,0,0);return value;}
