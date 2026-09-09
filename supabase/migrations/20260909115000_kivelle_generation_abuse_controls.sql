begin;

-- These controls are deliberately server-only. They bound provider work across
-- horizontally scaled Edge Function instances without turning abuse ceilings
-- into user-facing plan allowances.
create table if not exists public.kivelle_generation_guardrail_config (
  singleton boolean primary key default true check (singleton),
  account_concurrency_limit integer not null default 2 check (account_concurrency_limit between 1 and 8),
  dialogue_rolling_limits jsonb not null default '[{"windowSeconds":20,"limit":4},{"windowSeconds":300,"limit":20},{"windowSeconds":3600,"limit":240}]'::jsonb,
  auxiliary_rolling_limits jsonb not null default '[{"windowSeconds":20,"limit":3},{"windowSeconds":300,"limit":12},{"windowSeconds":3600,"limit":60}]'::jsonb,
  cost_limit_15m_usd numeric(18,10),
  cost_limit_daily_usd numeric(18,10),
  cost_circuit_enabled boolean not null default false,
  cooldown_seconds integer not null default 900 check (cooldown_seconds between 60 and 86400),
  percentile_source jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(dialogue_rolling_limits)='array'),
  check (jsonb_typeof(auxiliary_rolling_limits)='array'),
  check (cost_limit_15m_usd is null or cost_limit_15m_usd>0),
  check (cost_limit_daily_usd is null or cost_limit_daily_usd>0)
);

insert into public.kivelle_generation_guardrail_config(singleton)
values(true) on conflict(singleton) do nothing;

create table if not exists public.kivelle_rolling_rate_events (
  id bigint generated always as identity primary key,
  subject text not null,
  action text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists kivelle_rolling_rate_events_lookup_idx
  on public.kivelle_rolling_rate_events(subject,action,created_at desc);
create index if not exists together_media_usage_user_created_idx
  on public.together_media_usage_events(user_id,created_at desc);
create index if not exists together_voice_usage_user_created_idx
  on public.together_voice_usage_events(user_id,created_at desc);

create table if not exists public.kivelle_account_generation_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  starts_at timestamptz not null default clock_timestamp(),
  ends_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  check (ends_at>starts_at)
);

create table if not exists public.kivelle_generation_request_anchors (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  request_fingerprint text not null,
  canonical_request_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,conversation_id,request_fingerprint)
);
create index if not exists kivelle_generation_request_anchors_expiry_idx
  on public.kivelle_generation_request_anchors(expires_at);

create table if not exists public.together_dialogue_suggestion_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  anchor_message_id uuid not null references public.together_messages(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  preference text not null,
  content_mode text not null,
  suggestion_text text not null,
  source text not null,
  intent text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,conversation_id,anchor_message_id,preference,content_mode)
);
create index if not exists together_dialogue_suggestion_cache_expiry_idx
  on public.together_dialogue_suggestion_cache(expires_at);

alter table public.kivelle_generation_guardrail_config enable row level security;
alter table public.kivelle_rolling_rate_events enable row level security;
alter table public.kivelle_account_generation_cooldowns enable row level security;
alter table public.kivelle_generation_request_anchors enable row level security;
alter table public.together_dialogue_suggestion_cache enable row level security;

revoke all on public.kivelle_generation_guardrail_config from public,anon,authenticated;
revoke all on public.kivelle_rolling_rate_events from public,anon,authenticated;
revoke all on public.kivelle_account_generation_cooldowns from public,anon,authenticated;
revoke all on public.kivelle_generation_request_anchors from public,anon,authenticated;
revoke all on public.together_dialogue_suggestion_cache from public,anon,authenticated;
grant all on public.kivelle_generation_guardrail_config to service_role;
grant all on public.kivelle_rolling_rate_events to service_role;
grant all on public.kivelle_account_generation_cooldowns to service_role;
grant all on public.kivelle_generation_request_anchors to service_role;
grant all on public.together_dialogue_suggestion_cache to service_role;
grant usage,select on sequence public.kivelle_rolling_rate_events_id_seq to service_role;

