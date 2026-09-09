import type { SupabaseClient } from '@supabase/supabase-js';
import { calderTravelMinutes, overlayCalderInterval, reserveCalderEvent, type CalderInterval, type CalderLocation, type CalderTravel } from '../../../packages/together-domain/src/calders-schedule.ts';
import { localToUtc, type ScheduleBlock } from '../../../packages/together-domain/src/life-engine.ts';
import { CALDERS_WORLD_ID, loadWorldProgress } from './kivelle-world-progress.ts';
import { experienceClock } from './kivelle-time.ts';
import { requestRead } from './request-context.ts';
import { AppError } from './types.ts';
type Row=Record<string,any>;

export async function ensureCalderSchedule(input:{db:SupabaseClient;userId:string;instance:Row;timezone:string;now:Date;days:number;persist?:boolean;excludePlanId?:string;excludeDateId?:string;proposed?:{id:string;startsAt:string;endsAt:string;locationId:string;activity:string}}):Promise<ScheduleBlock[]> {
  const {db,userId,instance,timezone,now,days}=input;
  const date=experienceClock(timezone,now).localDate;
  const {state,version}=await loadWorldProgress(db,userId,CALDERS_WORLD_ID,String(instance.continuity_id));
  const [catalog,baseline,plans,dates]=await Promise.all([
    requestRead(db,['calders-runtime'],()=>db.from('together_world_canon_sources').select('payload').eq('world_id',CALDERS_WORLD_ID).eq('content_key','world:runtime').single()),
    db.from('together_schedule_templates').select('*').eq('character_version_id',instance.character_version_id).order('start_minute'),
    db.from('together_shared_plans').select('*').eq('user_id',userId).eq('continuity_id',instance.continuity_id).contains('participant_instance_ids',[instance.id]).in('status',['scheduled','active']),
    db.from('together_date_sessions').select('*,together_date_templates(location_id,name)').eq('user_id',userId).eq('continuity_id',instance.continuity_id).eq('character_instance_id',instance.id).in('status',['upcoming','active']),
  ]);
  if(catalog.error||baseline.error||plans.error||dates.error)throw new AppError('INTERNAL_ERROR','Calder’s Run could not prepare this schedule.',500,true);
  const runtime=catalog.data.payload as {locations:CalderLocation[];travel:CalderTravel;events:Row[]};
  const allRows=baseline.data??[],actorId=String(instance.character_template_id);
  const flags:string[]=Array.isArray(state.flags)?state.flags:[];
  const ownHomes=runtime.locations.filter(l=>l.home&&l.ownerId===actorId).map(l=>`home.invited:${l.id}`);
  const actorFlags=[...flags,...ownHomes,...(allRows.some(row=>row.metadata?.accessGate==='crowcut.access_granted')?['crowcut.access_granted']:[])];
  const output:ScheduleBlock[]=[];
  const epoch=localToUtc(date,0,timezone).getTime(),toMinute=(value:string)=>(new Date(value).getTime()-epoch)/60000;
  const windows:CalderInterval[]=[];
  for(let offset=-1;offset<=days;offset++) {
    const day=addDays(date,offset),weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
    const rows=allRows.filter(row=>row.day_of_week===weekday);
    for(const row of rows) {
      const metadata=row.metadata??{},start=(localToUtc(day,Number(row.start_minute),timezone).getTime()-epoch)/60000,end=(localToUtc(day,Number(row.end_minute),timezone).getTime()-epoch)/60000,arrival=Math.min(end,(localToUtc(day,Number(metadata.baselineArrivalMinute??row.start_minute),timezone).getTime()-epoch)/60000);
      const authoredLocationId=String(metadata.authoringLocationId??row.location_id),location=runtime.locations.find(l=>l.id===authoredLocationId);
      const previousRow=allRows.find(other=>other.day_of_week===(row.start_minute===0?(weekday+6)%7:weekday)&&other.end_minute===(row.start_minute===0?1440:row.start_minute));
      const previous=previousRow?String(previousRow.metadata?.authoringLocationId??previousRow.location_id):authoredLocationId;
      const travel=calderTravelMinutes(previous,authoredLocationId,runtime.locations,runtime.travel,actorFlags);
      if(arrival>start&&travel===null) {
        windows.push({id:`${row.id}:${day}`,start,end,locationId:previous,activity:'Travel is delayed; remaining at the previous place',kind:'baseline',priority:1,blocked:true});continue;
      }
      if(arrival>start)windows.push({id:`${row.id}:${day}:travel`,start,end:arrival,locationId:null,activity:'On the way',kind:'travel',priority:1});
      windows.push({id:`${row.id}:${day}`,start:arrival,end,locationId:authoredLocationId,activity:row.activity,kind:'baseline',priority:1,privateHomeId:location?.home?location.id:undefined});
    }
  }
  let intervals=windows.sort((a,b)=>a.start-b.start);
  for(const transition of state.transitions??[]){
    if(transition.departingCharacterId!==actorId)continue;
    if(transition.kind==='absence'&&transition.returnAt){
      const start=toMinute(transition.recordedAt),end=toMinute(transition.returnAt);
      if(end>(intervals[0]?.start??0)&&start<(intervals.at(-1)?.end??0))intervals=overlayCalderInterval(intervals,{id:`absence:${transition.arcSlug}`,start,end,locationId:null,activity:'Away with an agreed return; keeping in touch by correspondence',kind:'story',priority:4});
    }
    if(transition.kind==='relocation'&&transition.locationId){
      intervals=intervals.map(interval=>interval.end<=toMinute(transition.recordedAt)?interval:{...interval,locationId:transition.locationId,activity:'Building an independent life from the agreed new base',privateHomeId:undefined});
    }
  }
  const reservations=[...(state.reservations??[]).filter((r:Row)=>r.characterId===actorId).map((r:Row)=>({...r,kind:'story'})),...(plans.data??[]).filter(p=>p.id!==input.excludePlanId).map(p=>({id:p.id,startsAt:p.starts_at,endsAt:p.ends_at,locationId:p.location_id,activity:p.title,kind:'appointment'})),...(dates.data??[]).filter(d=>d.id!==input.excludeDateId&&(d.scheduled_for||d.started_at)).map(d=>({id:d.id,startsAt:d.started_at??d.scheduled_for,endsAt:d.state?.reservedDateEndsAt??new Date(new Date(d.started_at??d.scheduled_for).getTime()+90*60000).toISOString(),locationId:d.together_date_templates?.location_id,activity:d.together_date_templates?.name??'An agreed outing',kind:'appointment'}))];
  for(const r of reservations) {
    if(!r.locationId||!r.startsAt||!r.endsAt)continue;
    const result=reserveCalderEvent({intervals,reservation:{id:String(r.id),start:toMinute(r.startsAt),end:toMinute(r.endsAt),locationId:String(r.locationId),activity:String(r.activity),kind:r.kind as 'story'|'appointment'},locations:runtime.locations,travel:runtime.travel,flags:actorFlags});
    if(result.accepted)intervals=result.intervals;
  }
  if(input.proposed){
    const p=input.proposed;
    const quote=reserveCalderEvent({intervals,reservation:{id:p.id,start:toMinute(p.startsAt),end:toMinute(p.endsAt),locationId:p.locationId,activity:p.activity,kind:'appointment'},locations:runtime.locations,travel:runtime.travel,flags});
    if(!quote.accepted)throw new AppError('PLAN_CONFLICT','There is not enough time or access for this outing and the journeys around it. Choose another time or place.',409,true);
    intervals=quote.intervals;
  }
  for(let offset=-1;offset<=days;offset++) {
    const day=addDays(date,offset),weekday=new Date(`${day}T12:00:00Z`).getUTCDay();
    for(const event of runtime.events.filter(e=>e.dayOfWeek===weekday&&e.characterIds.includes(actorId))) {
      const gate=String(event.accessGate),publicEvent=gate.startsWith('public');
      const result=reserveCalderEvent({intervals,reservation:{id:`${event.id}:${day}`,start:(localToUtc(day,minute(event.startsAt),timezone).getTime()-epoch)/60000,end:(localToUtc(day,minute(event.endsAt),timezone).getTime()-epoch)/60000,locationId:event.locationId,activity:event.summary,kind:'event',requiredState:publicEvent?null:`event.invited:${event.id}`},locations:runtime.locations,travel:runtime.travel,flags:actorFlags});
      if(result.accepted)intervals=result.intervals;
    }
  }
  const signature=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(reservations)));
  const digest=Array.from(new Uint8Array(signature)).slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('');
  const generationVersion=`calders_schedule_v2:${timezone}:${version}:${digest}`;
  for(const interval of intervals.filter(i=>i.end>0&&i.start<(localToUtc(addDays(date,days),0,timezone).getTime()-epoch)/60000)) {
    const location=runtime.locations.find(l=>l.id===interval.locationId),home=location?.home;
    const locationId=home?location.districtId:interval.locationId;
    output.push({activityKey:interval.kind==='travel'?'travel':home?(/sleep|asleep/i.test(interval.activity)?'sleep':'home_private'):interval.kind==='event'?'community_event':'calders_routine',title:interval.activity,locationId,startsAt:new Date(epoch+interval.start*60000).toISOString(),endsAt:new Date(epoch+interval.end*60000).toISOString(),priority:interval.priority>=3?'user_commitment':'recurring_routine',visibility:home||interval.kind==='travel'||location?.requiredState&&!flags.includes(location.requiredState)?'hidden':'known',source:'recurring',interruptibility:interval.kind==='travel'||interval.kind==='story'&&!interval.locationId?'unavailable':home?'busy':'limited',generationKey:`${generationVersion}:${interval.id}:${interval.start}`,metadata:{reservationId:interval.id,activityLabel:interval.activity,source:'calders_run_authoring_v1',homeId:interval.privateHomeId??null,reservationKind:interval.kind,blocked:interval.blocked??false,worldProgressVersion:version,scheduleTimezone:timezone}});
  }
  if(input.persist===false)return output;
  const from=new Date(epoch).toISOString(),until=localToUtc(addDays(date,days),0,timezone).toISOString();
  const removed=await db.from('together_character_schedule_events').delete().eq('user_id',userId).eq('character_instance_id',instance.id).eq('source','recurring').neq('generation_version',generationVersion).gte('ends_at',from);
  if(removed.error)throw removed.error;
  if(output.length){const saved=await db.from('together_character_schedule_events').upsert(output.map(e=>({user_id:userId,continuity_id:instance.continuity_id,character_instance_id:instance.id,location_id:e.locationId,activity_key:e.activityKey,title:e.title,starts_at:e.startsAt,ends_at:e.endsAt,priority:e.priority,visibility:e.visibility,source:e.source,interruptibility:e.interruptibility,participant_instance_ids:[instance.id],generation_key:e.generationKey,generation_version:generationVersion,metadata:e.metadata})),{onConflict:'character_instance_id,generation_key'});if(saved.error)throw saved.error;}
  const saved=await db.from('together_character_schedule_events').select('*').eq('user_id',userId).eq('character_instance_id',instance.id).eq('generation_version',generationVersion).gte('ends_at',from).lte('starts_at',until).order('starts_at');
  if(saved.error)throw saved.error;
  return (saved.data??[]).map(r=>({id:r.id,activityKey:r.activity_key,title:r.title,locationId:r.location_id,startsAt:r.starts_at,endsAt:r.ends_at,priority:r.priority,visibility:r.visibility,source:r.source,interruptibility:r.interruptibility,generationKey:r.generation_key,metadata:r.metadata}));
}
function minute(value:string){const[h,m]=value.split(':').map(Number);return h!*60+m!;}
function addDays(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}

