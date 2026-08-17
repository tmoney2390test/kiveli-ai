import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanionPresence, type CompanionPresence } from './together-schedule.ts';

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
  // Plans and dates remain the highest-priority canonical shared context.
  if(presence&&presence.locationId&&['active_date','active_plan'].includes(presence.source)){
    return {scene:{version:1,characterInstanceId:input.characterInstanceId,locationId:presence.locationId,worldId:presence.worldId??'',interactionMode:'co_present',entryReason:presence.source==='active_date'?'active_date':'shared_plan',enteredAt:presence.activityStartedAt??now.toISOString(),source:presence.source==='active_date'?'active_event':'presence',sourceEventId:presence.sourceEventId,validUntil:presence.validUntil,updatedAt:now.toISOString()},presence,expired:false};
  }
  // A user-entered interaction scene is authoritative for co-presence and may
  // move within a world without rewriting passive schedule presence.
  let sceneSession:Record<string,any>|null=null;
  try {
    const result=await input.db.from('together_scene_sessions').select('*').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).is('ended_at',null).order('started_at',{ascending:false}).limit(1).maybeSingle();
    sceneSession=result.data??null;
  } catch { sceneSession=null; }
  if(sceneSession){
    const validUntil=sceneSession.expected_end_at?new Date(String(sceneSession.expected_end_at)).getTime():new Date(String(sceneSession.started_at)).getTime()+3*60*60*1000;
    if(Number.isFinite(validUntil)&&validUntil>now.getTime()){
      const existing=stored&&stored.interactionMode==='co_present'&&stored.characterInstanceId===input.characterInstanceId?stored:{};
      return {scene:{version:1,characterInstanceId:input.characterInstanceId,locationId:String(sceneSession.location_id),worldId:String(sceneSession.world_id),interactionMode:'co_present',entryReason:(existing.entryReason??(sceneSession.source==='date'?'active_date':sceneSession.source==='shared_plan'?'shared_plan':'continued_scene')) as Exclude<SceneEntryReason,'direct_chat'>,enteredAt:String(existing.enteredAt??sceneSession.started_at),source:(existing.source??'presence') as ActiveConversationScene['source'],...(sceneSession.expected_end_at?{validUntil:String(sceneSession.expected_end_at)}:{}),...(existing.arrivalAcknowledgedAt?{arrivalAcknowledgedAt:String(existing.arrivalAcknowledgedAt)}:{}),sceneSessionId:String(sceneSession.id),activityKey:sceneSession.activity_key?String(sceneSession.activity_key):undefined,updatedAt:now.toISOString()},presence,expired:false};
    }
  }
  const activeScene=stored&&stored.interactionMode==='co_present'&&stored.characterInstanceId===input.characterInstanceId?stored as ActiveConversationScene:null;
  if(activeScene){
    const timeout=new Date(String(activeScene.enteredAt)).getTime()+3*60*60*1000;
    const expiredByTime=Number.isFinite(timeout)&&now.getTime()>timeout;
    const expiredByEnd=Boolean(activeScene.validUntil&&new Date(String(activeScene.validUntil)).getTime()<=now.getTime());
    const samePlace=Boolean(presence&&presence.locationId===activeScene.locationId);
    const preservedByActivity=Boolean(presence&&(['active_date','active_plan'].includes(presence.source))&&samePlace);
    const stillJoinable=activeScene.entryReason!=='user_drop_in'||(presence?.interruptibility==='open'||presence?.interruptibility==='limited');
    if(!expiredByTime&&!expiredByEnd&&(samePlace||preservedByActivity)&&stillJoinable&&presence?.interruptibility!=='unavailable'){
      return {scene:{...activeScene,updatedAt:now.toISOString()},presence,expired:false};
    }
    return {scene:null,presence,expired:true};
  }
  return {scene:null,presence,expired:false};
}

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

