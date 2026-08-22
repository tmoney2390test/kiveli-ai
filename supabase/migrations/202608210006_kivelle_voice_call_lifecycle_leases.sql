begin;

alter table public.together_voice_call_sessions
  add column if not exists lease_expires_at timestamptz;

update public.together_voice_call_sessions
set lease_expires_at = case
  when status = 'active' then updated_at + interval '2 minutes'
  when status = 'reconnecting' then updated_at + interval '90 seconds'
  when status in ('creating','ringing','connecting') then updated_at + interval '2 minutes'
  else null
end
where lease_expires_at is null
  and status in ('creating','ringing','connecting','active','reconnecting');

drop index if exists public.together_voice_call_one_active_idx;
create unique index together_voice_call_one_active_idx
  on public.together_voice_call_sessions(user_id,continuity_id)
  where status in('creating','ringing','connecting','active','reconnecting');

create index if not exists together_voice_call_lease_idx
  on public.together_voice_call_sessions(lease_expires_at)
  where status in('creating','ringing','connecting','active','reconnecting');

comment on column public.together_voice_call_sessions.lease_expires_at is
  'Server-authoritative call lease renewed by client heartbeat; expired rows may be safely failed before a new call.';

commit;
