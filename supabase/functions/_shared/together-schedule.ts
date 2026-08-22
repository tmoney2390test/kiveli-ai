import type { SupabaseClient } from '@supabase/supabase-js';
import { generateScheduleWindow, lifeEventEstablishesPresentReality, localToUtc, resolvePresence, type ActivityTemplate, type CharacterLifeProfile, type LifeLocation, type ScheduleBlock } from '../../../packages/together-domain/src/index.ts';
import { resolveUserExperienceTimezone } from './kivelle-time.ts';
import { resolveCharacterBaseLocation, resolveCharacterPlaceContext, resolvePlaceContext, type PlaceContext } from './together-place.ts';

type Row=Record<string,any>;
const ENGINE_VERSION='life_engine_v3_user_timezone';

export type ResolvedCharacterPresence={
  characterInstanceId:string; locationId:string|null; activityKey:string; activity:string; scheduleEventId?:string;
  activityStartedAt:string; expectedEndAt?:string; state:'active'|'working'|'relaxing'|'sleeping'|'traveling'|'busy';
  interruptibility:'open'|'limited'|'busy'|'unavailable'; nextEvent?:ScheduleBlock; source:'plan'|'life_event'|'schedule'|'fallback';
  placeContext:PlaceContext|null; entryReason?:'scheduled'|'user_drop_in'|'invited'|'continued_chat';
};

export type CompanionPresence = {
  characterInstanceId:string;
  locationId:string|null;
  worldId:string|null;
  activity:string;
  activityKey?:string;
  mood:string;
  energy:string;
  availability:string;
  interruptibility:'open'|'limited'|'busy'|'unavailable';
  source:'active_date'|'active_plan'|'active_event'|'scene'|'life_engine'|'schedule'|'character_state';
  sourceEventId?:string;
  validUntil?:string;
  placeContext:PlaceContext|null;
  activityStartedAt?:string;
  expectedEndAt?:string;
  scheduleEventId?:string;
  state?:ResolvedCharacterPresence['state'];
  nextEvent?:ScheduleBlock;
};

