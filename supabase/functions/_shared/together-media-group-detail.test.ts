import { assert, assertEquals } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VeniceImageClient } from './venice.ts';
import { adultGroupDetailRetryRate, shouldRetryAdultGroupDetail, tryAdultGroupDetailRefinement } from './together-media-group-detail.ts';
import { VENICE_GROUP_ADULT_ROUTE_ID } from './together-media-providers.ts';

const eligible={routeId:VENICE_GROUP_ADULT_ROUTE_ID,pipeline:'clothed_group_identity_base_then_adult_edit',baseSourceUrl:'https://images.test/base.webp',model:'qwen-edit-uncensored',estimatedCost:.11,originalBytes:new Uint8Array([1]),reasonCodes:['face_low_detail'],alreadyAttempted:false,enabled:true,configuredRate:.25};

Deno.test('detail retry is limited by edit price and request sample',()=>{
  assertEquals(adultGroupDetailRetryRate('qwen-edit-uncensored'),.25);
  assert(Math.abs(adultGroupDetailRetryRate('qwen-image-2-edit')-.2)<1e-9);
  assertEquals(adultGroupDetailRetryRate('qwen-image-2-pro-edit'),0);
  const eligibleCount=Array.from({length:10_000},(_,index)=>shouldRetryAdultGroupDetail({...eligible,mediaId:`group-${index}`})).filter(Boolean).length;
  assert(eligibleCount>2_000&&eligibleCount<2_700);
});

Deno.test('detail retry excludes unsafe, inapplicable, expensive and repeated candidates',()=>{
  const mediaId=Array.from({length:100},(_,index)=>`group-${index}`).find((id)=>shouldRetryAdultGroupDetail({...eligible,mediaId:id}));
  assert(mediaId);
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,reasonCodes:['face_low_detail','adult_safety_violation']}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,reasonCodes:['requested_anatomy_missing']}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,alreadyAttempted:true}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,routeId:'venice-adult-two-stage'}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,pipeline:'adult_group_source_edit'}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,estimatedCost:.15}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,baseSourceUrl:'http://unsafe.test/base.webp'}));
  assert(!shouldRetryAdultGroupDetail({...eligible,mediaId,enabled:false}));
});

Deno.test('a rejected detail edit preserves the original candidate and records its cost once',async()=>{
  const mediaId=Array.from({length:100},(_,index)=>`group-${index}`).find((id)=>shouldRetryAdultGroupDetail({...eligible,mediaId:id}));
  assert(mediaId);
  const updates:Record<string,unknown>[]=[],usage:Record<string,unknown>[]=[],db=fakeDb(updates,usage);
  const original={bytes:new Uint8Array([9]),contentType:'image/webp',providerRequestId:'first',model:'qwen-edit-uncensored',estimatedCost:.11,providerMetadata:{pipeline:'clothed_group_identity_base_then_adult_edit',groupBaseSourceUrl:'https://images.test/base.webp'}};
  const metadata:Record<string,unknown>={};let edits=0;
  const client={edit:async()=>{edits+=1;return{bytes:new Uint8Array([8]),contentType:'image/webp',model:'qwen-edit-uncensored',providerRequestId:'second',estimatedCost:.04,generationMs:100,safety:{blurred:false,contentViolation:false,adultModelContentViolation:false}};}} as unknown as VeniceImageClient;
  const shared={db,job:{id:'job',route_id:VENICE_GROUP_ADULT_ROUTE_ID,provider_request_id:'first',attempt_count:2,finalization_lease_token:'lease'},media:{id:mediaId,user_id:'user',content_level:'explicit',metadata:{}},original,request:adultRequest(mediaId),firstVerdict:{status:'fail' as const,reasonCodes:['face_low_detail']},providerMetadata:metadata,client,subscriptionTier:'kivelle_max',emit:async()=>{}};
  const rejected=await tryAdultGroupDetailRefinement({...shared,assess:async()=>({status:'fail',reasonCodes:['face_blur']})});
  assertEquals(rejected,null);
  assertEquals(original.bytes[0],9);
  assert(Math.abs(Number(original.estimatedCost)-.15)<1e-9);
  assertEquals(metadata.groupDetailRetryAttempted,true);
  assertEquals(metadata.groupDetailRetrySelected,false);
  assertEquals(edits,1);
  assertEquals(usage.length,1);
  assertEquals(usage[0]?.quality_retry,true);
  await tryAdultGroupDetailRefinement({...shared,assess:async()=>({status:'pass',reasonCodes:[]})});
  assertEquals(edits,1);
  assert(updates.length>=2);
});

Deno.test('a passing detail edit replaces the first result without regenerating its base',async()=>{
  const mediaId=Array.from({length:100},(_,index)=>`group-${index}`).find((id)=>shouldRetryAdultGroupDetail({...eligible,mediaId:id}));
  assert(mediaId);
  const updates:Record<string,unknown>[]=[],usage:Record<string,unknown>[]=[],db=fakeDb(updates,usage);
  const first={bytes:new Uint8Array([9]),contentType:'image/webp',providerRequestId:'first',model:'qwen-edit-uncensored',estimatedCost:.11,providerMetadata:{pipeline:'clothed_group_identity_base_then_adult_edit',groupBaseSourceUrl:'https://images.test/base.webp'}};
  let edits=0;
  const client={edit:async()=>{edits+=1;return{bytes:new Uint8Array([8]),contentType:'image/webp',model:'qwen-edit-uncensored',providerRequestId:'second',estimatedCost:.04,generationMs:100,safety:{blurred:false,contentViolation:false,adultModelContentViolation:false}};}} as unknown as VeniceImageClient;
  const chosen=await tryAdultGroupDetailRefinement({db,job:{id:'job',route_id:VENICE_GROUP_ADULT_ROUTE_ID,provider_request_id:'first',attempt_count:2,finalization_lease_token:'lease'},media:{id:mediaId,user_id:'user',content_level:'explicit',metadata:{}},original:first,request:adultRequest(mediaId),firstVerdict:{status:'fail',reasonCodes:['face_low_detail']},providerMetadata:{},client,subscriptionTier:'kivelle_max',emit:async()=>{},assess:async()=>({status:'pass',reasonCodes:[]})});
  assertEquals(edits,1);
  assertEquals(chosen?.providerRequestId,'second');
  assertEquals(chosen?.bytes?.[0],8);
  assert(Math.abs(Number(chosen?.estimatedCost)-.15)<1e-9);
  assertEquals(chosen?.providerMetadata?.groupBaseSourceUrl,undefined);
});

function adultRequest(mediaId:string){return{mediaId,mediaType:'image' as const,adultPipelineAuthorized:true,contentLevel:'explicit' as const,subjects:[{companion:{name:'Mara',age:29}},{companion:{name:'Priya',age:31}}],generationIntent:{requestText:'Mara and Priya, send me a photo showing exactly this: Nude kissing'},composition:{aspectRatio:'4:5'},context:{}} as Parameters<typeof tryAdultGroupDetailRefinement>[0]['request'];}

function fakeDb(updates:Record<string,unknown>[],usage:Record<string,unknown>[]):SupabaseClient{
  const chain={eq:()=>chain,select:()=>chain,maybeSingle:async()=>({data:{id:'job'},error:null})};
  return{from:(table:string)=>table==='together_media_provider_jobs'?{update:(value:Record<string,unknown>)=>{updates.push(value);return chain;}}:{upsert:async(value:Record<string,unknown>)=>{usage.push(value);return{error:null};},update:()=>chain}} as unknown as SupabaseClient;
}
