import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dailyPhotoAllowanceStatus } from './kivelle-subscription.ts';

Deno.test('daily photo status uses the authoritative local-day RPC result',async()=>{
  let parameters:Record<string,unknown>|undefined;
  const db={rpc:async(name:string,input:Record<string,unknown>)=>{
    assertEquals(name,'kivelle_daily_photo_allowance_status');
    parameters=input;
    return{data:{limit:3,used:2,remaining:1,benefitDate:'2026-09-05',timezone:'America/New_York',resetsAt:'2026-09-06T04:00:00+00:00'},error:null};
  }} as unknown as SupabaseClient;
  const status=await dailyPhotoAllowanceStatus(db,{userId:'user-1',limit:3,now:new Date('2026-09-06T01:00:00Z')});
  assertEquals(parameters,{p_user_id:'user-1',p_daily_limit:3,p_now:'2026-09-06T01:00:00.000Z'});
  assertEquals(status,{limit:3,used:2,remaining:1,benefitDate:'2026-09-05',timezone:'America/New_York',resetsAt:'2026-09-06T04:00:00+00:00'});
});

Deno.test('daily photo status clamps malformed provider counts',async()=>{
  const db={rpc:async()=>({data:{used:-4,remaining:99,benefitDate:'2026-09-05',timezone:'UTC',resetsAt:'2026-09-06T00:00:00Z'},error:null})} as unknown as SupabaseClient;
  const status=await dailyPhotoAllowanceStatus(db,{userId:'user-1',limit:1,now:new Date('2026-09-05T10:00:00Z')});
  assertEquals(status.used,0);
  assertEquals(status.remaining,1);
});
