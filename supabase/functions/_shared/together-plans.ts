import { AppError } from './types.ts';
import { experienceClock, safeTimezone } from './kivelle-time.ts';
import { track } from './together.ts';
import { resolvePlaceContext, resolveWorldAccess } from './together-place.ts';
import {activeContinuity}from'./together-continuity.ts';

export type PlanSource = 'chat'|'manual_planner'|'location'|'discover'|'date'|'story';

type CreatePlanInput = {
  userId:string;
  characterInstanceId:string;
  activityKey:string;
  locationId:string;
  startsAt:string;
  note?:string;
  source:PlanSource;
  sourceConversationId?:string;
  sourceMessageId?:string;
  requestId:string;
  title?:string;
  durationMinutes?:number;
};

const authoredDateActivities = new Set(['dinner','date night','movie night','rooftop movie','riverwalk sunset']);

export async function createSharedPlan(db:any, input:CreatePlanInput) {
  const continuity=await activeContinuity(db,input.userId);
  const { data:instance } = await db.from('together_character_instances').select('id,user_id,contact_added_at,character_version_id').eq('id',input.characterInstanceId).eq('user_id',input.userId).eq('continuity_id',continuity.id).maybeSingle();
  if(!instance) throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  if(!instance.contact_added_at) throw new AppError('CONFLICT','Get to know each other a little first.',409);

  const resolved=await resolvePlanOption(db,input.locationId,input.activityKey,input.title,input.durationMinutes);
  const worldAccess=await resolveWorldAccess({db,userId:input.userId,worldId:String(resolved.location.world_id)});
  if(worldAccess==='locked'||worldAccess==='available')throw new AppError('FORBIDDEN','Unlock this world before making plans there.',403);
  const start=new Date(input.startsAt);
  if(!Number.isFinite(start.getTime())) throw new AppError('VALIDATION_FAILED','Choose a valid date and time.',400);
  const end=new Date(start.getTime()+resolved.durationMinutes*60000);
  await validateAvailability(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,characterVersionId:instance.character_version_id,location:resolved.location,start,end});

  const { data:existing }=await db.from('together_shared_plans').select('*').eq('user_id',input.userId).eq('metadata->>requestId',input.requestId).maybeSingle();
  if(existing)return{kind:'shared_plan' as const,commitment:existing,created:false};

  const date=await matchingDateSession(db,input.userId,input.characterInstanceId,resolved.location.id,resolved.activityKey);
  if(date){
    const {data,error}=await db.from('together_date_sessions').update({status:'upcoming',scheduled_for:start.toISOString(),updated_at:new Date().toISOString(),state:{...(date.state??{}),scheduledVia:input.source,requestId:input.requestId}}).eq('id',date.id).eq('user_id',input.userId).select('*,together_date_templates(*)').single();
    if(error||!data)throw new AppError('INTERNAL_ERROR','That date could not be scheduled.',500,true);
    if(input.sourceConversationId)await writeConversationEvent(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,conversationId:input.sourceConversationId,eventType:'plan_created',entityType:'date_session',entityId:data.id,metadata:{title:data.together_date_templates?.name??resolved.title,startsAt:start.toISOString(),locationId:resolved.location.id,commitmentType:'date'}});
    await track(db,input.userId,'date_scheduled',{dateSessionId:data.id,scheduledFor:start.toISOString(),source:input.source});
    await trackPlanCreationSource(db,input.userId,input.source,{dateSessionId:data.id,characterInstanceId:input.characterInstanceId});
    return{kind:'date' as const,commitment:data,created:true};
  }

  const metadata={requestId:input.requestId,durationMinutes:resolved.durationMinutes,significance:resolved.significance,completionSummary:`User and their companion spent time together for ${resolved.title}.`,locationSlug:resolved.location.slug};
  const {data:plan,error}=await db.from('together_shared_plans').insert({user_id:input.userId,character_instance_id:input.characterInstanceId,title:resolved.title,activity_key:resolved.activityKey,world_id:resolved.location.world_id,location_id:resolved.location.id,starts_at:start.toISOString(),ends_at:end.toISOString(),status:'scheduled',source:input.source,source_conversation_id:input.sourceConversationId??null,source_message_id:input.sourceMessageId??null,note:input.note?.trim()||null,metadata}).select('*').single();
  if(error||!plan){
    if(error?.code==='23505'){const{data:duplicate}=await db.from('together_shared_plans').select('*').eq('user_id',input.userId).eq('metadata->>requestId',input.requestId).maybeSingle();if(duplicate)return{kind:'shared_plan' as const,commitment:duplicate,created:false};}
    throw new AppError('INTERNAL_ERROR','The plan could not be saved. Try again.',500,true);
  }
  if(input.sourceConversationId){await writeConversationEvent(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,conversationId:input.sourceConversationId,eventType:'plan_created',entityType:'shared_plan',entityId:plan.id,metadata:planCardMetadata(plan,resolved.location.name)});await focusConversationOnPlan(db,input.userId,input.sourceConversationId,plan.id);}
  await track(db,input.userId,'plan_created',{planId:plan.id,source:input.source,conversionSource:conversionSource(input.source),characterInstanceId:input.characterInstanceId});
  await trackPlanCreationSource(db,input.userId,input.source,{planId:plan.id,characterInstanceId:input.characterInstanceId});
  return{kind:'shared_plan' as const,commitment:plan,created:true};
}