-- Seed spend ceilings from actual historical account usage. Sparse projects
-- remain fail-open until an operator has enough observations to enable them;
-- no made-up dollar threshold is silently introduced by this migration.
with provider_cost_events as (
  select user_id,created_at,coalesce(provider_cost_usd,estimated_cost_usd,0)::numeric cost
  from public.together_ai_usage_events
  union all
  select user_id,created_at,coalesce(actual_provider_cost_usd,estimated_provider_cost_usd,0)::numeric cost
  from public.together_media_usage_events
  union all
  select user_id,created_at,coalesce(estimated_cost_usd,0)::numeric cost
  from public.together_voice_usage_events
), quarter_hour_buckets as (
  select user_id,
    date_trunc('hour',created_at)+make_interval(mins=>(extract(minute from created_at)::integer/15)*15) bucket,
    sum(cost) cost
  from provider_cost_events
  where created_at>=clock_timestamp()-interval '30 days'
  group by user_id,2
), daily_buckets as (
  select user_id,date_trunc('day',created_at) bucket,
    sum(cost) cost
  from provider_cost_events
  where created_at>=clock_timestamp()-interval '30 days'
  group by user_id,2
), observed as (
  select
    (select count(*) from quarter_hour_buckets where cost>0) samples_15m,
    (select percentile_cont(.995) within group(order by cost) from quarter_hour_buckets where cost>0) p995_15m,
    (select count(*) from daily_buckets where cost>0) samples_daily,
    (select percentile_cont(.995) within group(order by cost) from daily_buckets where cost>0) p995_daily
)
update public.kivelle_generation_guardrail_config config set
  cost_limit_15m_usd=case when observed.samples_15m>=20 and observed.p995_15m>0 then observed.p995_15m*3 else config.cost_limit_15m_usd end,
  cost_limit_daily_usd=case when observed.samples_daily>=20 and observed.p995_daily>0 then observed.p995_daily*3 else config.cost_limit_daily_usd end,
  cost_circuit_enabled=(observed.samples_15m>=20 and observed.p995_15m>0) or (observed.samples_daily>=20 and observed.p995_daily>0),
  percentile_source=jsonb_build_object('lookbackDays',30,'percentile',.995,'multiplier',3,'samples15m',observed.samples_15m,'samplesDaily',observed.samples_daily,'calculatedAt',clock_timestamp()),
  updated_at=clock_timestamp()
from observed where config.singleton=true;

create or replace function public.kivelle_check_generation_guardrails(
  p_user_id uuid,
  p_action text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_config public.kivelle_generation_guardrail_config%rowtype;
  v_rules jsonb;
  v_rule jsonb;
  v_limit integer;
  v_window integer;
  v_count integer;
  v_cost_15m numeric(18,10):=0;
  v_cost_daily numeric(18,10):=0;
  v_retry_at timestamptz;
  v_now timestamptz:=clock_timestamp();
begin
  if p_action not in('dialogue','auxiliary_ai','provider_cost_only') then
    raise exception using errcode='22023',message='INVALID_GENERATION_GUARD_ACTION';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_action,913));
  select * into v_config from public.kivelle_generation_guardrail_config where singleton=true;

  select ends_at into v_retry_at from public.kivelle_account_generation_cooldowns
  where user_id=p_user_id and ends_at>v_now;
  if found then
    return jsonb_build_object('allowed',false,'reason','cost_cooldown','retryAt',v_retry_at);
  end if;

  v_rules:=case
    when p_action='dialogue' then v_config.dialogue_rolling_limits
    when p_action='auxiliary_ai' then v_config.auxiliary_rolling_limits
    else '[]'::jsonb
  end;
  for v_rule in select value from jsonb_array_elements(v_rules)
  loop
    v_window:=least(greatest(coalesce((v_rule->>'windowSeconds')::integer,1),1),86400);
    v_limit:=least(greatest(coalesce((v_rule->>'limit')::integer,1),1),10000);
    select count(*) into v_count from public.kivelle_rolling_rate_events
      where subject=p_user_id::text and action=p_action and created_at>v_now-make_interval(secs=>v_window);
    if v_count>=v_limit then
      return jsonb_build_object('allowed',false,'reason','rolling_rate','retryAfterSeconds',v_window);
    end if;
  end loop;

  if v_config.cost_circuit_enabled then
    select coalesce(sum(cost),0) into v_cost_15m from (
      select coalesce(provider_cost_usd,estimated_cost_usd,0)::numeric cost from public.together_ai_usage_events where user_id=p_user_id and created_at>v_now-interval '15 minutes'
      union all
      select coalesce(actual_provider_cost_usd,estimated_provider_cost_usd,0)::numeric from public.together_media_usage_events where user_id=p_user_id and created_at>v_now-interval '15 minutes'
      union all
      select coalesce(estimated_cost_usd,0)::numeric from public.together_voice_usage_events where user_id=p_user_id and created_at>v_now-interval '15 minutes'
    ) recent_costs;
    select coalesce(sum(cost),0) into v_cost_daily from (
      select coalesce(provider_cost_usd,estimated_cost_usd,0)::numeric cost from public.together_ai_usage_events where user_id=p_user_id and created_at>=date_trunc('day',v_now)
      union all
      select coalesce(actual_provider_cost_usd,estimated_provider_cost_usd,0)::numeric from public.together_media_usage_events where user_id=p_user_id and created_at>=date_trunc('day',v_now)
      union all
      select coalesce(estimated_cost_usd,0)::numeric from public.together_voice_usage_events where user_id=p_user_id and created_at>=date_trunc('day',v_now)
    ) daily_costs;
    if (v_config.cost_limit_15m_usd is not null and v_cost_15m>=v_config.cost_limit_15m_usd)
       or (v_config.cost_limit_daily_usd is not null and v_cost_daily>=v_config.cost_limit_daily_usd) then
      v_retry_at:=v_now+make_interval(secs=>v_config.cooldown_seconds);
      insert into public.kivelle_account_generation_cooldowns(user_id,reason,starts_at,ends_at,metadata,updated_at)
      values(p_user_id,'provider_cost',v_now,v_retry_at,jsonb_build_object('cost15m',v_cost_15m,'costDaily',v_cost_daily),v_now)
      on conflict(user_id) do update set reason=excluded.reason,starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata=excluded.metadata,updated_at=excluded.updated_at;
      return jsonb_build_object('allowed',false,'reason','cost_cooldown','retryAt',v_retry_at);
    end if;
  end if;

  if p_action<>'provider_cost_only' then
    insert into public.kivelle_rolling_rate_events(subject,action,created_at)
    values(p_user_id::text,p_action,v_now);
  end if;
  delete from public.kivelle_rolling_rate_events
    where subject=p_user_id::text and action=p_action and created_at<v_now-interval '25 hours';
  return jsonb_build_object('allowed',true);
