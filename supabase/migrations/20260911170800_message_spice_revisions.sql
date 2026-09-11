-- Private, service-only revision journal. No original text is placed in public
-- message metadata or analytics. Account/message deletion removes the journal.
alter table public.together_messages add column revised_at timestamptz;
create index together_messages_revision_delta on public.together_messages(conversation_id,revised_at) where revised_at is not null;
create table public.together_message_rewrites (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.together_messages(id) on delete cascade,
  turn_id uuid not null references public.together_dialogue_turns(id) on delete cascade,
  expected_version integer not null check(expected_version>=0),
  action text not null check(action in ('spice','restore')),
  status text not null default 'pending' check(status in ('pending','completed','failed')),
  previous_message jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index together_message_rewrites_allowance on public.together_message_rewrites(user_id,created_at) where action='spice' and status<>'failed';
create index together_message_rewrites_history on public.together_message_rewrites(message_id,expected_version) where status='completed';
alter table public.together_message_rewrites enable row level security;
revoke all on public.together_message_rewrites from public,anon,authenticated;
grant all on public.together_message_rewrites to service_role;

create function public.kivelle_daily_rewrite_usage(p_user_id uuid,p_since timestamptz)
returns bigint language sql stable security definer set search_path=public as $$
 select count(*) from public.together_message_rewrites r join public.together_dialogue_turns t on t.id=r.turn_id
 where r.user_id=p_user_id and r.action='spice' and r.created_at>=p_since
 and (r.status='completed' or (r.status='pending' and t.state in ('planning','generating') and t.lease_expires_at>now()));
$$;
revoke all on function public.kivelle_daily_rewrite_usage(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_daily_rewrite_usage(uuid,timestamptz) to service_role;

-- An existing message may receive another independently quoted reply. Keep all
-- historical receipts; quote/reply idempotency remains unchanged.
alter table public.together_context_receipts drop constraint together_context_receipts_pkey;
alter table public.together_context_receipts add primary key(message_id,reply_key);
create trigger together_message_revision_context_receipt after update of provider_metadata on public.together_messages
for each row when (new.provider_metadata->'contextCharge' is distinct from old.provider_metadata->'contextCharge'
  and new.provider_metadata->'contextCharge' is not null)
execute function public.kivelle_commit_context_receipt();

create function public.kivelle_claim_message_rewrite(
 p_user_id uuid,p_message_id uuid,p_request_id uuid,p_turn_id uuid,p_lease_token uuid,
 p_expected_version integer,p_action text,p_daily_limit integer default null
) returns text language plpgsql security definer set search_path=public as $$
declare t public.together_dialogue_turns; m public.together_messages; r public.together_message_rewrites; used bigint;
begin
 -- Match ordinary turn acquisition: conversation -> turn -> message.
 perform 1 from public.together_conversations c join public.together_dialogue_turns x on x.conversation_id=c.id
 where x.id=p_turn_id and c.user_id=p_user_id and c.archived_at is null and c.user_archived_at is null for update of c;
 if not found then raise exception 'REWRITE_CONFLICT'; end if;
 select * into t from public.together_dialogue_turns where id=p_turn_id and user_id=p_user_id and lease_token=p_lease_token for update;
 if t.id is null or t.request_id<>p_request_id::text or t.state not in ('planning','generating') or t.lease_expires_at<=clock_timestamp() then raise exception 'REWRITE_CONFLICT'; end if;
 select * into r from public.together_message_rewrites where id=p_request_id;
 if found then
   if r.user_id<>p_user_id or r.message_id<>p_message_id or r.action<>p_action or r.expected_version<>p_expected_version then raise exception 'REWRITE_CONFLICT'; end if;
   return r.status;
 end if;
 select * into m from public.together_messages where id=p_message_id and user_id=p_user_id and conversation_id=t.conversation_id for update;
 if m.id is null or m.role<>'assistant' or m.delivery_status<>'complete' or nullif(trim(m.content),'') is null
 or m.content='[Photo]' or m.provider_metadata->>'uiHidden'='true' or m.provider_metadata->>'mediaOnly'='true'
 or coalesce((m.provider_metadata->>'rewriteVersion')::integer,0)<>p_expected_version
 or exists(select 1 from public.together_messages n where n.conversation_id=m.conversation_id
   and n.conversation_sequence>m.conversation_sequence and coalesce(n.provider_metadata->>'uiHidden','false')<>'true')
 then raise exception 'REWRITE_CONFLICT'; end if;
 if p_action not in ('spice','restore') then raise exception 'REWRITE_ACTION_INVALID'; end if;
 if p_action='restore' and not exists(select 1 from public.together_message_rewrites where message_id=m.id and user_id=p_user_id and action='spice' and status='completed') then raise exception 'REWRITE_CONFLICT'; end if;
 if p_action='spice' and p_daily_limit is not null then
   perform pg_advisory_xact_lock(hashtextextended('rewrite-allowance:'||p_user_id::text,0));
   select count(*) into used from public.together_messages where user_id=p_user_id and role='user' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
   used=used+(select count(*) from public.together_message_rewrites attempt join public.together_dialogue_turns rt on rt.id=attempt.turn_id
     where attempt.user_id=p_user_id and attempt.action='spice' and attempt.created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
       and (attempt.status='completed' or (attempt.status='pending' and rt.state in ('planning','generating') and rt.lease_expires_at>now())));
   if used>=p_daily_limit then raise exception 'REWRITE_DAILY_LIMIT'; end if;
 end if;
 insert into public.together_message_rewrites(id,user_id,message_id,turn_id,expected_version,action)
 values(p_request_id,p_user_id,p_message_id,p_turn_id,p_expected_version,p_action);
 return 'claimed';
end $$;

create function public.kivelle_commit_message_rewrite(
 p_user_id uuid,p_request_id uuid,p_lease_token uuid,p_content text default null,p_metadata jsonb default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.together_message_rewrites; t public.together_dialogue_turns; m public.together_messages; original jsonb; next_metadata jsonb;
begin
 select * into r from public.together_message_rewrites where id=p_request_id and user_id=p_user_id;
 if r.id is null then raise exception 'REWRITE_CONFLICT'; end if;
 perform 1 from public.together_conversations c join public.together_dialogue_turns x on x.conversation_id=c.id
 where x.id=r.turn_id and c.user_id=p_user_id and c.archived_at is null and c.user_archived_at is null for update of c;
 if not found then raise exception 'REWRITE_CONFLICT'; end if;
 select * into t from public.together_dialogue_turns where id=r.turn_id and user_id=p_user_id and lease_token=p_lease_token for update;
 select * into r from public.together_message_rewrites where id=p_request_id and user_id=p_user_id for update;
 if r.status='completed' then return r.message_id; end if;
 if r.status<>'pending' or t.id is null or t.state<>'generating' or t.lease_expires_at<=clock_timestamp() then raise exception 'REWRITE_CONFLICT'; end if;
 select * into m from public.together_messages where id=r.message_id and user_id=p_user_id and conversation_id=t.conversation_id for update;
 if m.id is null or coalesce((m.provider_metadata->>'rewriteVersion')::integer,0)<>r.expected_version
 or exists(select 1 from public.together_messages n where n.conversation_id=m.conversation_id and n.conversation_sequence>m.conversation_sequence and coalesce(n.provider_metadata->>'uiHidden','false')<>'true') then raise exception 'REWRITE_CONFLICT'; end if;
 if r.action='restore' then
   select previous_message into original from public.together_message_rewrites where message_id=m.id and user_id=p_user_id and action='spice' and status='completed' order by expected_version limit 1;
   if original is null then raise exception 'REWRITE_CONFLICT'; end if;
   p_content=original->>'content';
   -- Restoration is free: never replay a historical context charge.
   next_metadata=(case when jsonb_typeof(original->'provider_metadata')='object' then original->'provider_metadata' else '{}'::jsonb end)-'contextCharge';
 else
   if nullif(trim(p_content),'') is null or char_length(p_content)>12000 or (p_metadata->>'rewriteAction') is distinct from 'spice' then raise exception 'REWRITE_CONTENT_INVALID'; end if;
   next_metadata=coalesce(p_metadata,'{}'::jsonb);
 end if;
 next_metadata=next_metadata||jsonb_build_object('rewriteVersion',r.expected_version+1,'rewriteAction',r.action,'rewriteRequestId',r.id,'canRestoreOriginal',r.action='spice');
 update public.together_message_rewrites set previous_message=jsonb_build_object('content',m.content,'provider_metadata',m.provider_metadata,'content_rating',m.content_rating,'visibility_scope',m.visibility_scope,'moderation_version',m.moderation_version),status='completed',completed_at=now() where id=r.id;
 update public.together_messages set content=p_content,provider_metadata=next_metadata,revised_at=clock_timestamp(),
   content_rating=case when r.action='restore' then original->>'content_rating' else 'explicit' end,
   visibility_scope=case when r.action='restore' then original->>'visibility_scope' else 'all' end,
   moderation_version=case when r.action='restore' then original->>'moderation_version' else 'private-adult-text-v1' end
 where id=m.id;
 return m.id;
end $$;
revoke all on function public.kivelle_claim_message_rewrite(uuid,uuid,uuid,uuid,uuid,integer,text,integer) from public,anon,authenticated;
revoke all on function public.kivelle_commit_message_rewrite(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_claim_message_rewrite(uuid,uuid,uuid,uuid,uuid,integer,text,integer) to service_role;
grant execute on function public.kivelle_commit_message_rewrite(uuid,uuid,uuid,text,jsonb) to service_role;