export async function rescheduleSharedPlan(db:any,input:{userId:string;planId:string;startsAt:string;conversationId?:string}){
  const continuity=await activeContinuity(db,input.userId),{data:plan}=await db.from('together_shared_plans').select('*,together_character_instances!inner(character_version_id),together_locations(*)').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',continuity.id).maybeSingle();
  if(!plan)throw new AppError('NOT_FOUND','That plan could not be found.',404);
  if(!['proposed','scheduled'].includes(plan.status))throw new AppError('CONFLICT','That plan can no longer be rescheduled.',409,true);
  const start=new Date(input.startsAt);const duration=Math.max(30,(new Date(plan.ends_at).getTime()-new Date(plan.starts_at).getTime())/60000);const end=new Date(start.getTime()+duration*60000);
  await validateAvailability(db,{userId:input.userId,characterInstanceId:plan.character_instance_id,characterVersionId:plan.together_character_instances.character_version_id,location:plan.together_locations,start,end,excludePlanId:plan.id});
  const previousStartsAt=plan.starts_at;
  const{data:updated,error}=await db.from('together_shared_plans').update({starts_at:start.toISOString(),ends_at:end.toISOString(),status:'scheduled',updated_at:new Date().toISOString(),metadata:{...(plan.metadata??{}),rescheduledAt:new Date().toISOString()}}).eq('id',plan.id).eq('user_id',input.userId).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','The plan could not be rescheduled.',500,true);
  const conversationId=input.conversationId??plan.source_conversation_id;
  if(conversationId){await writeConversationEvent(db,{userId:input.userId,characterInstanceId:plan.character_instance_id,conversationId,eventType:'plan_rescheduled',entityType:'shared_plan',entityId:plan.id,metadata:{...planCardMetadata(updated,plan.together_locations?.name),previousStartsAt}});await focusConversationOnPlan(db,input.userId,conversationId,plan.id);}
  await track(db,input.userId,'plan_rescheduled',{planId:plan.id,previousStartsAt,startsAt:updated.starts_at});
  return updated;
}