end;
$$;

create or replace function public.kivelle_claim_generation_request_anchor(
  p_user_id uuid,
  p_conversation_id uuid,
  p_request_fingerprint text,
  p_request_id text,
  p_ttl_seconds integer default 20
) returns text
language plpgsql security definer set search_path='' as $$
declare v_existing text; v_now timestamptz:=clock_timestamp();
begin
  if nullif(trim(p_request_fingerprint),'') is null or nullif(trim(p_request_id),'') is null then
    raise exception using errcode='22023',message='INVALID_GENERATION_REQUEST_ANCHOR';
  end if;
  if not exists(select 1 from public.together_conversations where id=p_conversation_id and user_id=p_user_id) then
    raise exception using errcode='42501',message='GENERATION_REQUEST_ANCHOR_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_conversation_id::text||':'||p_request_fingerprint,229));
  select canonical_request_id into v_existing from public.kivelle_generation_request_anchors
    where user_id=p_user_id and conversation_id=p_conversation_id and request_fingerprint=p_request_fingerprint and expires_at>v_now;
  if found then return v_existing; end if;
  insert into public.kivelle_generation_request_anchors(user_id,conversation_id,request_fingerprint,canonical_request_id,expires_at)
  values(p_user_id,p_conversation_id,p_request_fingerprint,p_request_id,v_now+make_interval(secs=>least(greatest(p_ttl_seconds,5),60)))
  on conflict(user_id,conversation_id,request_fingerprint) do update set canonical_request_id=excluded.canonical_request_id,expires_at=excluded.expires_at,created_at=v_now;
  delete from public.kivelle_generation_request_anchors where expires_at<v_now-interval '1 hour';
  return p_request_id;
end;
$$;

-- Preserve historical content while consistently rejecting new oversized user
-- messages regardless of which server path performs the insert.
create or replace function public.kivelle_enforce_chat_user_message_input()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.role='user' and (nullif(trim(new.content),'') is null or char_length(new.content)>2000) then
    raise exception using errcode='22023',message='INVALID_CHAT_MESSAGE';
  end if;
  return new;
end;
$$;
drop trigger if exists kivelle_enforce_chat_user_message_input on public.together_messages;
create trigger kivelle_enforce_chat_user_message_input
before insert or update of role,content on public.together_messages
for each row execute function public.kivelle_enforce_chat_user_message_input();

create index if not exists together_dialogue_turns_user_active_idx
  on public.together_dialogue_turns(user_id,lease_expires_at)
  where state in('planning','generating');

create or replace function public.kivelle_begin_dialogue_turn(
  p_user_id uuid,
  p_continuity_id uuid,
  p_conversation_id uuid,
  p_request_id text,
  p_turn_kind text,
  p_supersede_generating boolean default false,
  p_lease_seconds integer default 180
) returns table(turn_id uuid,lease_token uuid,acquired boolean,active_state text,active_request_id text,interrupted_count integer)
language plpgsql security definer set search_path='' as $$
declare
  active_turn public.together_dialogue_turns%rowtype;
  request_turn public.together_dialogue_turns%rowtype;
  created_turn public.together_dialogue_turns%rowtype;
  interruption_count integer:=0;
  bounded_lease integer:=least(greatest(p_lease_seconds,30),600);
  active_count integer:=0;
  concurrency_limit integer:=2;
