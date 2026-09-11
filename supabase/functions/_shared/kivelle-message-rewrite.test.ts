import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { messageRewriteSchema, messageRewriteRoute, loadMessageRewrite, type PreparedMessageRewrite } from './kivelle-message-rewrite.ts';
import type { AdultAccessContext } from './web-adult-access.ts';
import { ConfiguredDialogueProvider, type DialogueContext } from './together-ai.ts';
import { compileCompanionPrompt } from './kivelle-intelligence.ts';
import { contextDraftFingerprint } from './kivelle-context-authorization.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const user='00000000-0000-4000-8000-000000000001';
const prepared={source:{content:'When does the library open?'},conversation:{user_id:user,metadata:{}}} as unknown as PreparedMessageRewrite;
const context={character:{name:'Aster',age:30},userMessage:prepared.source.content,recent:[],relationship:{},memories:[],conversationStyle:'texting'} as unknown as DialogueContext;
const db={} as SupabaseClient;
async function configured(run:()=>Promise<void>){
  const names=['XAI_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_XAI_ENABLED','KIVELLE_XAI_EXPLICIT_ENABLED','KIVELLE_PRIVATE_ADULT_TEXT_MODE'];
  const values=names.map(name=>Deno.env.get(name)),fetch=globalThis.fetch;
  names.forEach(name=>Deno.env.set(name,name.endsWith('_KEY')?'mock-only':name.endsWith('_MODE')?'on':'true'));
  try{await run();}finally{globalThis.fetch=fetch;names.forEach((name,i)=>values[i]===undefined?Deno.env.delete(name):Deno.env.set(name,values[i]!));}
}
Deno.test('rewrite schema requires a target/version/idempotency key and strips provider claims',()=>{
  const valid={messageAction:'spice',conversationId:user,anchorMessageId:user,expectedRevision:0,clientRequestId:user};
  assertEquals(messageRewriteSchema.safeParse({...valid,anchorMessageId:undefined}).success,false);
  assertEquals(messageRewriteSchema.safeParse({...valid,expectedRevision:-1}).success,false);
  assertEquals(messageRewriteSchema.safeParse({...valid,messageAction:'arbitrary-provider'}).success,false);
  assertEquals('provider'in messageRewriteSchema.parse({...valid,provider:'untrusted',providerCost:0}),false);
});
Deno.test('manual selection keeps actual classification, uses adult router and does not seed continuity',()=>configured(async()=>{
  const route=await messageRewriteRoute(db,user,prepared,context);
  assertEquals(route.provider,'xai');assertEquals(route.reason,'manual_spice');assertEquals(route.classification,'standard');assertEquals(route.carryoverTurnsRemaining,0);
}));
Deno.test('manual selection honors unavailable provider and relationship boundaries',()=>configured(async()=>{
  Deno.env.delete('XAI_API_KEY');await assertRejects(()=>messageRewriteRoute(db,user,prepared,context));
  Deno.env.set('XAI_API_KEY','mock-only');await assertRejects(()=>messageRewriteRoute(db,user,prepared,{...context,relationship:{romance_enabled:false}}));
}));
Deno.test('failed strict-route rewrite never calls an alternative provider',()=>configured(async()=>{
  const route=await messageRewriteRoute(db,user,prepared,context),calls:string[]=[];
  globalThis.fetch=(url)=>{calls.push(String(url));return Promise.resolve(new Response('busy',{status:503}));};
  await assertRejects(()=>new ConfiguredDialogueProvider().generate(context,{route,strictRoute:true,providerAttemptBudget:{max:2,used:0}}));
  assertEquals(calls.length>0,true);assertEquals(calls.every(url=>new URL(url).hostname==='api.x.ai'),true);
}));
Deno.test('revision guidance survives both SMS and paragraph compaction without changing original request',()=>{
  for(const conversationStyle of ['texting','paragraph']){
    const result=compileCompanionPrompt({...context,conversationStyle,rewriteOriginalReply:'The library opens at noon.',contextInputCeiling:8000});
    assertEquals(result.prompt.includes('<MESSAGE_REVISION>'),true);
    assertEquals(result.prompt.includes('not a new turn'),true);
    assertEquals(result.prompt.includes(prepared.source.content),true);
    assertEquals(result.prompt.includes('The library opens at noon.'),true);
  }
});
Deno.test('a changed revision invalidates the quote even though the message ID is unchanged',async()=>{
  const input={conversationId:user,anchorMessageId:user,messageAction:'spice',expectedRevision:0};
  assertEquals(await contextDraftFingerprint(input)===await contextDraftFingerprint({...input,expectedRevision:1}),false);
});

