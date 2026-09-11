import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Isolated, no Supabase container, network, private conversation data or AI calls.
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const companion = '00000000-0000-4000-8000-000000000003';
const request = '00000000-0000-4000-8000-000000000004';
const otherRequest = '00000000-0000-4000-8000-000000000005';
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const open = async () => one('select (public.kivelle_start_conversation($1,$2)).*', [owner, companion]);
const fresh = async (old, id = request, confirmation = 'start_fresh_chat', user = owner, character = companion) =>
  (await one('select public.kivelle_start_fresh_conversation($1,$2,$3,$4,$5) as result', [user, character, old, id, confirmation])).result;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table public.together_character_instances(id uuid primary key,user_id uuid,relationship_stage text,life_state text);
    create table public.together_conversations(id uuid primary key default gen_random_uuid(),user_id uuid,character_instance_id uuid,kind text,title text,
      created_at timestamptz default now(),updated_at timestamptz default now(),archived_at timestamptz,user_archived_at timestamptz,last_read_at timestamptz,metadata jsonb default '{}');
    create table public.together_proactive_messages(id uuid primary key default gen_random_uuid(),user_id uuid,character_instance_id uuid,conversation_id uuid,status text,updated_at timestamptz);
    create table public.together_dialogue_turns(id uuid primary key default gen_random_uuid(),user_id uuid,conversation_id uuid,state text);
    create table public.together_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,content text);
    create table public.together_memories(user_id uuid,character_instance_id uuid,content text);
    create table public.together_generated_media(user_id uuid,character_instance_id uuid);
  `);
  const sql = readFileSync(new URL('../supabase/migrations/20260911161232_explicit_fresh_chat.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.query('insert into together_character_instances values($1,$2,\'friend\',\'dead\')', [companion, owner]);
  const original = await open();
  await db.query("update together_conversations set metadata='{\"chatPreferences\":{\"responseStyle\":\"paragraph\"}}' where id=$1", [original.id]);
  await db.query("insert into together_messages(conversation_id,content) values($1,'A neutral story detail')", [original.id]);
  await db.query("insert into together_memories values($1,$2,'A saved detail')", [owner,companion]);
  await db.query('insert into together_generated_media values($1,$2)', [owner,companion]);
  await db.query("insert into together_proactive_messages(user_id,character_instance_id,conversation_id,status) values($1,$2,$3,'queued')", [owner,companion,original.id]);
  check((await open()).id, original.id);
  check((await one('select archived_at from together_conversations where id=$1',[original.id])).archived_at, null);
  check((await one('select status from together_proactive_messages')).status,'queued');
  check((await Promise.all([open(),open()])).map(x=>x.id),[original.id,original.id]);
  for (const confirmation of [null,'','yes']) {
    await assert.rejects(fresh(original.id,request,confirmation),/FRESH_CHAT_CONFIRMATION_REQUIRED/);checks++;
  }
  await assert.rejects(fresh(null),/FRESH_CHAT_CONFIRMATION_REQUIRED/);checks++;
  await assert.rejects(fresh(original.id,request,'start_fresh_chat',stranger),/companion not found/);checks++;
  await db.query("select set_config('test.user',$1,false)",[stranger]);
  await assert.rejects(fresh(original.id),/not authorized/);checks++;
  await db.exec("select set_config('test.user','',false)");
  await db.query("insert into together_dialogue_turns(user_id,conversation_id,state) values($1,$2,'generating')", [owner,original.id]);
  await assert.rejects(fresh(original.id),/FRESH_CHAT_BUSY/);checks++;
  check((await open()).id,original.id);
  await db.exec("update together_dialogue_turns set state='completed'");
  const result = await fresh(original.id);
  check(result.replayed,false);
  assert.notEqual(result.conversation.id, original.id);checks++;
  check(result.conversation.metadata.previousConversationId, original.id);
  check(result.conversation.metadata.chatPreferences.responseStyle,'paragraph');
  check((await open()).id,result.conversation.id);
  check((await one('select status from together_proactive_messages')).status,'cancelled');
  const retry = await fresh(original.id);
  check(retry.replayed,true);check(retry.conversation.id,result.conversation.id);
  await assert.rejects(fresh(original.id,otherRequest),/FRESH_CHAT_STALE/);checks++;
  await assert.rejects(fresh(result.conversation.id,request),/FRESH_CHAT_REQUEST_CONFLICT/);checks++;
  check((await one('select count(*)::int as n from together_conversations')).n,2);
  check((await one('select count(*)::int as n from together_messages where conversation_id=$1',[original.id])).n,1);
  check((await one('select count(*)::int as n from together_memories')).n,1);
  check((await one('select count(*)::int as n from together_generated_media')).n,1);
  check(await one('select relationship_stage,life_state from together_character_instances'),{relationship_stage:'friend',life_state:'dead'});
  for (const role of ['anon','authenticated']) for (const signature of ['kivelle_start_conversation(uuid,uuid)','kivelle_start_fresh_conversation(uuid,uuid,uuid,uuid,text)']) {
    check((await one('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,signature])).allowed,false);
  }
  check((await one("select has_function_privilege('service_role','kivelle_start_fresh_conversation(uuid,uuid,uuid,uuid,text)','EXECUTE') as allowed")).allowed,true);
  // Reapplying the additive migration must not touch existing conversation data.
  await db.exec(sql);
  check((await open()).id,result.conversation.id);
  console.log(`Fresh-chat database contract: ${checks} checks passed (isolated PGlite; not a full Supabase integration test).`);
} finally { await db.close(); }