export async function updateSharedPlan(db:any,input:{userId:string;planId:string;note?:string;locationId?:string;activityKey?:string;conversationId?:string}){
  const continuity=await activeContinuity(db,input.userId),{data:plan}=await db.from('together_shared_plans').select('*,together_character_instances!inner(character_version_id)').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',continuity.id).maybeSingle();
  if(!plan)throw new AppError('NOT_FOUND','That plan could not be found.',404);
  if(!['proposed','scheduled'].includes(plan.status))throw new AppError('CONFLICT','That plan can no longer be changed.',409,true);
  const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(input.note!==undefined)patch.note=input.note.trim()||null;
  if(input.locationId||input.activityKey){const resolved=await resolvePlanOption(db,input.locationId??plan.location_id,input.activityKey??plan.activity_key);const start=new Date(plan.starts_at),end=new Date(start.getTime()+resolved.durationMinutes*60000);await validateAvailability(db,{userId:input.userId,characterInstanceId:plan.character_instance_id,characterVersionId:plan.together_character_instances.character_version_id,location:resolved.location,start,end,excludePlanId:plan.id});patch.location_id=resolved.location.id;patch.activity_key=resolved.activityKey;patch.title=resolved.title;patch.ends_at=end.toISOString();patch.metadata={...(plan.metadata??{}),durationMinutes:resolved.durationMinutes,significance:resolved.significance};}
  const{data,error}=await db.from('together_shared_plans').update(patch).eq('id',plan.id).eq('user_id',input.userId).select('*').single();
  if(error||!data)throw new AppError('INTERNAL_ERROR','The plan could not be changed.',500,true);
  const conversationId=input.conversationId??plan.source_conversation_id;if(conversationId&&(input.locationId||input.activityKey)){const{data:place}=await db.from('together_locations').select('name').eq('id',data.location_id).maybeSingle();await writeConversationEvent(db,{userId:input.userId,characterInstanceId:plan.character_instance_id,conversationId,eventType:'plan_rescheduled',entityType:'shared_plan',entityId:plan.id,metadata:{...planCardMetadata(data,place?.name),previousLocationId:plan.location_id,previousActivityKey:plan.activity_key}});await focusConversationOnPlan(db,input.userId,conversationId,plan.id);}
  return data;
}

export async function cancelSharedPlan(db:any,input:{userId:string;planId:string;conversationId?:string}){
  const continuity=await activeContinuity(db,input.userId),{data:plan}=await db.from('together_shared_plans').select('*,together_locations(name)').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',continuity.id).maybeSingle();
  if(!plan)throw new AppError('NOT_FOUND','That plan could not be found.',404);
  if(!['proposed','scheduled'].includes(plan.status))throw new AppError('CONFLICT','A plan that has started cannot be cancelled.',409,true);
  const now=new Date().toISOString();
  const{data:updated,error}=await db.from('together_shared_plans').update({status:'cancelled',cancelled_at:now,updated_at:now}).eq('id',plan.id).eq('user_id',input.userId).select('*').single();
  if(error||!updated)throw new AppError('INTERNAL_ERROR','The plan could not be cancelled.',500,true);
  const conversationId=input.conversationId??plan.source_conversation_id;
  if(conversationId){await writeConversationEvent(db,{userId:input.userId,characterInstanceId:plan.character_instance_id,conversationId,eventType:'plan_cancelled',entityType:'shared_plan',entityId:plan.id,metadata:planCardMetadata(updated,plan.together_locations?.name)});await focusConversationOnPlan(db,input.userId,conversationId,plan.id);}
  await track(db,input.userId,'plan_cancelled',{planId:plan.id});
  return updated;
}

export async function writeConversationEvent(db:any,input:{userId:string;characterInstanceId:string;conversationId:string;eventType:string;entityType:string;entityId:string;metadata?:Record<string,unknown>}){
  const{data,error}=await db.from('together_conversation_events').insert({user_id:input.userId,character_instance_id:input.characterInstanceId,conversation_id:input.conversationId,event_type:input.eventType,entity_type:input.entityType,entity_id:input.entityId,metadata:input.metadata??{}}).select('*').single();
  if(error?.code==='23505')return null;
  if(error)console.warn('Conversation event could not be written',error.code);
  return data??null;
}

async function focusConversationOnPlan(db:any,userId:string,conversationId:string,planId:string){const{data}=await db.from('together_conversations').select('metadata').eq('id',conversationId).eq('user_id',userId).maybeSingle();if(data)await db.from('together_conversations').update({metadata:{...(data.metadata??{}),focus:{type:'plan',planId,updatedAt:new Date().toISOString()}}}).eq('id',conversationId).eq('user_id',userId);}