begin
  if p_turn_kind not in('direct','group','shared_scene') or nullif(trim(p_request_id),'') is null then raise exception 'invalid dialogue turn request'; end if;
  perform 1 from public.together_conversations where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id and archived_at is null and user_archived_at is null for update;
  if not found then raise exception 'conversation unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,557));
  update public.together_dialogue_turns set state='failed',version=version+1,metadata=metadata||'{"leaseExpired":true}'::jsonb,updated_at=clock_timestamp()
    where user_id=p_user_id and state in('planning','generating') and lease_expires_at<=clock_timestamp();
  select * into active_turn from public.together_dialogue_turns where conversation_id=p_conversation_id and state in('planning','generating') order by created_at desc limit 1 for update;
  if found then
    if active_turn.request_id=p_request_id then return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0; return; end if;
    if not p_supersede_generating or active_turn.state='planning' then return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0; return; end if;
    update public.together_dialogue_turns set state='cancelled',cancelled_at=clock_timestamp(),version=version+1,metadata=metadata||jsonb_build_object('supersededByRequestId',p_request_id),updated_at=clock_timestamp() where id=active_turn.id and state='generating';
    get diagnostics interruption_count=row_count;
  end if;
  select * into request_turn from public.together_dialogue_turns where conversation_id=p_conversation_id and request_id=p_request_id for update;
  if found then
    if request_turn.turn_kind<>p_turn_kind then raise exception 'dialogue turn kind mismatch'; end if;
    if request_turn.state in('failed','cancelled') or (request_turn.state in('completed','yielded') and request_turn.source_message_id is not null and not exists(select 1 from public.together_messages m where m.dialogue_turn_id=request_turn.id and m.role='assistant')) then
      select account_concurrency_limit into concurrency_limit from public.kivelle_generation_guardrail_config where singleton=true;
      select count(*) into active_count from public.together_dialogue_turns where user_id=p_user_id and state in('planning','generating') and id<>request_turn.id;
      if active_count>=coalesce(concurrency_limit,2) then raise exception using errcode='P0001',message='DIALOGUE_ACCOUNT_CAPACITY'; end if;
      update public.together_dialogue_turns set state='planning',version=version+1,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>bounded_lease),yielded_at=null,cancelled_at=null,planned_actions='[]'::jsonb,completed_action_count=0,metadata=metadata||jsonb_build_object('retryCount',(case when coalesce(metadata->>'retryCount','')~'^[0-9]+$' then (metadata->>'retryCount')::integer else 0 end)+1),updated_at=clock_timestamp() where id=request_turn.id returning * into request_turn;
      return query select request_turn.id,request_turn.lease_token,true,request_turn.state,request_turn.request_id,interruption_count; return;
    end if;
    return query select request_turn.id,request_turn.lease_token,false,request_turn.state,request_turn.request_id,interruption_count; return;
  end if;
  select account_concurrency_limit into concurrency_limit from public.kivelle_generation_guardrail_config where singleton=true;
  select count(*) into active_count from public.together_dialogue_turns where user_id=p_user_id and state in('planning','generating');
  if active_count>=coalesce(concurrency_limit,2) then raise exception using errcode='P0001',message='DIALOGUE_ACCOUNT_CAPACITY'; end if;
  insert into public.together_dialogue_turns(user_id,continuity_id,conversation_id,state,version,request_id,turn_kind,lease_token,lease_expires_at,planned_actions,metadata)
  values(p_user_id,p_continuity_id,p_conversation_id,'planning',1,p_request_id,p_turn_kind,gen_random_uuid(),clock_timestamp()+make_interval(secs=>bounded_lease),'[]'::jsonb,'{}'::jsonb) returning * into created_turn;
  return query select created_turn.id,created_turn.lease_token,true,created_turn.state,created_turn.request_id,interruption_count;
end;
$$;

revoke all on function public.kivelle_check_generation_guardrails(uuid,text) from public,anon,authenticated;
revoke all on function public.kivelle_claim_generation_request_anchor(uuid,uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.kivelle_enforce_chat_user_message_input() from public,anon,authenticated;
revoke all on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.kivelle_check_generation_guardrails(uuid,text) to service_role;
grant execute on function public.kivelle_claim_generation_request_anchor(uuid,uuid,text,text,integer) to service_role;
grant execute on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;

commit;
