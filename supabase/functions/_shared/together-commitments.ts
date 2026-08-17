import type{SupabaseClient}from'@supabase/supabase-js';
import{classifyMissExplanation,deriveCommitmentTemporalState,missedCommitmentRepairImpact}from'../../../packages/together-domain/src/index.ts';
import{AppError}from'./types.ts';
import{writeConversationEvent}from'./together-plans.ts';

type Row=Record<string,any>;

export async function loadCommitmentState(db:SupabaseClient,userId:string,planId:string,now=new Date()){
  const[{data:plan},{data:attendance},{data:resolution}]=await Promise.all([
    db.from('together_shared_plans').select('*,together_locations(name,slug),together_worlds(name,slug,timezone)').eq('id',planId).eq('user_id',userId).maybeSingle(),
    db.from('together_plan_attendance').select('*').eq('plan_id',planId).eq('user_id',userId).order('joined_at'),
    db.from('together_missed_plan_resolutions').select('*').eq('plan_id',planId).eq('user_id',userId).maybeSingle(),
  ]);
  if(!plan)throw new AppError('NOT_FOUND','That commitment is unavailable.',404);
  return decorateCommitment(plan,attendance??[],resolution??null,now);
}

export function decorateCommitment(plan:Row,attendance:Row[],resolution:Row|null,now=new Date()){
  const userAttendance=attendance.find((row)=>row.participant_type==='user'),characterAttendance=attendance.find((row)=>row.participant_type==='character');
  const temporalState=deriveCommitmentTemporalState({status:String(plan.status),startsAt:plan.starts_at,endsAt:plan.ends_at,windowStartsAt:plan.window_starts_at,windowEndsAt:plan.window_ends_at,graceEndsAt:plan.grace_ends_at,timezone:plan.world_timezone,participationMode:plan.participation_mode,userJoinedAt:userAttendance?.joined_at,characterJoinedAt:characterAttendance?.joined_at},now);
  return{...plan,attendance:{user:userAttendance??null,character:characterAttendance??null},missResolution:resolution,temporalState};
}

export async function joinCommitment(db:SupabaseClient,input:{userId:string;continuityId:string;characterInstanceId:string;planId:string;source?:'app'|'date'|'trip'|'recovery';now?:Date}){
  const now=input.now??new Date();
  const{data:plan}=await db.from('together_shared_plans').select('*').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('character_instance_id',input.characterInstanceId).maybeSingle();
  if(!plan)throw new AppError('NOT_FOUND','That commitment is unavailable.',404);
  if(['completed','cancelled'].includes(plan.status))throw new AppError('CONFLICT','That commitment is already over.',409);
  if(plan.status==='missed')throw new AppError('PLAN_MISSED','That commitment has already been marked missed. Talk about what happened or make a new plan.',409);
  if(!plan.starts_at)throw new AppError('PLAN_TIME_UNRESOLVED','Choose an exact time before joining.',409,true);
  const starts=new Date(plan.starts_at),grace=new Date(plan.grace_ends_at??starts.getTime()+Number(plan.grace_minutes??30)*60000);
  if(now.getTime()<starts.getTime()-30*60000)throw new AppError('TOO_EARLY','This commitment is not ready to join yet.',409,true);
  if((plan.participation_mode??'live')==='live'&&now>grace)throw new AppError('PLAN_MISSED','The grace period for this commitment has ended.',409);
  const{data:existing}=await db.from('together_plan_attendance').select('id').eq('plan_id',plan.id).eq('user_id',input.userId).eq('participant_type','user').maybeSingle();
  const attendancePayload={user_id:input.userId,continuity_id:input.continuityId,plan_id:plan.id,participant_type:'user',character_instance_id:null,joined_at:now.toISOString(),left_at:null,source:input.source??'app',metadata:{joinedFrom:'client'}};
  const attendanceWrite=existing?await db.from('together_plan_attendance').update({joined_at:now.toISOString(),left_at:null,source:input.source??'app',metadata:{joinedFrom:'client'},updated_at:now.toISOString()}).eq('id',existing.id).eq('user_id',input.userId):await db.from('together_plan_attendance').insert(attendancePayload);
  if(attendanceWrite.error)throw new AppError('INTERNAL_ERROR','Could not record your arrival.',500,true);
  if(plan.status==='scheduled'&&now>=starts)await db.from('together_shared_plans').update({status:'active',updated_at:now.toISOString()}).eq('id',plan.id).eq('user_id',input.userId);
  await db.rpc('kivelle_progress_shared_plans',{p_user_id:input.userId,p_character_instance_id:input.characterInstanceId,p_now:now.toISOString()});
  if(plan.source_conversation_id)await writeConversationEvent(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,conversationId:String(plan.source_conversation_id),eventType:'plan_joined',entityType:'shared_plan',entityId:String(plan.id),metadata:{title:plan.title,joinedAt:now.toISOString()}}).catch(()=>undefined);
  return loadCommitmentState(db,input.userId,String(plan.id),now);
}

