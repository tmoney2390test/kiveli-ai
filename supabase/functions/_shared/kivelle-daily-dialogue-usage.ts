import type { SupabaseClient } from '@supabase/supabase-js';

/** Revisions consume the same daily allowance without adding fake user turns. */
export async function dailyDialogueUsage(db:SupabaseClient,userId:string,since:string) {
  const [messages,rewrites]=await Promise.all([
    db.from('together_messages').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('role','user').gte('created_at',since),
    db.rpc('kivelle_daily_rewrite_usage',{p_user_id:userId,p_since:since}),
  ]);
  return {data:null,count:Number(messages.count??0)+Number(rewrites.data??0),error:messages.error??rewrites.error};
}
