import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

/** The client reuses this UUID only when retrying the same create payload. */
export async function createPersonaOnce(db:SupabaseClient,userId:string,requestId:string|undefined,fields:Record<string,unknown>){
  const existing=async()=>{
    const result=await db.from('together_user_personas').select('*').eq('id',requestId!).eq('user_id',userId).maybeSingle();
    if(result.error)throw new AppError('INTERNAL_ERROR','Your Persona could not be checked. Please try again.',500,true);
    return result.data;
  };
  if(requestId){const data=await existing();if(data)return{data,created:false};}
  const result=await db.from('together_user_personas').insert({...fields,user_id:userId,...(requestId?{id:requestId}:{})}).select('*').single();
  if(result.error?.code==='23505'&&requestId){const data=await existing();if(data)return{data,created:false};}
  if(result.error||!result.data)throw new AppError('INTERNAL_ERROR','Your Persona could not be created. Please try again.',500,true);
  return{data:result.data,created:true};
}
