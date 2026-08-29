begin;

alter table public.together_voice_call_sessions
  add column if not exists first_user_response_at timestamptz,
  add column if not exists billing_started_at timestamptz;

create index if not exists together_voice_call_billing_started_idx
  on public.together_voice_call_sessions(user_id,billing_started_at desc)
  where billing_started_at is not null;

comment on column public.together_voice_call_sessions.first_user_response_at is
  'The first finalized user speech turn accepted into the canonical call transcript.';
comment on column public.together_voice_call_sessions.billing_started_at is
  'Server-authoritative start of per-minute billing; null until the user first responds.';

commit;