export async function ensureCharacterSchedule(input:{db:SupabaseClient;userId:string;characterInstanceId:string;now?:Date;days?:number}){
  const{db,userId,characterInstanceId}=input,now=input.now??new Date(),days=input.days??7;
  const{data:instance,error}=await db.from('together_character_instances').select('*,together_character_versions(life_config,interests,personality_config),together_character_templates(name,slug,occupation)').eq('id',characterInstanceId).eq('user_id',userId).maybeSingle();
  if(error||!instance)return[];
  const currentPlace=instance.current_location_id?await resolvePlaceContext({db,locationId:String(instance.current_location_id),now,userId,characterInstanceId}).catch(()=>null):null;
  let worldId=currentPlace?.world.id??null;
  if(!worldId){const{data:presence}=await db.from('together_character_world_presence').select('world_id').eq('character_version_id',instance.character_version_id).neq('presence_type','unavailable').order('presence_type').limit(1).maybeSingle();worldId=presence?.world_id??null;}
  if(!worldId)return[];
  const timezone=await resolveUserExperienceTimezone(db,userId);
  // Include the timezone in the materialization version so changing the
  // user's configured timezone automatically rebuilds future routines.
  const generationVersion=`${ENGINE_VERSION}:${timezone}`;
  const base=await resolveCharacterBaseLocation({db,characterVersionId:String(instance.character_version_id),worldId:String(worldId)});
  if(!base)return[];
  const configuredProfile=lifeProfile(instance),nativeLifeProfile=Number(configuredProfile.version??1)>=2;
  const startDate=localDate(now,timezone),endDate=addDays(startDate,days);
  const from=localToUtc(startDate,0,timezone),until=localToUtc(endDate,0,timezone);
  // Retire stale generated/recurring materialization for the current local
  // day and future. This clock policy applies to every character generation,
  // while plans, overrides, and older historical evidence remain untouched.
  await db.from('together_character_schedule_events').delete()
    .eq('user_id',userId).eq('character_instance_id',characterInstanceId)
    .in('source',['recurring','generated']).neq('generation_version',generationVersion)
    .gte('ends_at',from.toISOString());
  await db.from('together_character_schedule_events').delete()
    .eq('user_id',userId).eq('character_instance_id',characterInstanceId)
    .in('source',['recurring','generated']).is('generation_version',null)
    .gte('ends_at',from.toISOString());
  const[locationsResult,templatesResult,existingResult,historyResult,plansResult,legacyResult,edgesResult,instancesResult]=await Promise.all([
    db.from('together_locations').select('*').eq('world_id',worldId),
    db.from('together_character_activity_templates').select('*').eq('character_version_id',instance.character_version_id),
    db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).gte('starts_at',from.toISOString()).lt('starts_at',until.toISOString()),
    db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).gte('starts_at',new Date(from.getTime()-45*86400000).toISOString()).lt('starts_at',from.toISOString()).order('starts_at',{ascending:false}).limit(300),
    db.from('together_shared_plans').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).in('status',['scheduled','active']).lt('starts_at',until.toISOString()).gt('ends_at',from.toISOString()),
    db.from('together_schedule_templates').select('*,together_locations(world_id)').eq('character_version_id',instance.character_version_id),
    db.from('together_character_relationship_edges').select('*').or(`source_template_id.eq.${instance.character_template_id},target_template_id.eq.${instance.character_template_id}`),
    db.from('together_character_instances').select('id,character_template_id').eq('user_id',userId).eq('continuity_id',instance.continuity_id),
  ]);
  // Hierarchy nodes provide context for a destination; they are not substitute
  // venues for generated routines. Authored blocks may still deliberately point
  // at a district because their UUIDs are preserved and handled separately.
  const locations=(locationsResult.data??[]).map(toLifeLocation).filter((location)=>!['region','district','neighborhood','room','zone'].includes(location.locationType)),templates=(templatesResult.data??[]).map(toActivityTemplate);
  const existing=(existingResult.data??[]).map(toBlock),history=(historyResult.data??[]).map(toBlock);
  const covered=new Set(existing.map(event=>localDate(event.startsAt,timezone)));
  const legacyRows=legacyResult.data??[];
  const authoredRows=legacyRows.filter((row:Row)=>row.metadata?.scheduleMode==='authored');
  const fixed=[...(plansResult.data??[]).map((plan:Row):ScheduleBlock=>({activityKey:String(plan.activity_key),title:String(plan.title),locationId:plan.location_id?String(plan.location_id):null,startsAt:String(plan.starts_at),endsAt:String(plan.ends_at),priority:'user_commitment',visibility:'shared',source:'user_plan',interruptibility:'open',generationKey:`plan:${plan.id}`,metadata:{planId:plan.id}})),...legacyBlocks(nativeLifeProfile?authoredRows:legacyRows,timezone,startDate,days,worldId,String(base.id))];
  const profile=resolveOccupationLocations(configuredProfile,locationsResult.data??[]);
  const generationProfile=authoredRows.length?{...profile,occupation:undefined,scheduling:{...profile.scheduling,spontaneity:0,preferredDailyActivityCount:[0,0] as [number,number]}}:profile;
  const generated=generateScheduleWindow({characterInstanceId,seed:String(instance.simulation_seed??characterInstanceId),timezone,fromLocalDate:startDate,days,profile:generationProfile,locations,homeLocationId:String(base.id),activityTemplates:templates.length?templates:defaultActivities(),fixedCommitments:fixed,history:[...history,...existing],generationVersion});
  const relatedTemplateIds=(edgesResult.data??[]).map((edge:Row)=>String(edge.source_template_id)===String(instance.character_template_id)?String(edge.target_template_id):String(edge.source_template_id));
  const relatedInstance=(instancesResult.data??[]).find((candidate:Row)=>relatedTemplateIds.includes(String(candidate.character_template_id)));
  const missing=generated.filter(event=>event.source!=='user_plan'&&!covered.has(localDate(event.startsAt,timezone))).map(event=>event.priority==='social_event'&&relatedInstance?{...event,participantInstanceIds:[characterInstanceId,String(relatedInstance.id)],metadata:{...(event.metadata??{}),socialContext:'with a friend'}}:event);
  if(missing.length){
    await db.from('together_character_schedule_events').upsert(missing.map(event=>({user_id:userId,continuity_id:instance.continuity_id,character_instance_id:characterInstanceId,location_id:event.locationId,activity_key:event.activityKey,title:event.title,starts_at:event.startsAt,ends_at:event.endsAt,priority:event.priority,visibility:event.visibility,source:event.source,interruptibility:event.interruptibility,participant_instance_ids:event.participantInstanceIds??[characterInstanceId],generation_key:event.generationKey,generation_version:generationVersion,metadata:{...(event.metadata??{}),scheduleTimezone:timezone}})),{onConflict:'character_instance_id,generation_key',ignoreDuplicates:true});
  }
  await db.from('together_character_schedule_events').delete().eq('user_id',userId).eq('character_instance_id',characterInstanceId).lt('ends_at',new Date(now.getTime()-90*86400000).toISOString());
  const{data:window}=await db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).gte('ends_at',new Date(now.getTime()-86400000).toISOString()).lte('starts_at',until.toISOString()).order('starts_at');
  return(window??[]).map(toBlock);
}