async function resolvePlanOption(db:any,locationId:string,activityValue:string,titleValue?:string,durationValue?:number){
  const{data:location}=await db.from('together_locations').select('*').eq('id',locationId).maybeSingle();
  if(!location)throw new AppError('VALIDATION_FAILED','Choose a real location in an available world.',400);
  const possible=(location.possible_activities??[]).map((value:string)=>normalize(value));
  const metadata=location.metadata??{};
  const dateTypes=(Array.isArray(metadata.date_types)?metadata.date_types:[]).map((value:unknown)=>normalize(String(value)));
  const activityKey=normalize(activityValue).replace(/\s+/g,'_');
  const activityLabel=activityKey.replace(/_/g,' ');
  if(!possible.includes(normalize(activityLabel))&&!dateTypes.includes(normalize(activityLabel)))throw new AppError('VALIDATION_FAILED',`${location.name} does not offer that activity.`,400);
  const durationMinutes=Math.max(30,Math.min(360,durationValue??durationFor(activityLabel)));
  return{location,activityKey,title:titleValue?.trim().slice(0,160)||defaultTitle(activityLabel,location.name),durationMinutes,significance:significanceFor(activityLabel,metadata)};
}

async function validateAvailability(db:any,input:{userId:string;characterInstanceId:string;characterVersionId:string;location:any;start:Date;end:Date;excludePlanId?:string}){
  if(!Number.isFinite(input.start.getTime())||input.start.getTime()<Date.now()+10*60000)throw new AppError('VALIDATION_FAILED','Choose a time at least ten minutes from now.',400);
  if(input.start.getTime()>Date.now()+60*86400000)throw new AppError('VALIDATION_FAILED','Plans can be scheduled up to 60 days ahead.',400);
  const place=await resolvePlaceContext({db,locationId:String(input.location.id),userId:input.userId,characterInstanceId:input.characterInstanceId,now:input.start});
  const timezone=safeTimezone(place.world.timezone);
  if(!locationIsOpen(input.location,input.start,input.end,timezone)){const close=parseMinute(input.location.hours?.close),duration=Math.max(30,(input.end.getTime()-input.start.getTime())/60000),latest=close===null?null:Math.max(0,close-duration);throw new AppError('LOCATION_CLOSED',latest===null||close===null?`${input.location.name} is closed at that time. Choose another time or place.`:`${input.location.name} closes at ${minuteLabel(close)}. Try ${minuteLabel(latest)} or choose another place.`,409,true);}
  let plans=db.from('together_shared_plans').select('id,title,starts_at,ends_at').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).in('status',['proposed','scheduled','active']).lt('starts_at',input.end.toISOString()).gt('ends_at',input.start.toISOString());
  if(input.excludePlanId)plans=plans.neq('id',input.excludePlanId);
  const[{data:conflicts},{data:dates},{data:schedules}]=await Promise.all([plans,db.from('together_date_sessions').select('id,scheduled_for,together_date_templates(name)').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('status','upcoming'),db.from('together_schedule_templates').select('*,together_locations!inner(world_id)').eq('character_version_id',input.characterVersionId).eq('together_locations.world_id',input.location.world_id)]);
  if(conflicts?.length)throw new AppError('PLAN_CONFLICT',`You already have ${conflicts[0].title} from ${minuteLabel(experienceClock(timezone,new Date(conflicts[0].starts_at)).minuteOfDay)} to ${minuteLabel(experienceClock(timezone,new Date(conflicts[0].ends_at)).minuteOfDay)}. Move it or choose another time.`,409,true);
  const dateConflict=(dates??[]).find((date:any)=>{if(!date.scheduled_for)return false;const starts=new Date(date.scheduled_for).getTime();return starts<input.end.getTime()&&starts+3*3600000>input.start.getTime();});
  if(dateConflict)throw new AppError('PLAN_CONFLICT',`You already have ${dateConflict.together_date_templates?.name??'a date'} at that time.`,409,true);
  const clock=experienceClock(timezone,input.start);const endClock=experienceClock(timezone,input.end);
  const busy=(schedules??[]).find((item:any)=>Number(item.day_of_week)===clock.weekday&&item.availability==='busy'&&clock.minuteOfDay<Number(item.end_minute)&&endClock.minuteOfDay>Number(item.start_minute));
  if(busy)throw new AppError('COMPANION_BUSY',`Your companion is busy with ${busy.activity} until ${minuteLabel(Number(busy.end_minute))}. Try ${minuteLabel(Number(busy.end_minute)+30)} or ${minuteLabel(Number(busy.end_minute)+60)}.`,409,true);
}