function ownedFixture(){
  const conversation={id:user,user_id:user,continuity_id:user,kind:'direct',character_instance_id:user,metadata:{}};
  const source={id:'00000000-0000-4000-8000-000000000002',conversation_id:user,user_id:user,role:'user',content:'When does the library open?',conversation_sequence:1,delivery_status:'complete'};
  const target={id:'00000000-0000-4000-8000-000000000003',conversation_id:user,user_id:user,character_instance_id:user,response_to_message_id:source.id,role:'assistant',content:'At noon.',conversation_sequence:2,delivery_status:'complete',provider_metadata:{}};
  const profile={user_id:user,active_continuity_id:user,content_preferences:{contentMode:'explicit'},age_verified_at:'2026-09-01T00:00:00Z'};
  const instance={id:user,user_id:user,life_state:'alive',together_character_templates:{age:30,description:'An adult librarian.'},together_character_versions:{}};
  const tables:Record<string,any[]>={together_conversations:[conversation],together_messages:[source,target],together_profiles:[profile],together_character_instances:[instance]};
  const fake={from(table:string){
    let rows=[...(tables[table]??[])],columns='*';
    const result=()=>({data:rows.map(row=>columns.includes('*')?row:Object.fromEntries(columns.split(',').map(key=>[key,row[key]]))),error:null});
    const query={select(value:string){columns=value;return query;},eq(key:string,value:unknown){rows=rows.filter(row=>row[key]===value);return query;},lt(key:string,value:number){rows=rows.filter(row=>row[key]<value);return query;},is(){return query;},order(key:string,options?:{ascending?:boolean}){rows.sort((a,b)=>(Number(a[key])-Number(b[key]))*(options?.ascending===false?-1:1));return query;},limit(n:number){rows=rows.slice(0,n);return query;},single:async()=>({...result(),data:result().data[0]??null}),maybeSingle:async()=>({...result(),data:result().data[0]??null}),then(resolve:any,reject:any){return Promise.resolve(result()).then(resolve,reject);}};
    return query;
  }} as unknown as SupabaseClient;
  const access:AdultAccessContext={premium_access:false,adult_eligible:true,adult_mode_enabled:false,client_surface:'native_or_unknown',adult_generation_enabled:false,authorized_web_adult:false,adult_eligibility:{allowed:true,reason:'verified_adult'},private_adult_text_mode:'on',private_text_preference:'explicit',private_text_preference_recorded:true,web_session_id:null};
  const input={conversationId:user,anchorMessageId:target.id,expectedRevision:0};
  return {fake,access,input,profile,instance,target,tables};
}
Deno.test('owned native text rewrite resolves the original turn without authorizing visuals',async()=>{
  const f=ownedFixture(),prepared=await loadMessageRewrite(f.fake,user,f.access,f.input);
  assertEquals(prepared.source.role,'user');assertEquals(prepared.speakerId,user);
  assertEquals(prepared.policy.rollout.generationAllowed,true);assertEquals(f.access.authorized_web_adult,false);
});
Deno.test('rewrite preparation rejects foreign ownership, age uncertainty, stale targets and later turns',async()=>{
  const f=ownedFixture();
  await assertRejects(()=>loadMessageRewrite(f.fake,'stranger',f.access,f.input));
  await assertRejects(()=>loadMessageRewrite(f.fake,user,f.access,{...f.input,expectedRevision:1}));
  await assertRejects(()=>loadMessageRewrite(f.fake,user,{...f.access,private_text_preference_recorded:false},f.input));
  f.instance.together_character_templates.age=0;await assertRejects(()=>loadMessageRewrite(f.fake,user,f.access,f.input));
  f.instance.together_character_templates.age=30;f.instance.life_state='dead';await assertRejects(()=>loadMessageRewrite(f.fake,user,f.access,f.input));
  f.instance.life_state='alive';f.tables.together_messages!.push({...f.target,id:'later',role:'user',conversation_sequence:3});await assertRejects(()=>loadMessageRewrite(f.fake,user,f.access,f.input));
});