export async function resolveCharacterPresence(input:{db:SupabaseClient;userId:string;characterInstanceId:string;now?:Date;ensure?:boolean}):Promise<ResolvedCharacterPresence|null>{
  const{db,userId,characterInstanceId}=input,now=input.now??new Date();
  if(input.ensure!==false)await ensureCharacterSchedule({db,userId,characterInstanceId,now});
  const{data:instance}=await db.from('together_character_instances').select('character_version_id,current_location_id,current_activity,current_presence_source').eq('id',characterInstanceId).eq('user_id',userId).maybeSingle();if(!instance)return null;
  const currentPlace=instance.current_location_id?await resolvePlaceContext({db,locationId:String(instance.current_location_id),now,userId,characterInstanceId}).catch(()=>null):null;
  let worldId=currentPlace?.world.id??null;
  if(!worldId){
    const{data:worldPresence}=await db.from('together_character_world_presence').select('world_id').eq('character_version_id',instance.character_version_id).neq('presence_type','unavailable').order('presence_type').limit(1).maybeSingle();
    worldId=worldPresence?.world_id?String(worldPresence.world_id):null;
  }
  const baseLocation=worldId?await resolveCharacterBaseLocation({db,characterVersionId:String(instance.character_version_id),worldId}).catch(()=>null):null;
  // A materialized character row describes the last resolved instant. When no
  // schedule block is active, do not combine that old venue with a later
  // activity. Return one coherent fallback pair from the character's base.
  const preserveAuthoredState=String(instance.current_presence_source??'legacy')==='legacy';
  const fallbackLocationId=preserveAuthoredState||!baseLocation?(instance.current_location_id?String(instance.current_location_id):null):String(baseLocation.id);
  const fallbackActivity=preserveAuthoredState?String(instance.current_activity??'Having some unstructured time'):'Having some unstructured time at home';
  const[planResult,eventResult,nextResult,lifeEventResult]=await Promise.all([
    db.from('together_shared_plans').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).in('status',['active','scheduled']).lte('starts_at',now.toISOString()).gt('ends_at',now.toISOString()).order('starts_at').limit(1).maybeSingle(),
    db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).lte('starts_at',now.toISOString()).gt('ends_at',now.toISOString()).order('priority').limit(10),
    db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).gt('starts_at',now.toISOString()).order('starts_at').limit(12),
    db.from('together_life_events').select('*').eq('user_id',userId).eq('character_instance_id',characterInstanceId).not('event_type','in','(shared_plan,legacy_shared_plan)').lte('starts_at',now.toISOString()).gt('ends_at',now.toISOString()).order('significance',{ascending:false}).limit(10),
  ]);
  const rows=(eventResult.data??[]).filter((row:Row)=>!row.metadata?.suppressedByPlanId).map(toBlock),nextRow=(nextResult.data??[]).find((row:Row)=>!row.metadata?.suppressedByPlanId),next=nextRow?toBlock(nextRow):undefined;
  const plan=planResult.data as Row|null;
  if(plan)rows.push({id:String(plan.id),activityKey:String(plan.activity_key),title:String(plan.title),locationId:plan.location_id?String(plan.location_id):null,startsAt:String(plan.starts_at),endsAt:String(plan.ends_at),priority:'user_commitment',visibility:'shared',source:'user_plan',interruptibility:'open',generationKey:`plan:${plan.id}`,metadata:{planId:plan.id,activityLabel:plan.title}});
  let presence=resolvePresence(next?[...rows,next]:rows,now,{characterInstanceId,locationId:fallbackLocationId,activity:fallbackActivity});
  const lifeEvent=!plan?(lifeEventResult.data??[]).find((candidate:Row)=>lifeEventEstablishesPresentReality(
    {locationId:candidate.location_id?String(candidate.location_id):null,eventType:String(candidate.event_type??''),metadata:candidate.metadata??{}},
    {locationId:presence.locationId},
  ))??null:null;
  const lifeEventOwnsPresence=Boolean(lifeEvent);
  if(lifeEventOwnsPresence)presence={...presence,locationId:lifeEvent.location_id?String(lifeEvent.location_id):presence.locationId,activityKey:String(lifeEvent.event_type??'life_event'),activity:String(lifeEvent.narrative_summary??lifeEvent.title),activityStartedAt:String(lifeEvent.starts_at),expectedEndAt:String(lifeEvent.ends_at),state:Number(lifeEvent.significance??0)>=.75?'busy':'active',interruptibility:String(lifeEvent.metadata?.interruptibility??(Number(lifeEvent.significance??0)>=.75?'busy':'limited')) as ResolvedCharacterPresence['interruptibility'],source:'life_event'};
  if(baseLocation&&activityRequiresHome(presence.activityKey,presence.activity)&&String(presence.locationId)!==String(baseLocation.id))presence={...presence,locationId:String(baseLocation.id)};
  const place=await resolveCharacterPlaceContext({db,characterVersionId:String(instance.character_version_id),locationId:presence.locationId,activity:presence.activity,activityKey:presence.activityKey,now,userId,characterInstanceId});
  return{...presence,placeContext:place};
}

