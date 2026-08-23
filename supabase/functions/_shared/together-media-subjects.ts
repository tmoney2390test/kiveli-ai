import type{SupabaseClient}from'@supabase/supabase-js';
import{AppError}from'./types.ts';

export const MAX_MEDIA_SUBJECTS=2;
export const MEDIA_SUBJECT_SELECT='*,together_character_templates(*),together_character_versions(*)';

export function normalizeMediaSubjectIds(characterInstanceId:string,values?:unknown):string[]{
  const supplied=Array.isArray(values)?values.map(String):[],ids=[...new Set((supplied.length?supplied:[characterInstanceId]).filter(Boolean))];
  if(!ids.length)throw new AppError('VALIDATION_FAILED','Choose at least one companion for the photo.',422);
  if(ids.length>MAX_MEDIA_SUBJECTS)throw new AppError('VALIDATION_FAILED',`Choose up to ${MAX_MEDIA_SUBJECTS} companions for one photo.`,422);
  return ids;
}
/** Revalidates ownership and live group membership at offer creation and again at acceptance. */
export async function loadValidatedMediaSubjects(db:SupabaseClient,input:{userId:string;characterInstanceId:string;subjectCharacterInstanceIds?:unknown;conversationId?:string}):Promise<Array<Record<string,any>>>{
  const ids=normalizeMediaSubjectIds(input.characterInstanceId,input.subjectCharacterInstanceIds);
  const{data:rows,error}=await db.from('together_character_instances').select(MEDIA_SUBJECT_SELECT).eq('user_id',input.userId).in('id',ids);
  if(error)throw new AppError('INTERNAL_ERROR','The selected companions could not be checked.',500,true);
  const byId=new Map((rows??[]).map((row:any)=>[String(row.id),row]));
  if(ids.some((id)=>!byId.has(id)))throw new AppError('NOT_FOUND','One selected companion is unavailable.',404);
  const ordered=ids.map((id)=>byId.get(id)!);
  const continuityId=String(ordered[0]!.continuity_id);
  if(ordered.some((row)=>String(row.continuity_id)!==continuityId))throw new AppError('VALIDATION_FAILED','Selected companions must belong to the same Kivelle Life.',422);
  if(input.conversationId){
    const{data:conversation}=await db.from('together_conversations').select('id,kind,continuity_id,character_instance_id,group_world_id').eq('id',input.conversationId).eq('user_id',input.userId).eq('continuity_id',continuityId).maybeSingle();
    if(!conversation)throw new AppError('NOT_FOUND','That conversation is unavailable.',404);
    if(conversation.kind==='group'){
      const{data:members}=await db.from('together_conversation_participants').select('character_instance_id').eq('conversation_id',input.conversationId).eq('user_id',input.userId).eq('continuity_id',continuityId).in('character_instance_id',ids).is('left_at',null);
      const memberIds=new Set((members??[]).map((row:any)=>String(row.character_instance_id)));
      if(ids.some((id)=>!memberIds.has(id)))throw new AppError('CONFLICT','One selected companion is no longer in this group.',409);
    }else if(ids.length>1||String(conversation.character_instance_id)!==ids[0]){
      throw new AppError('VALIDATION_FAILED','Multiple companions require a group conversation.',422);
    }
  }else if(ids.length>1){
    throw new AppError('VALIDATION_FAILED','Multiple companions require a group conversation.',422);
  }
  return ordered;
}
