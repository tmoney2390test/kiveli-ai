import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCharacterPresence } from './together-schedule.ts';
import { AppError } from './types.ts';

export async function setCompanionSchedulePause(db: SupabaseClient, input: {
  userId:string; continuityId:string; conversationId:string; characterInstanceId:string;
  paused:boolean; confirmation:'pause_schedule'|'resume_schedule'; expectedPausedAt:string|null;
}) {
  if(input.confirmation!==(input.paused?'pause_schedule':'resume_schedule'))throw new AppError('VALIDATION_ERROR','Confirm this schedule change first.',400);
  const presence=input.paused?await resolveCharacterPresence({db,userId:input.userId,characterInstanceId:input.characterInstanceId,routineOnly:true}):null;
  if(input.paused&&!presence)throw new AppError('INTERNAL_ERROR','The current routine could not be loaded. Nothing was changed.',503,true);
  const {data,error}=await db.rpc('kivelle_set_schedule_pause',{
    p_user_id:input.userId,p_continuity_id:input.continuityId,p_conversation_id:input.conversationId,
    p_paused:input.paused,p_confirmation:input.confirmation,p_expected_paused_at:input.expectedPausedAt,
    p_snapshot:presence?{locationId:presence.locationId,activity:presence.activity,activityKey:presence.activityKey,interruptibility:presence.interruptibility,state:presence.state}:null,
  });
  if(error){
    if(error.message.includes('SCHEDULE_STATE_CHANGED'))throw new AppError('CONFLICT','The schedule setting changed on another device. Reopen chat settings and try again.',409);
    if(error.message.includes('NOT_FOUND')||error.message.includes('NOT_AUTHORIZED'))throw new AppError('NOT_FOUND','That companion is unavailable.',404);
    throw new AppError('INTERNAL_ERROR','The schedule setting could not be saved.',500,true);
  }
  return data;
}
