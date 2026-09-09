import{assertEquals,assertRejects}from'jsr:@std/assert@1';
import type{SupabaseClient}from'@supabase/supabase-js';
import{beginConversationTurn,finishTurnWithResponse,type ConversationTurnLease}from'./together-dialogue-turns.ts';

Deno.test('conversation turn acquisition preserves the database owner token',async()=>{
  const db={rpc:async(name:string)=>({data:name==='kivelle_begin_dialogue_turn'?[{turn_id:'turn-1',lease_token:'lease-1',acquired:true,active_state:'planning',active_request_id:'request-1',interrupted_count:1}]:null,error:null})} as unknown as SupabaseClient;
  const lease=await beginConversationTurn(db,{userId:'user-1',continuityId:'continuity-1',conversationId:'conversation-1',requestId:'request-1',kind:'group',supersedeGenerating:true});
  assertEquals(lease,{id:'turn-1',token:'lease-1',acquired:true,state:'planning',requestId:'request-1',interruptedCount:1});
});

Deno.test('account-wide capacity is a retryable user error',async()=>{
  const db={rpc:async()=>({data:null,error:{message:'DIALOGUE_ACCOUNT_CAPACITY'}})} as unknown as SupabaseClient;
  const error=await assertRejects(()=>beginConversationTurn(db,{userId:'user-1',continuityId:'continuity-1',conversationId:'conversation-1',requestId:'request-1',kind:'direct'}));
  assertEquals((error as {code?:string}).code,'RATE_LIMITED');
  assertEquals((error as {retryable?:boolean}).retryable,true);
});

Deno.test('a streamed direct response releases its floor only through the token-guarded finish RPC',async()=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[];
  const db={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{data:true,error:null};}} as unknown as SupabaseClient;
  const lease:ConversationTurnLease={id:'turn-1',token:'lease-1',acquired:true,state:'generating',requestId:'request-1',interruptedCount:0};
  const response=await finishTurnWithResponse(db,lease,new Response('hello',{status:200,headers:{'x-test':'preserved'}}));
  assertEquals(await response.text(),'hello');
  assertEquals(response.headers.get('x-test'),'preserved');
  assertEquals(calls,[{name:'kivelle_finish_dialogue_turn',args:{p_turn_id:'turn-1',p_lease_token:'lease-1',p_state:'completed',p_metadata:null}}]);
});
