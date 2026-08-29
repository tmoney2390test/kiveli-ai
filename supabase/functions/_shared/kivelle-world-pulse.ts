import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAroundTownFeed, selectWorldPulseForContext, stableWorldPulseHash, type AroundTownItem, type WorldPulseContextEvent, type WorldPulseEvent } from '../../../packages/together-domain/src/world-pulse.ts';
import { localToUtc } from '../../../packages/together-domain/src/life-engine.ts';
import { experienceClock } from './kivelle-time.ts';

type Row=Record<string,any>;

export async function materializeWorldPulse(input:{db:SupabaseClient;userId:string;continuityId:string;worldId:string;timezone:string;now?:Date;days?:number}){
  const now=input.now??new Date(),days=Math.max(1,Math.min(8,input.days??7));
  const [{data:templates,error:templateError},{data:characters,error:characterError}]=await Promise.all([
    input.db.from('together_world_event_templates').select('*').eq('world_id',input.worldId).eq('active',true).limit(72),
    input.db.from('together_character_instances').select('id,character_template_id,together_character_templates(slug,name,world_id)').eq('user_id',input.userId).eq('continuity_id',input.continuityId).not('introduced_at','is',null),
  ]);
  if(templateError)throw templateError;if(characterError)throw characterError;
  const clock=experienceClock(input.timezone,now),charactersBySlug=new Map<string,Row>();
  for(const character of characters??[]){const template=Array.isArray(character.together_character_templates)?character.together_character_templates[0]:character.together_character_templates;if(template?.slug&&String(template.world_id)===input.worldId)charactersBySlug.set(String(template.slug),{...character,template});}
  const candidates:Array<{template:Row;row:Row}>=[];
  // Materialize a short look-back as well as the next week so returning users
  // can receive real temporal continuity instead of a world that began today.
  for(let offset=-3;offset<days;offset++){
    const localDate=addLocalDays(clock.localDate,offset),weekday=new Date(`${localDate}T12:00:00Z`).getUTCDay();
    for(const template of templates??[]){
      const weekdays=Array.isArray(template.weekdays)?template.weekdays.map(Number):[];if(!weekdays.includes(weekday))continue;
      const probability=Math.max(0,Math.min(1,Number(template.probability??1))),roll=(stableWorldPulseHash(`${input.continuityId}:${template.id}:${localDate}`)%10000)/10000;if(roll>probability)continue;
      const startsAt=localToUtc(localDate,Number(template.start_minute??720),input.timezone),endsAt=new Date(startsAt.getTime()+Number(template.duration_minutes??120)*60000),simulationKey=`world-pulse-v1:${template.id}:${localDate}`;
      const status=endsAt<=now?'completed':startsAt<=now?'active':'scheduled';
      candidates.push({template,row:{user_id:input.userId,continuity_id:input.continuityId,template_id:template.id,world_id:input.worldId,location_id:template.location_id??null,district_location_id:template.district_location_id??null,local_date:localDate,starts_at:startsAt.toISOString(),ends_at:endsAt.toISOString(),status,public_summary:template.summary,atmosphere:template.atmosphere??null,weather:template.weather??{},simulation_key:simulationKey,metadata:{source:'world_pulse_v1'}}});
    }
  }
  if(!candidates.length)return{templates:Number(templates?.length??0),materialized:0};
  const{data:instances,error:instanceError}=await input.db.from('together_world_event_instances').upsert(candidates.map(item=>item.row),{onConflict:'continuity_id,simulation_key'}).select('id,simulation_key,template_id,starts_at,ends_at,status');
  if(instanceError)throw instanceError;
  const candidateByKey=new Map(candidates.map(item=>[String(item.row.simulation_key),item]));
  const participantRows:Row[]=[];
  for(const event of instances??[]){const candidate=candidateByKey.get(String(event.simulation_key));if(!candidate)continue;const selector=candidate.template.participant_selector&&typeof candidate.template.participant_selector==='object'?candidate.template.participant_selector:{};const selected=(Array.isArray(selector.characterSlugs)?selector.characterSlugs:[]).map((slug:unknown)=>charactersBySlug.get(String(slug))).filter(Boolean).slice(0,Math.max(0,Math.min(5,Number(selector.maximum??5))));for(const character of selected)participantRows.push({user_id:input.userId,continuity_id:input.continuityId,world_event_instance_id:event.id,character_instance_id:character.id,role:'participant',attendance_state:event.status==='completed'?'attended':event.status==='active'?'arrived':'expected',knowledge_detail:'full',...(event.status!=='scheduled'?{joined_at:event.starts_at}:{}),...(event.status==='completed'?{left_at:event.ends_at}:{}),metadata:{source:'template_selector'}});}
  if(participantRows.length){const{error:participantError}=await input.db.from('together_world_event_participants').upsert(participantRows,{onConflict:'world_event_instance_id,character_instance_id'});if(participantError)throw participantError;}
  return{templates:Number(templates?.length??0),materialized:Number(instances?.length??0)};
}

