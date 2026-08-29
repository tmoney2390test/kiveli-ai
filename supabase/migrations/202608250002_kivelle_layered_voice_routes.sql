begin;

alter table public.together_voice_call_sessions
  add column if not exists route text not null default 'express',
  add column if not exists billing_mode text not null default 'credits',
  add column if not exists credits_per_minute integer not null default 8,
  add column if not exists included_minutes_charged integer not null default 0,
  add column if not exists relay_session_id text,
  add column if not exists last_usage_sequence integer not null default 0;

alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_route_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_route_check
  check(route in('standard','express'));
alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_billing_mode_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_billing_mode_check
  check(billing_mode in('included_then_credits','credits'));
alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_layered_usage_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_layered_usage_check check(
    credits_per_minute between 1 and 100 and
    included_minutes_charged >= 0 and
    last_usage_sequence >= 0
  );

create index if not exists together_voice_call_route_period_idx
  on public.together_voice_call_sessions(user_id,route,created_at desc);

create table if not exists public.together_voice_minute_ledger(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  call_session_id uuid not null references public.together_voice_call_sessions(id) on delete cascade,
  route text not null check(route in('standard','express')),
  minute_number integer not null check(minute_number between 1 and 1440),
  billing_source text not null check(billing_source in('included','credits')),
  credits_charged integer not null default 0 check(credits_charged between 0 and 100),
  credit_transaction_id uuid references public.together_credit_ledger(id) on delete set null,
  allowance_period_start timestamptz,
  allowance_period_end timestamptz,
  created_at timestamptz not null default now(),
  unique(call_session_id,minute_number)
);
create index if not exists together_voice_minute_allowance_idx
  on public.together_voice_minute_ledger(user_id,route,allowance_period_start,allowance_period_end)
  where billing_source='included';
alter table public.together_voice_minute_ledger enable row level security;
drop policy if exists together_voice_minute_own_read on public.together_voice_minute_ledger;
create policy together_voice_minute_own_read on public.together_voice_minute_ledger
  for select to authenticated using(user_id=auth.uid());
grant select on public.together_voice_minute_ledger to authenticated;

create or replace function public.kivelle_allocate_voice_included_minute(
  p_user_id uuid,
  p_call_session_id uuid,
  p_minute_number integer,
  p_limit integer,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  existing_source text;
  used_count bigint;
  period_key text;
begin
  if p_limit<=0 or p_minute_number<1 or p_minute_number>1440 then
    return false;
  end if;
  if not exists(
    select 1 from public.together_voice_call_sessions
    where id=p_call_session_id and user_id=p_user_id and route='standard'
  ) then
    raise exception 'voice call does not belong to user';
  end if;

  period_key=coalesce(p_period_start::text,'lifetime');
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':standard-voice:'||period_key,0));

  select billing_source into existing_source
  from public.together_voice_minute_ledger
  where call_session_id=p_call_session_id and minute_number=p_minute_number;
  if found then
    return existing_source='included';
  end if;

  select count(*) into used_count
  from public.together_voice_minute_ledger
  where user_id=p_user_id
    and route='standard'
    and billing_source='included'
    and (
      (p_period_start is null and allowance_period_start is null)
      or
      (allowance_period_start=p_period_start and allowance_period_end=p_period_end)
    );
  if used_count>=p_limit then
    return false;
  end if;

  insert into public.together_voice_minute_ledger(
    user_id,call_session_id,route,minute_number,billing_source,
    credits_charged,allowance_period_start,allowance_period_end
  ) values(
    p_user_id,p_call_session_id,'standard',p_minute_number,'included',
    0,p_period_start,p_period_end
  ) on conflict(call_session_id,minute_number) do nothing;

  select billing_source into existing_source
  from public.together_voice_minute_ledger
  where call_session_id=p_call_session_id and minute_number=p_minute_number;
  return existing_source='included';
end;
$$;
revoke all on function public.kivelle_allocate_voice_included_minute(uuid,uuid,integer,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_allocate_voice_included_minute(uuid,uuid,integer,integer,timestamptz,timestamptz) to service_role;

create table if not exists public.together_voice_pipeline_usage_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  call_session_id uuid not null references public.together_voice_call_sessions(id) on delete cascade,
  sequence integer not null check(sequence>0),
  route text not null check(route in('standard','express')),
  stt_billable_ms bigint not null default 0 check(stt_billable_ms>=0),
  input_speech_ms bigint not null default 0 check(input_speech_ms>=0),
  dialogue_input_tokens integer not null default 0 check(dialogue_input_tokens>=0),
  dialogue_cached_input_tokens integer not null default 0 check(dialogue_cached_input_tokens>=0),
  dialogue_output_tokens integer not null default 0 check(dialogue_output_tokens>=0),
  tts_characters integer not null default 0 check(tts_characters>=0),
  output_audio_ms bigint not null default 0 check(output_audio_ms>=0),
  discarded_output_audio_ms bigint not null default 0 check(discarded_output_audio_ms>=0),
  stt_final_latency_ms integer,
  dialogue_first_token_latency_ms integer,
  tts_first_audio_latency_ms integer,
  estimated_cost_usd numeric(12,6) not null default 0 check(estimated_cost_usd>=0),
  status text not null check(status in('success','interrupted','failure')),
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(call_session_id,sequence)
);
create index if not exists together_voice_pipeline_period_idx
  on public.together_voice_pipeline_usage_events(user_id,created_at desc);
alter table public.together_voice_pipeline_usage_events enable row level security;
drop policy if exists together_voice_pipeline_own_read on public.together_voice_pipeline_usage_events;
revoke all on public.together_voice_pipeline_usage_events from anon,authenticated;

comment on table public.together_voice_minute_ledger is
  'Server-authoritative per-started-minute ledger. Standard included minutes are non-rollover and separate from general Kivelle Credits.';
comment on table public.together_voice_pipeline_usage_events is
  'Numeric per-stage voice telemetry only. Prompts, transcripts, and raw audio must never be stored here.';

commit;
