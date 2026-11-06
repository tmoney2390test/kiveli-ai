import { assert, assertEquals } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VeniceImageClient } from './venice.ts';
import { tryAdultSingleAnatomyRefinement } from './together-media-group-detail.ts';

Deno.test('severe solo-body repair replaces only a reviewed improvement and records the extra provider cost',async()=>{
  const usage:Record<string,unknown>[]=[],db=fakeDb(usage),original={bytes:new Uint8Array([9]),contentType:'image/webp',providerRequestId:'first',model:'grok-imagine-edit',estimatedCost:.08,generationMs:100};
  const edits:Array<Record<string,unknown>>=[],client={edit:async(input:Record<string,unknown>)=>{edits.push(input);return{bytes:new Uint8Array([8]),contentType:'image/webp',providerRequestId:'repair',model:'grok-imagine-edit',estimatedCost:.04,generationMs:75,safety:{blurred:false,contentViolation:false,adultModelContentViolation:false}};}} as unknown as VeniceImageClient;
  const providerMetadata:Record<string,unknown>={},shared={db,job:{id:'job',provider:'venice',route_id:'venice-adult-two-stage',provider_request_id:'first',attempt_count:1,finalization_lease_token:'lease'},media:{id:'media',user_id:'user'},original,request:{adultPipelineAuthorized:true,subjects:[{companion:{name:'Willa'}}],composition:{aspectRatio:'4:5'}} as Parameters<typeof tryAdultSingleAnatomyRefinement>[0]['request'],firstVerdict:{status:'fail' as const,reasonCodes:['duplicate_body_parts','time_mismatch']},providerMetadata,client,subscriptionTier:'kivelle_max',emit:async()=>{}};
  const repaired=await tryAdultSingleAnatomyRefinement({...shared,assess:async()=>({status:'fail',reasonCodes:['time_mismatch']})});
  assertEquals(repaired?.bytes?.[0],8);
  assertEquals(repaired?.providerMetadata?.anatomyRefinementSelected,true);
  assertEquals(edits.length,1);
  assert(String(edits[0]?.prompt).includes('extra upper torso'));
  assert(String(edits[0]?.prompt).includes('visible phone'));
  assertEquals(usage.length,1);
  assertEquals(usage[0]?.quality_retry,true);
  assertEquals(providerMetadata.anatomyRefinementSelected,true);
  const repeat=await tryAdultSingleAnatomyRefinement({...shared,assess:async()=>({status:'pass',reasonCodes:[]})});
  assertEquals(repeat,null);
  assertEquals(edits.length,1);
});

Deno.test('a visible phone in a solo adult photo receives one bounded repair attempt',async()=>{
  const usage:Record<string,unknown>[]=[],db=fakeDb(usage),original={bytes:new Uint8Array([9]),contentType:'image/webp',providerRequestId:'first',model:'grok-imagine-edit',estimatedCost:.08,generationMs:100};
  const edits:Array<Record<string,unknown>>=[],client={edit:async(input:Record<string,unknown>)=>{edits.push(input);return{bytes:new Uint8Array([8]),contentType:'image/webp',providerRequestId:'repair',model:'grok-imagine-edit',estimatedCost:.04,generationMs:75,safety:{blurred:false,contentViolation:false,adultModelContentViolation:false}};}} as unknown as VeniceImageClient;
  const result=await tryAdultSingleAnatomyRefinement({db,job:{id:'job',provider:'venice',route_id:'venice-adult-two-stage',provider_request_id:'first',attempt_count:1,finalization_lease_token:'lease'},media:{id:'media',user_id:'user'},original,request:{adultPipelineAuthorized:true,subjects:[{companion:{name:'Evelyn'}}],composition:{aspectRatio:'4:5'}} as Parameters<typeof tryAdultSingleAnatomyRefinement>[0]['request'],firstVerdict:{status:'fail',reasonCodes:['visible_capture_device','world_mismatch']},providerMetadata:{},client,subscriptionTier:'kivelle_max',emit:async()=>{},assess:async()=>({status:'fail',reasonCodes:['world_mismatch']})});
  assertEquals(result?.bytes?.[0],8);
  assertEquals(edits.length,1);
  assertEquals(usage.length,1);
});

Deno.test('a failed solo-body repair leaves the first photo available',async()=>{
  const usage:Record<string,unknown>[]=[],db=fakeDb(usage),original={bytes:new Uint8Array([9]),contentType:'image/webp',providerRequestId:'first',model:'grok-imagine-edit',estimatedCost:.08};
  const client={edit:async()=>({bytes:new Uint8Array([8]),contentType:'image/webp',providerRequestId:'repair',model:'grok-imagine-edit',estimatedCost:.04,generationMs:75,safety:{blurred:false,contentViolation:false,adultModelContentViolation:false}})} as unknown as VeniceImageClient;
  const outcome=await tryAdultSingleAnatomyRefinement({db,job:{id:'job',provider:'venice',route_id:'venice-adult-two-stage',provider_request_id:'first',attempt_count:1,finalization_lease_token:'lease'},media:{id:'media',user_id:'user'},original,request:{adultPipelineAuthorized:true,subjects:[{companion:{name:'Willa'}}],composition:{aspectRatio:'4:5'}} as Parameters<typeof tryAdultSingleAnatomyRefinement>[0]['request'],firstVerdict:{status:'fail',reasonCodes:['torso_distortion']},providerMetadata:{},client,subscriptionTier:'kivelle_max',emit:async()=>{},assess:async()=>({status:'fail',reasonCodes:['torso_distortion']})});
  assertEquals(outcome,null);
  assertEquals(original.bytes[0],9);
  assertEquals(usage.length,1);
});

function fakeDb(usage:Record<string,unknown>[]):SupabaseClient{
  const chain={eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:{id:'job'},error:null})};
  return{from:(table:string)=>table==='together_media_provider_jobs'?{update:()=>chain}:{upsert:async(value:Record<string,unknown>)=>{usage.push(value);return{error:null};},update:()=>chain}} as unknown as SupabaseClient;
}