export async function leaveCommitment(db:SupabaseClient,input:{userId:string;continuityId:string;planId:string;now?:Date}){
  const now=input.now??new Date();
  const{data:plan}=await db.from('together_shared_plans').select('id,status').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle();
  if(!plan)throw new AppError('NOT_FOUND','That commitment is unavailable.',404);
  await db.from('together_plan_attendance').update({left_at:now.toISOString(),updated_at:now.toISOString()}).eq('plan_id',plan.id).eq('user_id',input.userId).eq('participant_type','user').is('left_at',null);
  return loadCommitmentState(db,input.userId,String(plan.id),now);
}

export async function explainMissedCommitment(db:SupabaseClient,input:{userId:string;continuityId:string;characterInstanceId:string;planId:string;explanation:string;conversationId?:string;now?:Date}){
  const now=input.now??new Date(),explanation=input.explanation.trim();
  if(!explanation)throw new AppError('VALIDATION_FAILED','Say what happened first.',400);
  const[{data:plan},{data:resolution},{data:relationship}]=await Promise.all([
    db.from('together_shared_plans').select('*').eq('id',input.planId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('character_instance_id',input.characterInstanceId).maybeSingle(),
    db.from('together_missed_plan_resolutions').select('*').eq('plan_id',input.planId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle(),
    db.from('together_relationship_states').select('*').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).maybeSingle(),
  ]);
  if(!plan||plan.status!=='missed'||!resolution)throw new AppError('CONFLICT','There is no missed commitment waiting for an explanation.',409);
  if(['system_failure','connection_failure','character_absent','cancelled'].includes(String(resolution.miss_reason)))return loadCommitmentState(db,input.userId,input.planId,now);
  const signals=classifyMissExplanation(explanation);
  const repair=missedCommitmentRepairImpact({impact:resolution.impact_applied??{},...signals});
  if(relationship){
    await db.from('together_relationship_states').update({trust:clamp(Number(relationship.trust)+repair.trust),respect:clamp(Number(relationship.respect)+repair.respect),conflict:clamp(Number(relationship.conflict)+repair.conflict),affinity:clamp(Number(relationship.affinity)+repair.affinity),last_relationship_delta:repair,recent_direction:signals.dismissive?'strained':repair.trust>0||repair.conflict<0?'repairing':relationship.recent_direction,updated_at:now.toISOString()}).eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId);
  }
  const nextStatus=signals.dismissive?'unresolved':signals.apology&&signals.attemptedRepair?'repaired':'explained';
  await db.from('together_missed_plan_resolutions').update({status:nextStatus,explanation,explained_at:now.toISOString(),repair_attempted_at:signals.attemptedRepair?now.toISOString():resolution.repair_attempted_at,repair_impact:repair,metadata:{...(resolution.metadata??{}),explanationSignals:signals},updated_at:now.toISOString(),...(nextStatus==='repaired'?{resolved_at:now.toISOString()}:{})}).eq('id',resolution.id).eq('user_id',input.userId);
  const conversationId=input.conversationId??plan.source_conversation_id;
  if(conversationId&&nextStatus==='repaired')await writeConversationEvent(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,conversationId:String(conversationId),eventType:'plan_repaired',entityType:'shared_plan',entityId:String(plan.id),metadata:{title:plan.title,repairImpact:repair}}).catch(()=>undefined);
  return loadCommitmentState(db,input.userId,input.planId,now);
}

