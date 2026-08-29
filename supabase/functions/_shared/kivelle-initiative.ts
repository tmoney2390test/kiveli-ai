import type { SupabaseClient } from '@supabase/supabase-js';

type Row=Record<string,unknown>;

export function isPlanReminderProactive(row:Row):boolean{
  const context=row.context&&typeof row.context==='object'&&!Array.isArray(row.context)?row.context as Row:{};
  return context.messageKind==='plan_reminder'||Boolean(context.groupPlanId)||String(row.dedupe_key??'').startsWith('plan:pre:')||String(row.dedupe_key??'').startsWith('group-plan:pre:');
}

export async function cancelQueuedAmbientProactiveMessages(db:SupabaseClient,input:{userId:string;characterInstanceId?:string;keepCharacterInstanceIds?:string[]}):Promise<number>{
  let query=db.from('together_proactive_messages').select('id,character_instance_id,dedupe_key,context').eq('user_id',input.userId).eq('status','queued').limit(200);
  if(input.characterInstanceId)query=query.eq('character_instance_id',input.characterInstanceId);
  const{data,error}=await query;
  if(error||!data?.length)return 0;
  const keep=new Set(input.keepCharacterInstanceIds??[]),ids=data.filter((row)=>!keep.has(String(row.character_instance_id))&&!isPlanReminderProactive(row as Row)).map((row)=>String(row.id));
  if(!ids.length)return 0;
  const result=await db.from('together_proactive_messages').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('user_id',input.userId).eq('status','queued').in('id',ids).select('id');
  return result.data?.length??0;
}
