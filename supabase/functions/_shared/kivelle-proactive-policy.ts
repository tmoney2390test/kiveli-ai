import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuietHours } from '../../../packages/together-domain/src/proactive-preferences.ts';

export type ProactivePolicy = { allowed: boolean; reason: string | null; quietHours?: QuietHours; frequency?: string };
export async function proactiveDeliveryPolicy(db: SupabaseClient,userId: string,proactiveId: string,now: Date,checkCadence=true): Promise<ProactivePolicy> {
  const {data,error}=await db.rpc('kivelle_proactive_delivery_policy',{p_user_id:userId,p_proactive_id:proactiveId,p_now:now.toISOString(),p_check_cadence:checkCadence});
  if(error||!data||typeof data.allowed!=='boolean')throw new Error('INITIATIVE_POLICY_UNAVAILABLE');
  return data as ProactivePolicy;
}