export async function maybeRecordMissExplanationFromMessage(db:SupabaseClient,input:{userId:string;continuityId:string;characterInstanceId:string;conversationId:string;text:string;now?:Date}){
  const signals=classifyMissExplanation(input.text);if(!signals.apology&&!signals.credibleReason&&!signals.attemptedRepair&&!signals.dismissive)return null;
  const{data:resolution}=await db.from('together_missed_plan_resolutions').select('plan_id,status').eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('character_instance_id',input.characterInstanceId).in('status',['awaiting_explanation','unresolved']).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(!resolution)return null;
  return explainMissedCommitment(db,{...input,planId:String(resolution.plan_id),explanation:input.text});
}

export async function createWindowedCommitment(db:SupabaseClient,input:{userId:string;continuityId:string;characterInstanceId:string;activityKey:string;locationId:string;windowStartsAt:string;windowEndsAt:string;timePrecision:'approximate'|'daypart'|'window'|'day';originalTimeExpression?:string;note?:string;source:'chat'|'manual_planner'|'location'|'discover'|'date'|'story';sourceConversationId?:string;sourceMessageId?:string;requestId:string;title?:string;participationMode?:'live'|'flexible'|'ambient';userTimezone?:string}){
  const start=new Date(input.windowStartsAt),end=new Date(input.windowEndsAt);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw new AppError('VALIDATION_FAILED','That planning window is invalid.',400);
  if(start.getTime()<Date.now()-5*60000||start.getTime()>Date.now()+60*86400000)throw new AppError('VALIDATION_FAILED','Choose a time window within the next 60 days.',400);
  const[{data:instance},{data:location}]=await Promise.all([
    db.from('together_character_instances').select('id,continuity_id').eq('id',input.characterInstanceId).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle(),
    db.from('together_locations').select('*,together_worlds(id,name,timezone,access_type,entitlement_key)').eq('id',input.locationId).maybeSingle(),
  ]);
  if(!instance||!location)throw new AppError('NOT_FOUND','That companion or place is unavailable.',404);
  const world=(location as Row).together_worlds as Row|undefined;
  if(world?.access_type!=='free'){
    const{data:access}=await db.from('together_user_worlds').select('access_status').eq('user_id',input.userId).eq('world_id',location.world_id).eq('access_status','unlocked').maybeSingle();
    if(!access)throw new AppError('WORLD_LOCKED',`${world?.name??'That world'} is not available on this account yet.`,403);
  }
  const activity=input.activityKey.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');if(!activity)throw new AppError('VALIDATION_FAILED','Choose something to do together.',400);
  const title=(input.title?.trim()||`${titleCase(activity)} at ${location.name}`).slice(0,160);
  const{data,error}=await db.from('together_shared_plans').insert({user_id:input.userId,continuity_id:input.continuityId,character_instance_id:input.characterInstanceId,title,activity_key:activity,world_id:location.world_id,location_id:location.id,starts_at:null,ends_at:null,window_starts_at:start.toISOString(),window_ends_at:end.toISOString(),time_precision:input.timePrecision,world_timezone:String(world?.timezone??'UTC'),user_timezone:input.userTimezone??'UTC',original_time_expression:input.originalTimeExpression??null,participation_mode:input.participationMode??'live',status:'proposed',source:input.source,source_conversation_id:input.sourceConversationId??null,source_message_id:input.sourceMessageId??null,note:input.note?.trim()||null,grace_minutes:30,companion_state:'expected',metadata:{requestId:input.requestId,durationMinutes:90,significance:.45,proposedWindow:true,completionSummary:`You and your companion spent time together for ${title}.`,locationSlug:location.slug}}).select('*').single();
  if(error){if(error.code==='23505'){const{data:existing}=await db.from('together_shared_plans').select('*').eq('user_id',input.userId).eq('metadata->>requestId',input.requestId).maybeSingle();if(existing)return existing;}throw new AppError('INTERNAL_ERROR','Could not save that planning window.',500,true);}
  if(input.sourceConversationId)await writeConversationEvent(db,{userId:input.userId,characterInstanceId:input.characterInstanceId,conversationId:input.sourceConversationId,eventType:'plan_proposed',entityType:'shared_plan',entityId:String(data.id),metadata:{title:data.title,windowStartsAt:data.window_starts_at,windowEndsAt:data.window_ends_at,timePrecision:data.time_precision,locationId:data.location_id}});
  return data;
}

function clamp(value:number){return Math.max(0,Math.min(100,Number.isFinite(value)?value:0));}
function titleCase(value:string){return value.replace(/_/g,' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());}

