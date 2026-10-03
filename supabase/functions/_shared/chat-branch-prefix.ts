import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';

type PrefixRow=Record<string,unknown>;

/** Immutable, owner-scoped messages copied at a subscriber branch boundary.
 * These are deliberately not together_messages rows: reading history must not
 * replay billing, relationship, or proactive-message triggers. */
export async function loadChatBranchPrefix(db:SupabaseClient,input:{userId:string;conversationId:string;beforeSequence?:number;before?:string;limit:number}):Promise<PrefixRow[]>{
  let query=db.from('together_chat_branch_prefix').select('id,conversation_id,character_instance_id,conversation_sequence,role,content,safe_bridge,content_rating,visibility_scope,moderation_status,moderation_version,provider_metadata,created_at')
    .eq('user_id',input.userId).eq('conversation_id',input.conversationId);
  if(input.beforeSequence!==undefined)query=query.lt('conversation_sequence',input.beforeSequence);
  else if(input.before)query=query.lt('created_at',input.before);
  const{data,error}=await query.order('conversation_sequence',{ascending:false}).limit(Math.min(151,Math.max(1,input.limit)));
  if(error)throw new AppError('INTERNAL_ERROR','The alternate-path history could not be loaded.',500,true);
  return(data??[]).map((row)=>({
    ...row,delivery_status:'complete',updated_at:row.created_at,
    together_conversation_attachments:[],together_message_reactions:[],
  }));
}
