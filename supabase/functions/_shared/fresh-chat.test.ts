import { assertEquals, assertRejects } from 'jsr:@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startConfirmedFreshChat } from './fresh-chat.ts';
import { AppError } from './types.ts';

const intent = { characterInstanceId:'character', expectedConversationId:'original', requestId:'same-request', confirmation:'start_fresh_chat' };
Deno.test('fresh chat rejects legacy, missing and incorrect intent before any database call', async () => {
  let calls = 0;
  const db = { rpc: () => { calls++; } } as unknown as SupabaseClient;
  for (const input of [{characterInstanceId:'character'}, {...intent,confirmation:'yes'}, {...intent,requestId:undefined}, {...intent,expectedConversationId:undefined}]) {
    await assertRejects(() => startConfirmedFreshChat(db,'owner',input), AppError);
  }
  assertEquals(calls,0);
});
Deno.test('fresh chat submits only the confirmed scope and preserves replay result', async () => {
  const calls: unknown[] = [];
  const db = { rpc: (...args: unknown[]) => { calls.push(args); return Promise.resolve({data:{conversation:{id:'new'},replayed:true},error:null}); } } as unknown as SupabaseClient;
  const result = await startConfirmedFreshChat(db,'owner',intent);
  assertEquals(result.replayed,true);
  assertEquals(calls,[['kivelle_start_fresh_conversation',{p_user_id:'owner',p_character_instance_id:'character',p_expected_conversation_id:'original',p_request_id:'same-request',p_confirmation:'start_fresh_chat'}]]);
});
Deno.test('stale confirmation and busy turns are non-retryable conflicts', async () => {
  for (const message of ['FRESH_CHAT_STALE','FRESH_CHAT_REQUEST_CONFLICT','FRESH_CHAT_BUSY']) {
    const db = { rpc: () => Promise.resolve({data:null,error:{message}}) } as unknown as SupabaseClient;
    const error = await assertRejects(() => startConfirmedFreshChat(db,'owner',intent),AppError);
    assertEquals(error.status,409);assertEquals(error.retryable,false);
  }
});
