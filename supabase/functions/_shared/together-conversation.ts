import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanionPresence, type CompanionPresence } from './together-schedule.ts';
import { finalizeSceneSession } from './kivelle-scene-consolidation.ts';
import { waitUntil } from './background.ts';

export type InteractionMode = 'remote'|'co_present';
export type SceneEntryReason = 'direct_chat'|'user_drop_in'|'shared_plan'|'active_date'|'continued_scene';
export type ActiveConversationScene = {
  version: 1;
  characterInstanceId: string;
  locationId: string;
  worldId: string;
  interactionMode: 'co_present';
  entryReason: Exclude<SceneEntryReason,'direct_chat'>;
  enteredAt: string;
  source: 'presence'|'active_event'|'character_state';
  sourceEventId?: string;
  validUntil?: string;
  arrivalAcknowledgedAt?: string;
  sceneSessionId?: string;
  activityKey?: string;
  activityLabel?: string;
  lastInteractionKey?: string;
  updatedAt: string;
};

export async function getActiveConversation(db: SupabaseClient, userId: string, characterInstanceId: string, createIfMissing = false): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from('together_conversations').select('*').eq('user_id', userId).eq('character_instance_id', characterInstanceId).is('archived_at', null).in('kind', ['direct', 'first_meeting']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (data || !createIfMissing) return data;
  const { data: created, error: createError } = await db.rpc('kivelle_start_conversation', { p_user_id: userId, p_character_instance_id: characterInstanceId });
  if (createError) {
    const retry = await db.from('together_conversations').select('*').eq('user_id', userId).eq('character_instance_id', characterInstanceId).is('archived_at', null).in('kind', ['direct', 'first_meeting']).limit(1).maybeSingle();
    if (retry.error) throw retry.error;
    return retry.data;
  }
  return created;
}

export function shouldDeleteMediaAfterMessageRemoval(media: Record<string, unknown>): boolean {
  return Boolean(media.message_id) && !media.moment_id && !media.date_session_id && !media.life_event_id;
}

