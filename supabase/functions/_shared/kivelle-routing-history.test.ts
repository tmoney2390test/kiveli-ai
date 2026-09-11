import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { loadAdultRoutingHistory } from './kivelle-routing-history.ts';
import { resolveDialogueRouting } from './kivelle-ai-routing.ts';
import { applyChatTestRoute } from './kivelle-chat-model-test.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const base={message:'I nod.',requestedMode:'explicit' as const,ageVerified:true,adultAuthorized:true,characterAge:30,relationshipAllowsExplicit:true};
const classified={allowed:true,flagged:true,categories:['sexual/adult'],categoryScores:{'sexual/adult':0.95}};
const fresh={version:1,eligible:true,freshAdult:true,reset:false};

async function configured(run:()=>void|Promise<void>){
  const env={OPENAI_API_KEY:'test-only',XAI_API_KEY:'test-only',WAVESPEED_API_KEY:'test-only',KIVELLE_WAVESPEED_CHAT_TEST_ENABLED:'true',KIVELLE_VENICE_CHAT_TEST_ENABLED:'true',KIVELLE_XAI_ENABLED:'true',KIVELLE_XAI_EXPLICIT_ENABLED:'true',KIVELLE_PRIVATE_ADULT_TEXT_MODE:'on'};
  const previous=Object.keys(env).map(key=>Deno.env.get(key));
  try{Object.entries(env).forEach(([key,value])=>Deno.env.set(key,value));await run();}
  finally{Object.keys(env).forEach((key,index)=>{const value=previous[index];if(value===undefined)Deno.env.delete(key);else Deno.env.set(key,value);});}
}

Deno.test('current moderation is evaluated on every turn, and only fresh evidence renews routing',()=>configured(()=>{
  const first=resolveDialogueRouting({...base,moderation:classified});
  assertEquals(first.adultRouting?.freshAdult,true);
  const history=[first.adultRouting];
  for(const remaining of [3,2,1,0]){
    const route=resolveDialogueRouting({...base,routingHistory:history});
    assertEquals(route.carryoverTurnsRemaining,remaining);
    assertEquals(route.provider,remaining?'xai':'openai');
    assertEquals(route.classification,'standard');
    assertEquals(route.adultRouting?.freshAdult,false);
    history.push(route.adultRouting);
  }
  assertEquals(resolveDialogueRouting({...base,routingHistory:history,moderation:classified}).adultRouting?.freshAdult,true);
  const blocked=resolveDialogueRouting({...base,adultAttachment:true,routingHistory:[fresh],moderation:{...classified,categories:['sexual/minors']}});
  assertEquals(blocked.hardBlocked,true);
  assertEquals(blocked.provider,'deterministic');
}));

Deno.test('contextual continuation and assistant output never become fresh evidence',()=>configured(()=>{
  const route=resolveDialogueRouting({...base,message:'Continue.',recentTurns:[{role:'assistant',content:'[NSFW context]'}],routingHistory:[fresh]});
  assertEquals(route.explicit,true);
  assertEquals(route.adultRouting?.freshAdult,false);
}));

Deno.test('permission, preference, relationship and rollout changes override carried routing',()=>configured(()=>{
  for(const patch of [{adultAuthorized:false},{ageVerified:false},{characterAge:null},{characterAge:17},{requestedMode:'mature' as const},{relationshipAllowsExplicit:false},{photoRequest:true}]){
    assertEquals(resolveDialogueRouting({...base,routingHistory:[fresh],...patch}).explicit,false);
  }
  Deno.env.set('KIVELLE_PRIVATE_ADULT_TEXT_MODE','off');
  assertEquals(resolveDialogueRouting({...base,routingHistory:[fresh]}).explicit,false);
}));

Deno.test('a group turn freezes its history for every speaker and does not consume multiple user turns',()=>configured(()=>{
  const history=[fresh];
  for(let speaker=0;speaker<5;speaker++){
    assertEquals(resolveDialogueRouting({...base,routingHistory:history}).carryoverTurnsRemaining,3);
  }
  assertEquals(history,[fresh]);
  assertEquals(resolveDialogueRouting({...base,routingHistory:history,adultAuthorized:false}).explicit,false);
}));

Deno.test('suggestive and carried routes preserve the exact owner-selected model and quote routing',()=>configured(async()=>{
  const owner='0aaaa97b-a210-4d06-893a-7780bed71927';
  const query={select(){return query;},eq(){return query;},maybeSingle(){return Promise.resolve({data:{enabled:true,version:2},error:null});}};
  const db={from:()=>query};
  const conversation={user_id:owner,metadata:{chatPreferences:{veniceTestModel:'deepseek_v4_flash'}}};
  const first=await applyChatTestRoute(db,owner,conversation,resolveDialogueRouting({...base,message:'You look seductive.'}));
  const request={...base,routingHistory:[first.adultRouting]};
  const quote=await applyChatTestRoute(db,owner,conversation,resolveDialogueRouting(request));
  const generation=await applyChatTestRoute(db,owner,conversation,resolveDialogueRouting(request));
  assertEquals(first.provider,'wavespeed');
  assertEquals(generation.provider,first.provider);
  assertEquals(generation.experiment?.model,first.experiment?.model);
  assertEquals(generation,quote);
  assertEquals((await applyChatTestRoute(db,'other-owner',{...conversation,user_id:'other-owner'},resolveDialogueRouting(request))).provider,'xai');
}));

Deno.test('history is user/conversation scoped, user-turn bounded, ordered and retry stable',async()=>{
  const calls:unknown[][]=[];
  const query={
    select(...args:unknown[]){calls.push(['select',...args]);return query;},
    eq(...args:unknown[]){calls.push(['eq',...args]);return query;},
    lt(...args:unknown[]){calls.push(['lt',...args]);return query;},
    order(...args:unknown[]){calls.push(['order',...args]);return query;},
    async limit(...args:unknown[]){calls.push(['limit',...args]);return {data:[{provider_metadata:{adultRouting:{...fresh,freshAdult:false}}},{provider_metadata:{adultRouting:fresh}}],error:null};},
  };
  const db={from(table:string){assertEquals(table,'together_messages');return query;}} as unknown as SupabaseClient;
  const history=await loadAdultRoutingHistory(db,'owner-a','chat-a',42);
  assertEquals(history[0],fresh);
  assertEquals(calls,[['select','provider_metadata'],['eq','user_id','owner-a'],['eq','conversation_id','chat-a'],['eq','role','user'],['lt','conversation_sequence',42],['order','conversation_sequence',{ascending:false}],['limit',3]]);
  calls.length=0;
  assertEquals(await loadAdultRoutingHistory(db,'owner-a','chat-a',42),history);
});

Deno.test('history failures do not silently switch providers',async()=>{
  const query={select(){return query;},eq(){return query;},order(){return query;},limit(){return Promise.resolve({data:null,error:{code:'unavailable'}});}};
  await assertRejects(()=>loadAdultRoutingHistory({from:()=>query} as unknown as SupabaseClient,'owner','chat'));
});