export async function loadWorldPulse(input:{db:SupabaseClient;userId:string;continuityId:string;worldId:string;from?:Date;to?:Date;limit?:number}):Promise<WorldPulseEvent[]>{
  const now=new Date(),from=input.from??new Date(now.getTime()-18*3600000),to=input.to??new Date(now.getTime()+7*86400000);
  const {data,error}=await input.db.from('together_world_event_instances').select('*,together_world_event_templates(title,event_type,knowledge_scope,significance,topic_tags,activity_tags,plan_affordances,metadata),together_locations(name,slug),together_world_event_participants(character_instance_id,together_character_instances(together_character_templates(name)))').eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('world_id',input.worldId).neq('status','cancelled').gte('ends_at',from.toISOString()).lte('starts_at',to.toISOString()).order('starts_at').limit(Math.max(1,Math.min(96,input.limit??72)));
  if(error)throw error;
  return(data??[]).map(mapWorldPulseEvent);
}

export async function resolveRelevantWorldPulse(input:{db:SupabaseClient;userId:string;continuityId:string;worldId:string;userMessage:string;currentLocationId?:string|null;districtLocationId?:string|null;characterInstanceId?:string|null;characterIsLocal?:boolean;now?:Date;maximumResults?:number}):Promise<WorldPulseContextEvent[]>{
  const events=await loadWorldPulse({...input,from:new Date((input.now??new Date()).getTime()-18*3600000),to:new Date((input.now??new Date()).getTime()+48*3600000),limit:40});
  return selectWorldPulseForContext(events,{now:input.now,userMessage:input.userMessage,currentLocationId:input.currentLocationId,districtLocationId:input.districtLocationId,characterInstanceId:input.characterInstanceId,characterIsLocal:input.characterIsLocal,maximumResults:input.maximumResults});
}

export async function loadAroundTown(input:{db:SupabaseClient;userId:string;continuityId:string;worldId:string;timezone:string;now?:Date;limit?:number}):Promise<{events:WorldPulseEvent[];items:AroundTownItem[]} >{
  const now=input.now??new Date();await materializeWorldPulse({...input,now});const loaded=await loadWorldPulse({...input,from:new Date(now.getTime()-2*3600000),to:new Date(now.getTime()+7*86400000)});const events=loaded.filter((event)=>event.knowledgeScope==='public'||event.knowledgeScope==='local');return{events,items:buildAroundTownFeed(events,{now,limit:input.limit})};
}

function mapWorldPulseEvent(row:Row):WorldPulseEvent{
  const template=Array.isArray(row.together_world_event_templates)?row.together_world_event_templates[0]:row.together_world_event_templates??{},location=Array.isArray(row.together_locations)?row.together_locations[0]:row.together_locations??{};
  const participants=(row.together_world_event_participants??[]) as Row[];
  return{id:String(row.id),templateId:String(row.template_id),worldId:String(row.world_id),locationId:row.location_id?String(row.location_id):null,districtLocationId:row.district_location_id?String(row.district_location_id):null,title:String(template.title??row.public_summary??'Around town'),summary:String(row.public_summary??''),eventType:String(template.event_type??'community'),startsAt:String(row.starts_at),endsAt:String(row.ends_at),status:String(row.status) as WorldPulseEvent['status'],knowledgeScope:String(template.knowledge_scope??'public') as WorldPulseEvent['knowledgeScope'],significance:Number(template.significance??.5),topicTags:stringArray(template.topic_tags),activityTags:stringArray(template.activity_tags),participantCharacterInstanceIds:participants.map(item=>String(item.character_instance_id)),participantNames:participants.map(item=>{const instance=Array.isArray(item.together_character_instances)?item.together_character_instances[0]:item.together_character_instances;const character=Array.isArray(instance?.together_character_templates)?instance.together_character_templates[0]:instance?.together_character_templates;return String(character?.name??'');}).filter(Boolean),locationName:location.name?String(location.name):null,locationSlug:location.slug?String(location.slug):null,atmosphere:row.atmosphere?String(row.atmosphere):null,weather:row.weather??{},planAffordances:template.plan_affordances??{},metadata:{...(template.metadata??{}),...(row.metadata??{})}};
}
function stringArray(value:unknown){return Array.isArray(value)?value.map(String):[];}
function addLocalDays(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