function locationIsOpen(location:any,start:Date,end:Date,timezone:string){
  if(!location.hours)return true;
  const open=parseMinute(location.hours.open),close=parseMinute(location.hours.close);if(open===null||close===null)return true;
  const startMinute=experienceClock(timezone,start).minuteOfDay;const endMinute=experienceClock(timezone,end).minuteOfDay;
  if(close>open)return startMinute>=open&&endMinute<=close;
  return(startMinute>=open||startMinute<close)&&(endMinute>open||endMinute<=close);
}

async function matchingDateSession(db:any,userId:string,instanceId:string,locationId:string,activityKey:string){
  const label=activityKey.replace(/_/g,' ');
  if(![...authoredDateActivities].some((value)=>label.includes(value)))return null;
  const{data:sessions}=await db.from('together_date_sessions').select('*,together_date_templates!inner(*)').eq('user_id',userId).eq('character_instance_id',instanceId).in('status',['unlocked','deferred','upcoming']);
  const firstWord=normalize(label).split(' ')[0]??normalize(label);
  return(sessions??[]).find((session:any)=>session.together_date_templates?.location_id===locationId&&normalize(session.together_date_templates?.name??'').includes(firstWord))??null;
}

function planCardMetadata(plan:any,locationName?:string){return{title:plan.title,startsAt:plan.starts_at,endsAt:plan.ends_at,status:plan.status,worldId:plan.world_id,locationId:plan.location_id,location:locationName??'Current place',activityKey:plan.activity_key,note:plan.note??null};}
function defaultTitle(activity:string,location:string){const label=activity.replace(/\b\w/g,(letter)=>letter.toUpperCase());if(/^(walk|shopping|books|records|art|photos|quiet browsing)$/i.test(activity))return`${label} at ${location}`;return`${label} at ${location}`;}
function durationFor(activity:string){if(/movie/.test(activity))return 150;if(/trivia|music|dinner|karaoke|comedy/.test(activity))return 120;if(/walk|shopping|gallery|books|records|photos/.test(activity))return 90;if(/coffee|pastry/.test(activity))return 60;return 90;}
function significanceFor(activity:string,metadata:Record<string,unknown>){if(/rooftop|romantic|celebration/.test(activity)||((metadata.tags as unknown[])??[]).includes('romantic'))return.72;if(/trivia|music|dinner|karaoke|gallery/.test(activity))return.55;if(/coffee|pastry|errands/.test(activity))return.35;return.48;}
function parseMinute(value:unknown){const match=/^(\d{1,2}):(\d{2})$/.exec(String(value??''));if(!match)return null;return Number(match[1])*60+Number(match[2]);}
function minuteLabel(value:number){const normalized=((value%1440)+1440)%1440,hour=Math.floor(normalized/60),minute=normalized%60;return`${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;}
function normalize(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,' ').trim();}
function conversionSource(source:PlanSource){return source==='chat'?'chat_natural_language':source==='manual_planner'?'chat_manual':source;}
async function trackPlanCreationSource(db:any,userId:string,source:PlanSource,metadata:Record<string,unknown>){if(source==='chat')await track(db,userId,'plan_created_from_chat',metadata);if(source==='location')await track(db,userId,'plan_created_from_location',metadata);}