/** Canonical presence boundary for World, Location, Life and Chat consumers. */
export async function resolveCompanionPresence(input:{db:SupabaseClient;userId:string;characterInstanceId:string;now?:Date;ensure?:boolean}):Promise<CompanionPresence|null>{
  const now=input.now??new Date();
  const base=await resolveCharacterPresence(input);
  if(!base)return null;
  const[{data:activeDate},{data:activeScene}]=await Promise.all([
    input.db.from('together_date_sessions').select('id,started_at,scheduled_for,updated_at,together_date_templates(location_id,name,metadata)').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    input.db.from('together_scene_sessions').select('id,world_id,location_id,activity_key,started_at,expected_end_at,state').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  // A live scene is the interaction ledger and may have moved since the Date
  // or Plan began. It therefore owns present location/activity while valid.
  if(activeScene){
    const expectedEnd=activeScene.expected_end_at?new Date(String(activeScene.expected_end_at)).getTime():new Date(String(activeScene.started_at)).getTime()+3*60*60*1000;
    if(Number.isFinite(expectedEnd)&&expectedEnd>now.getTime()){
      const locationId=String(activeScene.location_id);
      const place=await resolvePlaceContext({db:input.db,locationId,now,userId:input.userId,characterInstanceId:input.characterInstanceId}).catch(()=>base.placeContext);
      const state=activeScene.state as Row|undefined;
      const activityKey=String(state?.currentActivityKey??activeScene.activity_key??'together');
      return {characterInstanceId:input.characterInstanceId,locationId,worldId:place?.world.id??String(activeScene.world_id),activityKey,activity:sceneActivityLabel(state,activityKey),mood:'present',energy:base.state==='busy'?'medium':base.state==='relaxing'?'high':'medium',availability:'with you',interruptibility:'open',source:'scene',sourceEventId:String(activeScene.id),validUntil:activeScene.expected_end_at?String(activeScene.expected_end_at):undefined,placeContext:place,activityStartedAt:String(activeScene.started_at),expectedEndAt:activeScene.expected_end_at?String(activeScene.expected_end_at):undefined,state:'active',nextEvent:base.nextEvent};
    }
  }
  if(activeDate){
    const activeDateRow=activeDate as unknown as Row;
    const template=activeDateRow.together_date_templates as Row|undefined;
    const locationId=template?.location_id?String(template.location_id):base.locationId;
    const place=locationId?await resolvePlaceContext({db:input.db,locationId,now,userId:input.userId,characterInstanceId:input.characterInstanceId}).catch(()=>base.placeContext):base.placeContext;
    const validUntil=activeDateRow.metadata?.ends_at??(template?.metadata?.durationMinutes?new Date(now.getTime()+Number(template.metadata.durationMinutes)*60000).toISOString():undefined);
    return {characterInstanceId:input.characterInstanceId,locationId,worldId:place?.world.id??base.placeContext?.world.id??null,activityKey:'date',activity:String(template?.name??base.activity),mood:'present',energy:'medium',availability:'with you',interruptibility:'open',source:'active_date',sourceEventId:String(activeDateRow.id),validUntil,placeContext:place,activityStartedAt:String(activeDateRow.started_at??activeDateRow.scheduled_for??now.toISOString()),expectedEndAt:validUntil};
  }
  const source=base.source==='plan'?'active_plan':base.source==='life_event'?'active_event':base.source==='schedule'?'schedule':'character_state';
  return {characterInstanceId:input.characterInstanceId,locationId:base.locationId,worldId:base.placeContext?.world.id??null,activityKey:base.activityKey,activity:base.activity,mood:'present',energy:'medium',availability:base.interruptibility==='open'?'available':base.interruptibility==='limited'?'limited':'busy',interruptibility:base.interruptibility,source,sourceEventId:base.scheduleEventId,validUntil:base.expectedEndAt,placeContext:base.placeContext,activityStartedAt:base.activityStartedAt,expectedEndAt:base.expectedEndAt,scheduleEventId:base.scheduleEventId,state:base.state,nextEvent:base.nextEvent};
}

export async function extendScheduleForConversation(input:{db:SupabaseClient;userId:string;characterInstanceId:string;conversationId:string;scheduleEventId?:string;now?:Date}){
  if(!input.scheduleEventId)return null;const now=input.now??new Date();
  const{data:event}=await input.db.from('together_character_schedule_events').select('*').eq('id',input.scheduleEventId).eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).maybeSingle();
  if(!event)return null;const ended=new Date(event.ends_at);if(now<ended||now.getTime()-ended.getTime()>30*60000)return null;
  const replacementEnd=new Date(now.getTime()+15*60000),key=`override:conversation:${input.conversationId}:${event.id}:${ended.toISOString()}`;
  const{data:override}=await input.db.from('together_character_schedule_overrides').insert({user_id:input.userId,continuity_id:event.continuity_id,character_instance_id:input.characterInstanceId,schedule_event_id:event.id,reason:'conversation_extension',original_start:event.starts_at,original_end:event.ends_at,replacement_start:event.starts_at,replacement_end:replacementEnd.toISOString(),replacement_location_id:event.location_id,replacement_activity_key:event.activity_key,metadata:{conversationId:input.conversationId}}).select('*').maybeSingle();
  await input.db.from('together_character_schedule_events').upsert({user_id:input.userId,continuity_id:event.continuity_id,character_instance_id:input.characterInstanceId,location_id:event.location_id,activity_key:event.activity_key,title:event.title,starts_at:event.ends_at,ends_at:replacementEnd.toISOString(),priority:'relationship_event',visibility:'hidden',source:'override',interruptibility:'open',participant_instance_ids:event.participant_instance_ids,generation_key:key,generation_version:ENGINE_VERSION,metadata:{conversationId:input.conversationId,originalScheduleEventId:event.id,reason:'conversation_extension'}},{onConflict:'character_instance_id,generation_key',ignoreDuplicates:true});
  return override??null;
}

function lifeProfile(instance:Row):CharacterLifeProfile{const configured=instance.together_character_versions?.life_config;if(configured?.version&&configured.sleep&&configured.lifestyle&&configured.scheduling)return configured;const traits=instance.together_character_versions?.personality_config??{};return{version:1,occupation:{title:String(instance.together_character_templates?.occupation??'independent professional'),workPattern:'hybrid',flexibility:.5,workDays:[1,2,3,4,5],startRange:{startMinute:540,endMinute:630},durationMinutes:[360,480]},sleep:{preferredBedtime:{startMinute:1320,endMinute:1430},preferredWakeTime:{startMinute:420,endMinute:540},variabilityMinutes:35,weekendShiftMinutes:60},lifestyle:{social:Number(traits.socialEnergy??.5),adventurous:Number(traits.spontaneity??.5),spontaneous:Number(traits.spontaneity??.5),fitness:.4,nightlife:.35,outdoors:.5,homebody:.55,creativity:Number(traits.creativity??.6)},interests:instance.together_character_versions?.interests??[],scheduling:{repetitionTolerance:.45,spontaneity:Number(traits.spontaneity??.45),preferredDailyActivityCount:[2,3]}};}
function toLifeLocation(row:Row):LifeLocation{return{id:String(row.id),worldId:String(row.world_id),name:String(row.name),category:String(row.category??'other'),locationType:String(row.location_type??'venue'),supportedActivities:Array.isArray(row.possible_activities)?row.possible_activities.map(String):[],tags:Array.isArray(row.metadata?.tags)?row.metadata.tags.map(String):[],hours:row.hours??{},typicalDurationMinutes:Array.isArray(row.metadata?.typicalDurationMinutes)?row.metadata.typicalDurationMinutes:undefined};}
function toActivityTemplate(row:Row):ActivityTemplate{return{key:String(row.activity_key),title:String(row.title),category:String(row.category),validTimeWindows:Array.isArray(row.valid_time_windows)?row.valid_time_windows:[],durationMinutes:parseRange(row.duration_minutes,[45,90]),locationCategories:row.location_categories??[],locationSlugs:row.location_slugs??[],tags:row.tags??[],affinity:Number(row.affinity??.5),preferredWeeklyFrequency:parseRange(row.preferred_weekly_frequency,[0,2]),maximumWeeklyFrequency:Number(row.maximum_weekly_frequency??2),minimumGapHours:Number(row.minimum_gap_hours??18),energyRequirement:row.energy_requirement??undefined,socialRequirement:row.social_requirement??'either',priority:row.priority??'preferred_activity',visibility:row.visibility??'hidden',interruptibility:row.interruptibility??'open',activityLabel:row.metadata?.activityLabel??row.title,upcomingHint:row.metadata?.upcomingHint,outcomeEligible:row.metadata?.outcomeEligible===true,outcomeProbability:Number(row.metadata?.outcomeProbability??0),outcomeVariants:Array.isArray(row.metadata?.outcomeVariants)?row.metadata.outcomeVariants.map(String):[],rare:row.metadata?.rare===true};}
function toBlock(row:Row):ScheduleBlock{return{id:String(row.id),activityKey:String(row.activity_key),title:String(row.title),locationId:row.location_id?String(row.location_id):null,startsAt:String(row.starts_at),endsAt:String(row.ends_at),priority:row.priority,visibility:row.visibility,source:row.source,interruptibility:row.interruptibility,participantInstanceIds:row.participant_instance_ids??[],generationKey:String(row.generation_key),metadata:row.metadata??{}};}
function legacyBlocks(rows:Row[],timezone:string,startDate:string,days:number,worldId:string,homeLocationId:string){const out:ScheduleBlock[]=[];for(let day=0;day<days;day++){const date=addDays(startDate,day),weekday=new Date(`${date}T12:00:00Z`).getUTCDay();for(const row of rows){const metadata=row.metadata??{},authored=metadata.scheduleMode==='authored',rowWorld=String(row.together_locations?.world_id??'');if(Number(row.day_of_week)!==weekday||(row.location_id&&rowWorld!==worldId))continue;const title=authoredActivity(row,date),locationId=row.location_id?String(row.location_id):homeLocationId;out.push({activityKey:String(metadata.activityKey??row.activity),title,locationId,startsAt:localToUtc(date,Number(row.start_minute),timezone).toISOString(),endsAt:localToUtc(date,Number(row.end_minute),timezone).toISOString(),priority:metadata.priority??(/work|class|shift/i.test(String(row.activity))?'hard_obligation':'recurring_routine'),visibility:metadata.profileVisibility==='hidden'?'hidden':authored?'known':row.availability==='busy'?'known':'hidden',source:'recurring',interruptibility:row.availability==='busy'?'busy':row.availability==='limited'?'limited':'open',generationKey:`legacy:${row.id}:${date}`,metadata:{...metadata,legacyTemplateId:row.id,activityLabel:title}});}}return out;}
function authoredActivity(row:Row,date:string){const variants=Array.isArray(row.metadata?.activityVariants)?row.metadata.activityVariants.filter((value:unknown)=>typeof value==='string'&&Boolean(value.trim())):[];if(!variants.length)return String(row.activity);return String(variants[stableIndex(`${row.id}:${date}`,variants.length)]);}
function stableIndex(seed:string,length:number){let hash=0;for(let index=0;index<seed.length;index+=1)hash=(Math.imul(31,hash)+seed.charCodeAt(index))|0;return(hash>>>0)%length;}
function defaultActivities():ActivityTemplate[]{return[{key:'walk',title:'Taking a walk',category:'outdoors',validTimeWindows:[{startMinute:480,endMinute:1260}],durationMinutes:[45,90],locationCategories:['outdoor','park'],tags:['outdoors'],affinity:.6,preferredWeeklyFrequency:[1,4],maximumWeeklyFrequency:4,minimumGapHours:18,priority:'preferred_activity',visibility:'hidden',interruptibility:'open'},{key:'home_evening',title:'Having a quiet night at home',category:'home',validTimeWindows:[{startMinute:1080,endMinute:1380}],durationMinutes:[75,180],locationCategories:['residence'],tags:['home'],affinity:.75,preferredWeeklyFrequency:[2,7],maximumWeeklyFrequency:7,minimumGapHours:6,priority:'preferred_activity',visibility:'hidden',interruptibility:'open'}];}
function resolveOccupationLocations(profile:CharacterLifeProfile,locations:Row[]):CharacterLifeProfile{
  if(!profile.occupation)return profile;
  const bySlug=(value:unknown)=>locations.find(location=>String(location.slug)===String(value));
  const primary=bySlug(profile.occupation.primaryLocationSlug);
  const scheduleBlocks=profile.occupation.scheduleBlocks?.map(item=>{const location=bySlug(item.primaryLocationSlug);return location?{...item,primaryLocationId:String(location.id)}:item;});
  return{...profile,occupation:{...profile.occupation,...(primary?{primaryLocationId:String(primary.id)}:{}),...(scheduleBlocks?{scheduleBlocks}:{})}};
}
function parseRange(value:unknown,fallback:[number,number]):[number,number]{if(Array.isArray(value)&&value.length>=2)return[Number(value[0]),Number(value[1])];if(typeof value==='string'){const match=value.match(/[[(](\d+),(\d+)[)\]]/);if(match)return[Number(match[1]),Math.max(Number(match[1]),Number(match[2])-1)];}return fallback;}
function activityRequiresHome(activityKey:string,activity:string){return activityKey==='sleep'||/\b(?:at home|home for the|home tonight)\b/i.test(activity);}
function sceneActivityLabel(state:Row|undefined,activityKey:string){const explicit=typeof state?.activityLabel==='string'?state.activityLabel.trim():'';if(explicit)return explicit;const normalized=activityKey.replace(/[_-]+/g,' ').trim();return normalized&&normalized!=='together'?normalized.replace(/^./,(value)=>value.toUpperCase()):'Spending time together';}
function localDate(value:Date|string,timezone:string){const date=typeof value==='string'?new Date(value):value;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),get=(type:string)=>parts.find(item=>item.type===type)?.value??'';return`${get('year')}-${get('month')}-${get('day')}`;}
function addDays(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
