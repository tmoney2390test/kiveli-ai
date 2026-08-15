import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

export type UserPersonaRow={id:string;user_id:string;name:string;display_name:string;pronouns:string|null;age:number|null;occupation:string|null;biography:string|null;interests:string[];appearance_config:Record<string,unknown>;communication_config:Record<string,unknown>;metadata:Record<string,unknown>;is_default:boolean};
export type ContinuityRow={id:string;user_id:string;persona_id:string;kind:'main'|'alternate';title:string;active_companion_instance_id:string|null;metadata:Record<string,unknown>;together_user_personas?:UserPersonaRow};

export async function ensureMainContinuity(db:SupabaseClient,userId:string):Promise<ContinuityRow>{
  const{data:profile,error:profileError}=await db.from('together_profiles').select('display_name,about_me,interests,active_continuity_id,active_companion_instance_id').eq('user_id',userId).maybeSingle();
  if(profileError||!profile)throw new AppError('CONFLICT','Finish creating your Kivelle account first.',409);
  if(profile.active_continuity_id){const existing=await continuityById(db,userId,String(profile.active_continuity_id));if(existing)return existing;}
  let{data:persona}=await db.from('together_user_personas').select('*').eq('user_id',userId).eq('is_default',true).maybeSingle();
  if(!persona){const created=await db.from('together_user_personas').insert({user_id:userId,name:String(profile.display_name??'Main'),display_name:String(profile.display_name??'You'),biography:profile.about_me??null,interests:profile.interests??[],is_default:true,metadata:{source:'account_bootstrap',contextVersion:1}}).select('*').single();if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Your Main Persona could not be prepared.',500,true);persona=created.data;}
  let{data:continuity}=await db.from('together_continuities').select('*,together_user_personas(*)').eq('user_id',userId).eq('kind','main').maybeSingle();
  if(!continuity){const created=await db.from('together_continuities').insert({user_id:userId,persona_id:persona.id,kind:'main',title:'Main Life',active_companion_instance_id:profile.active_companion_instance_id??null,metadata:{source:'account_bootstrap',contextVersion:1}}).select('*,together_user_personas(*)').single();if(created.error||!created.data)throw new AppError('INTERNAL_ERROR','Your Main Life could not be prepared.',500,true);continuity=created.data;}
  await db.from('together_profiles').update({active_continuity_id:continuity.id,updated_at:new Date().toISOString()}).eq('user_id',userId);
  return normalizeContinuity(continuity);
}

export async function activeContinuity(db:SupabaseClient,userId:string):Promise<ContinuityRow>{
  const{data:profile}=await db.from('together_profiles').select('active_continuity_id').eq('user_id',userId).maybeSingle();
  if(profile?.active_continuity_id){const found=await continuityById(db,userId,String(profile.active_continuity_id));if(found)return found;}
  return ensureMainContinuity(db,userId);
}

export async function continuityById(db:SupabaseClient,userId:string,continuityId:string):Promise<ContinuityRow|null>{
  const{data}=await db.from('together_continuities').select('*,together_user_personas(*)').eq('id',continuityId).eq('user_id',userId).maybeSingle();
  return data?normalizeContinuity(data):null;
}

export async function requireInstanceInActiveContinuity(db:SupabaseClient,userId:string,instanceId:string):Promise<{continuity:ContinuityRow;instance:Record<string,unknown>}>{
  const continuity=await activeContinuity(db,userId);
  const{data:instance}=await db.from('together_character_instances').select('*').eq('id',instanceId).eq('user_id',userId).eq('continuity_id',continuity.id).maybeSingle();
  if(!instance)throw new AppError('NOT_FOUND','That companion is not part of this Kivelle Life.',404);
  return{continuity,instance};
}

export function personaPromptBlock(persona:UserPersonaRow):string{
  return `<USER_PERSONA>\nName: ${persona.display_name}\nPronouns: ${persona.pronouns??'Not specified'}\nAge: ${persona.age??'Not specified'}\nOccupation: ${persona.occupation??'Not specified'}\nInterests: ${(persona.interests??[]).join(', ')||'Not specified'}\nSelf-description: ${persona.biography??'Not specified'}\nCommunication preferences: ${JSON.stringify(persona.communication_config??{})}\n</USER_PERSONA>`;
}

function normalizeContinuity(row:Record<string,any>):ContinuityRow{const persona=Array.isArray(row.together_user_personas)?row.together_user_personas[0]:row.together_user_personas;return{...row,together_user_personas:persona} as ContinuityRow;}