export async function validateCalderOuting(input:{db:SupabaseClient;userId:string;characterInstanceId:string;locationId:string;startsAt:Date;endsAt:Date;timezone:string;excludePlanId?:string;excludeDateId?:string;immediate?:boolean}){
  const {data:instance,error}=await input.db.from('together_character_instances').select('*,together_character_versions(life_config)').eq('id',input.characterInstanceId).eq('user_id',input.userId).single();
  if(error||!instance)throw new AppError('NOT_FOUND','That companion is unavailable.',404);
  // Player-created companions retain the standard life engine in this world.
  if(instance.together_character_versions?.life_config?.source!=='calders_run_authoring_v1')return {};
  if(input.immediate&&input.excludeDateId){
    const scheduled=await ensureCalderSchedule({db:input.db,userId:input.userId,instance,timezone:input.timezone,now:input.startsAt,days:1,persist:false});
    const arrival=scheduled.find(b=>b.metadata?.reservationId===input.excludeDateId&&b.locationId===input.locationId&&Date.parse(b.startsAt)<=input.startsAt.getTime()&&Date.parse(b.endsAt)>input.startsAt.getTime());
    if(arrival)return {travelReservationStartsAt:arrival.startsAt,travelReservationEndsAt:arrival.endsAt,reservedDateEndsAt:arrival.endsAt};
  }
  const id='proposed-outing';
  const blocks=await ensureCalderSchedule({db:input.db,userId:input.userId,instance,timezone:input.timezone,now:input.startsAt,days:3,persist:false,excludePlanId:input.excludePlanId,excludeDateId:input.excludeDateId,proposed:{id,startsAt:input.startsAt.toISOString(),endsAt:input.endsAt.toISOString(),locationId:input.locationId,activity:'An agreed outing'}});
  const reserved=blocks.filter(b=>String(b.metadata?.reservationId??'').startsWith(id));
  const startsAt=reserved.length?Math.min(...reserved.map(b=>new Date(b.startsAt).getTime())):input.startsAt.getTime();
  const endsAt=reserved.length?Math.max(...reserved.map(b=>new Date(b.endsAt).getTime())):input.endsAt.getTime();
  if(input.immediate&&startsAt<Date.now()-60_000)throw new AppError('PLAN_CONFLICT','Allow time to reach this place before the outing starts.',409,true);
  return {travelReservationStartsAt:new Date(startsAt).toISOString(),travelReservationEndsAt:new Date(endsAt).toISOString()};
}