export async function resolveActiveConversationScene(input:{db:SupabaseClient;userId:string;conversation:Record<string,any>;characterInstanceId:string;now?:Date}):Promise<{scene:ActiveConversationScene|null;presence:CompanionPresence|null;expired:boolean}> {
  const now=input.now??new Date();
  const metadata=(input.conversation.metadata??{}) as Record<string,any>;
  const stored=(metadata.activeScene??metadata.scene) as Partial<ActiveConversationScene>|undefined;
  const presence=await resolveCompanionPresence({db:input.db,userId:input.userId,characterInstanceId:input.characterInstanceId,now,ensure:false}).catch(()=>null);
  // A live scene session is checked before passive Date/Plan presence because
  // it may have moved within the world since the authored commitment began.
  // Shared Plans still require both participants to have active attendance.
  const { data: activePlans } = await input.db.from('together_shared_plans').select('id,continuity_id,title,location_id,world_id,activity_key,starts_at,ends_at,companion_state').eq('user_id',input.userId).eq('continuity_id',String(input.conversation.continuity_id)).eq('character_instance_id',input.characterInstanceId).in('status',['scheduled','active']).order('starts_at',{ascending:false}).limit(8);
  const activePlan=(activePlans??[]).find((plan:any)=>plan.starts_at&&plan.ends_at&&new Date(plan.starts_at).getTime()-30*60_000<=now.getTime()&&new Date(plan.ends_at).getTime()>now.getTime()) as Record<string,any>|undefined;
  let activePlanJoined=false;
  if(activePlan){
    const [{data:userAttendance},{data:characterAttendance}]=await Promise.all([
      input.db.from('together_plan_attendance').select('id,joined_at,left_at').eq('plan_id',activePlan.id).eq('user_id',input.userId).eq('participant_type','user').is('left_at',null).maybeSingle(),
      input.db.from('together_plan_attendance').select('id,joined_at,left_at').eq('plan_id',activePlan.id).eq('character_instance_id',input.characterInstanceId).eq('participant_type','character').is('left_at',null).maybeSingle(),
    ]);
    activePlanJoined=Boolean(userAttendance&&characterAttendance);
  }
  // A user-entered interaction scene is authoritative for co-presence and may
  // move within a world without rewriting passive schedule presence.
  let sceneSession:Record<string,any>|null=null;
  try {
    const result=await input.db.from('together_scene_sessions').select('*').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle();
    sceneSession=result.data??null;
  } catch { sceneSession=null; }
  if(sceneSession){
    if(sceneSession.shared_plan_id){
      const {data:joined}=await input.db.from('together_plan_attendance').select('id').eq('plan_id',sceneSession.shared_plan_id).eq('user_id',input.userId).eq('participant_type','user').is('left_at',null).maybeSingle();
      if(!joined)return {scene:null,presence,expired:false};
    }
    const validUntil=sceneSession.expected_end_at?new Date(String(sceneSession.expected_end_at)).getTime():new Date(String(sceneSession.started_at)).getTime()+3*60*60*1000;
    if(Number.isFinite(validUntil)&&validUntil>now.getTime()){
      const existing=stored&&stored.interactionMode==='co_present'&&stored.characterInstanceId===input.characterInstanceId?stored:{};
      const state=(sceneSession.state??{}) as Record<string,unknown>;
      const activityKey=String(state.currentActivityKey??sceneSession.activity_key??'together');
      const explicitActivity=typeof state.activityLabel==='string'?state.activityLabel.trim():'';
      const activityLabel=explicitActivity||humanizeActivity(activityKey,'Spending time together');
      return {scene:{version:1,characterInstanceId:input.characterInstanceId,locationId:String(sceneSession.location_id),worldId:String(sceneSession.world_id),interactionMode:'co_present',entryReason:(existing.entryReason??(sceneSession.source==='date'?'active_date':sceneSession.source==='shared_plan'?'shared_plan':'continued_scene')) as Exclude<SceneEntryReason,'direct_chat'>,enteredAt:String(existing.enteredAt??sceneSession.started_at),source:(existing.source??'presence') as ActiveConversationScene['source'],...(sceneSession.expected_end_at?{validUntil:String(sceneSession.expected_end_at)}:{}),...(existing.arrivalAcknowledgedAt?{arrivalAcknowledgedAt:String(existing.arrivalAcknowledgedAt)}:{}),sceneSessionId:String(sceneSession.id),activityKey,activityLabel,updatedAt:now.toISOString()},presence,expired:false};
    }
    await input.db.from('together_scene_sessions').update({ended_at:now.toISOString(),updated_at:now.toISOString()}).eq('id',sceneSession.id).eq('user_id',input.userId).is('ended_at',null);
    waitUntil(finalizeSceneSession({db:input.db,userId:input.userId,sceneSessionId:String(sceneSession.id),now}));
  }
  if(presence&&presence.locationId&&presence.source==='active_date'){
    return {scene:{version:1,characterInstanceId:input.characterInstanceId,locationId:presence.locationId,worldId:presence.worldId??'',interactionMode:'co_present',entryReason:'active_date',enteredAt:presence.activityStartedAt??now.toISOString(),source:'active_event',sourceEventId:presence.sourceEventId,validUntil:presence.validUntil,activityKey:presence.activityKey,activityLabel:presence.activity,updatedAt:now.toISOString()},presence,expired:false};
  }
  if(activePlan&&activePlanJoined&&activePlan.location_id){
    return {scene:{version:1,characterInstanceId:input.characterInstanceId,locationId:String(activePlan.location_id),worldId:String(activePlan.world_id??presence?.worldId??''),interactionMode:'co_present',entryReason:'shared_plan',enteredAt:String(activePlan.starts_at??now.toISOString()),source:'presence',sourceEventId:String(activePlan.id),validUntil:activePlan.ends_at?String(activePlan.ends_at):undefined,activityKey:String(activePlan.activity_key??'together'),activityLabel:humanizeActivity(String(activePlan.activity_key??''),String(activePlan.title??'Spending time together')),updatedAt:now.toISOString()},presence,expired:false};
  }
  const activeScene=stored&&stored.interactionMode==='co_present'&&stored.characterInstanceId===input.characterInstanceId?stored as ActiveConversationScene:null;
  if(activeScene){
    const timeout=new Date(String(activeScene.enteredAt)).getTime()+3*60*60*1000;
    const expiredByTime=Number.isFinite(timeout)&&now.getTime()>timeout;
    const expiredByEnd=Boolean(activeScene.validUntil&&new Date(String(activeScene.validUntil)).getTime()<=now.getTime());
    const samePlace=Boolean(presence&&presence.locationId===activeScene.locationId);
    const preservedByActivity=Boolean(presence&&presence.source==='active_date'&&samePlace);
    const stillJoinable=activeScene.entryReason!=='user_drop_in'||(presence?.interruptibility==='open'||presence?.interruptibility==='limited');
    if(!expiredByTime&&!expiredByEnd&&(samePlace||preservedByActivity)&&stillJoinable&&presence?.interruptibility!=='unavailable'){
      return {scene:{...activeScene,updatedAt:now.toISOString()},presence,expired:false};
    }
    return {scene:null,presence,expired:true};
  }
  return {scene:null,presence,expired:false};
}

function humanizeActivity(value:string,fallback:string){const normalized=value.replace(/[_-]+/g,' ').trim();return normalized&&normalized!=='together'?normalized.replace(/^./,(character)=>character.toUpperCase()):fallback;}

export function mergeConversationSceneMetadata(metadata:Record<string,any>|null|undefined,scene:ActiveConversationScene|null):Record<string,any>{
  const next={...(metadata??{})};
  if(scene) next.activeScene=scene;
  else delete next.activeScene;
  return next;
}

export function acknowledgeConversationScene(metadata:Record<string,any>|null|undefined,at:string):{metadata:Record<string,any>;acknowledged:boolean}{
  const scene=(metadata?.activeScene??null) as ActiveConversationScene|null;
  if(!scene||scene.entryReason!=='user_drop_in'||scene.arrivalAcknowledgedAt)return {metadata:{...(metadata??{})},acknowledged:false};
  return {metadata:{...(metadata??{}),activeScene:{...scene,arrivalAcknowledgedAt:at,updatedAt:at}},acknowledged:true};
}
