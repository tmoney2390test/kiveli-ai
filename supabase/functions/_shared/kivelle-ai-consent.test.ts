
import {assertEquals,assertRejects} from 'jsr:@std/assert@1';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AI_DATA_CONSENT_DISCLOSURE_VERSION,aiDataConsentState,requireAiDataConsent} from './kivelle-ai-consent.ts';
const valid={decision:'accepted',disclosure_version:AI_DATA_CONSENT_DISCLOSURE_VERSION,decided_at:'2026-09-10T00:00:00Z'};
Deno.test('missing declined withdrawn malformed and obsolete consent fail closed',()=>{
  for(const row of [null,{decision:'declined'},{decision:'withdrawn'},{...valid,disclosure_version:'obsolete'},{...valid,decided_at:'invalid'},{decision:'accepted'}])assertEquals(aiDataConsentState(row).allowsProviderCalls,false);
  assertEquals(aiDataConsentState(valid).allowsProviderCalls,true);
});
Deno.test('server guard reads only authenticated user purpose and rechecks withdrawal',async()=>{
  let row:Record<string,unknown>|null=valid;
  const filters:unknown[]=[];
  const query={select:()=>query,eq:(...args:unknown[])=>{filters.push(args);return query;},maybeSingle:()=>Promise.resolve({data:row,error:null})};
  const db={from:(table:string)=>{assertEquals(table,'together_ai_data_consents');return query;}} as unknown as SupabaseClient;
  assertEquals((await requireAiDataConsent(db,'account-a')).allowsProviderCalls,true);
  row={...valid,decision:'withdrawn'};
  await assertRejects(()=>requireAiDataConsent(db,'account-a'),Error,'Allow AI data sharing');
  assertEquals(filters,[['user_id','account-a'],['purpose','core_ai_processing_v1'],['user_id','account-a'],['purpose','core_ai_processing_v1']]);
});
Deno.test('consent database failure is not permission',async()=>{
  const query={select:()=>query,eq:()=>query,maybeSingle:()=>Promise.resolve({error:{code:'offline'},data:null})};
  await assertRejects(()=>requireAiDataConsent({from:()=>query} as unknown as SupabaseClient,'account-a'),Error,'could not be verified');
});
