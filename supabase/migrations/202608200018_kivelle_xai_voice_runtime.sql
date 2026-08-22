begin;

alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_status_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_status_check
  check(status in('creating','ringing','connecting','active','reconnecting','ending','ended','failed'));
alter table public.together_voice_call_sessions
  add column if not exists model text,
  add column if not exists ended_reason text,
  add column if not exists transcript_status text not null default 'pending',
  add column if not exists transcript_finalized_at timestamptz,
  add column if not exists estimated_cost_usd numeric(12,6),
  add column if not exists connected_duration_ms bigint not null default 0,
  add column if not exists input_audio_duration_ms bigint not null default 0,
  add column if not exists output_audio_duration_ms bigint not null default 0,
  add column if not exists reconnect_count integer not null default 0;
alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_transcript_status_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_transcript_status_check
  check(transcript_status in('pending','receiving','finalizing','finalized','failed'));
alter table public.together_voice_call_sessions
  drop constraint if exists together_voice_call_sessions_voice_usage_check;
alter table public.together_voice_call_sessions
  add constraint together_voice_call_sessions_voice_usage_check check(
    connected_duration_ms>=0 and input_audio_duration_ms>=0 and output_audio_duration_ms>=0 and
    reconnect_count>=0 and (estimated_cost_usd is null or estimated_cost_usd>=0)
  ) not valid;
alter table public.together_voice_call_sessions validate constraint together_voice_call_sessions_voice_usage_check;

drop index if exists public.together_voice_call_one_active_idx;
create unique index together_voice_call_one_active_idx on public.together_voice_call_sessions(user_id,continuity_id)
  where status in('creating','ringing','connecting','active','reconnecting','ending');

alter table public.together_conversation_events drop constraint if exists together_conversation_events_event_type_check;
alter table public.together_conversation_events add constraint together_conversation_events_event_type_check
  check(event_type in('plan_proposed','plan_created','plan_rescheduled','plan_cancelled','plan_completed','plan_joined','plan_missed','plan_repaired','plan_late','date_unlocked','moment_created','story_updated','voice_call'));
alter table public.together_conversation_events drop constraint if exists together_conversation_events_entity_type_check;
alter table public.together_conversation_events add constraint together_conversation_events_entity_type_check
  check(entity_type in('shared_plan','date_session','moment','story','conversation_action','voice_call_session'));
create unique index if not exists together_conversation_voice_call_event_idx
  on public.together_conversation_events(entity_id,event_type) where entity_type='voice_call_session';

create table if not exists public.together_voice_call_transcript_events(
  id bigint generated always as identity primary key,
  call_session_id uuid not null references public.together_voice_call_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null check(sequence>0),
  speaker text not null check(speaker in('user','character')),
  content text not null check(length(btrim(content)) between 1 and 4000),
  occurred_at timestamptz not null,
  provider_event_id text,
  final boolean not null default true,
  canonical_message_id uuid references public.together_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists together_voice_transcript_provider_event_idx
  on public.together_voice_call_transcript_events(call_session_id,provider_event_id)
  where provider_event_id is not null;
create unique index if not exists together_voice_transcript_sequence_idx
  on public.together_voice_call_transcript_events(call_session_id,sequence,speaker);
create index if not exists together_voice_transcript_order_idx
  on public.together_voice_call_transcript_events(call_session_id,occurred_at,sequence);
create unique index if not exists together_voice_call_canonical_message_idx
  on public.together_messages((provider_metadata->>'callSessionId'),(provider_metadata->>'voiceSequence'))
  where provider_metadata->>'source'='voice_call';

create or replace function public.kivelle_validate_voice_transcript_event() returns trigger
language plpgsql set search_path=public as $$
declare call_user uuid;
begin
  select user_id into call_user from public.together_voice_call_sessions where id=new.call_session_id;
  if call_user is null or call_user<>new.user_id then raise exception 'voice transcript event must belong to its call user'; end if;
  return new;
end;
$$;
drop trigger if exists together_voice_transcript_validate on public.together_voice_call_transcript_events;
create trigger together_voice_transcript_validate before insert or update of call_session_id,user_id
  on public.together_voice_call_transcript_events for each row execute function public.kivelle_validate_voice_transcript_event();
alter table public.together_voice_call_transcript_events enable row level security;
drop policy if exists together_voice_call_transcript_own_read on public.together_voice_call_transcript_events;
create policy together_voice_call_transcript_own_read on public.together_voice_call_transcript_events
  for select to authenticated using(user_id=auth.uid());
grant select on public.together_voice_call_transcript_events to authenticated;

create table if not exists public.together_voice_usage_events(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid references public.together_continuities(id) on delete set null,
  character_instance_id uuid references public.together_character_instances(id) on delete set null,
  conversation_id uuid references public.together_conversations(id) on delete set null,
  media_id uuid references public.together_generated_media(id) on delete set null,
  call_session_id uuid references public.together_voice_call_sessions(id) on delete set null,
  usage_kind text not null check(usage_kind in('voice_note','voice_call')),
  provider text not null,
  model text not null,
  plan_tier text not null,
  status text not null check(status in('success','failure')),
  character_count integer not null default 0,
  connected_duration_ms bigint not null default 0,
  input_audio_duration_ms bigint not null default 0,
  output_audio_duration_ms bigint not null default 0,
  latency_ms integer,
  reconnect_count integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check(character_count>=0 and connected_duration_ms>=0 and input_audio_duration_ms>=0 and output_audio_duration_ms>=0 and reconnect_count>=0 and estimated_cost_usd>=0)
);
create unique index if not exists together_voice_usage_media_success_idx
  on public.together_voice_usage_events(media_id) where media_id is not null and status='success';
create unique index if not exists together_voice_usage_call_success_idx
  on public.together_voice_usage_events(call_session_id) where call_session_id is not null and status='success';
create index if not exists together_voice_usage_period_idx
  on public.together_voice_usage_events(user_id,usage_kind,occurred_at) where status='success';
alter table public.together_voice_usage_events enable row level security;
drop policy if exists together_voice_usage_own_read on public.together_voice_usage_events;
create policy together_voice_usage_own_read on public.together_voice_usage_events
  for select to authenticated using(user_id=auth.uid());
grant select on public.together_voice_usage_events to authenticated;

create or replace function public.kivelle_voice_minutes_used(p_user_id uuid,p_period_start timestamptz,p_period_end timestamptz)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(connected_duration_ms),0)::numeric/60000
  from public.together_voice_usage_events
  where user_id=p_user_id and usage_kind='voice_call' and status='success'
    and occurred_at>=p_period_start and occurred_at<p_period_end
$$;
revoke all on function public.kivelle_voice_minutes_used(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_voice_minutes_used(uuid,timestamptz,timestamptz) to service_role;

-- Seed provider-specific identities once, while preserving every authored or
-- future custom xAI voice mapping. Runtime fallback uses the same stable key.
update public.together_character_voice_profiles
set provider_mappings=jsonb_set(coalesce(provider_mappings,'{}'::jsonb),'{xai}',to_jsonb((array['carina','luna','iris','celeste','aurora','liora','eve','ara'])[1+((hashtext(voice_key)::bigint&2147483647)%8)]),true),
    updated_at=now()
where not coalesce(provider_mappings,'{}'::jsonb) ? 'xai';

comment on table public.together_voice_call_transcript_events is 'Append-only finalized provider transcript turns used for idempotent canonical Kivelle call writeback. Raw audio is not stored.';
comment on table public.together_voice_usage_events is 'Server-owned normalized voice economics. Contains numeric telemetry and identifiers, never prompts, transcript text, or raw audio.';

commit;
