begin;

-- Privacy is enforced at the data boundary so no application path can
-- accidentally record analytics after a user opts out.
create or replace function public.kivelle_analytics_insert_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.user_id is not null and exists (
    select 1
    from public.together_profiles p
    where p.user_id=new.user_id
      and coalesce((p.privacy_settings->>'analytics')::boolean,true)=false
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists together_analytics_privacy_guard on public.together_analytics_events;
create trigger together_analytics_privacy_guard
before insert on public.together_analytics_events
for each row execute function public.kivelle_analytics_insert_guard();

create or replace function public.kivelle_track_event(
  p_user_id uuid,
  p_event_name text,
  p_properties jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_user_id is null or length(btrim(p_event_name))=0 then return false; end if;
  if exists (
    select 1 from public.together_profiles p
    where p.user_id=p_user_id
      and coalesce((p.privacy_settings->>'analytics')::boolean,true)=false
  ) then return false; end if;
  insert into public.together_analytics_events(user_id,event_name,properties)
  values(p_user_id,left(btrim(p_event_name),120),coalesce(p_properties,'{}'::jsonb));
  return true;
end;
$$;
revoke all on function public.kivelle_track_event(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_track_event(uuid,text,jsonb) to service_role;

create table if not exists public.together_client_error_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  route text not null default 'unknown',
  surface text not null default 'client',
  error_name text not null default 'Error',
  message_safe text not null,
  stack_hash text,
  stack_safe text,
  platform text,
  app_version text,
  build_id text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint together_client_error_message_length check(length(message_safe) between 1 and 600),
  constraint together_client_error_stack_length check(stack_safe is null or length(stack_safe)<=4000)
);
create index if not exists together_client_error_recent_idx on public.together_client_error_events(created_at desc);
create index if not exists together_client_error_user_recent_idx on public.together_client_error_events(user_id,created_at desc);
create index if not exists together_client_error_hash_recent_idx on public.together_client_error_events(stack_hash,created_at desc) where stack_hash is not null;

create table if not exists public.together_support_tickets(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in('bug','billing','safety','account','feedback','other')),
  subject text not null,
  message text not null,
  status text not null default 'open' check(status in('open','in_progress','waiting','resolved','closed')),
  priority text not null default 'normal' check(priority in('low','normal','high','urgent')),
  correlation_id text,
  conversation_id uuid references public.together_conversations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint together_support_subject_length check(length(subject) between 3 and 160),
  constraint together_support_message_length check(length(message) between 10 and 5000)
);
create index if not exists together_support_status_recent_idx on public.together_support_tickets(status,created_at desc);
create index if not exists together_support_user_recent_idx on public.together_support_tickets(user_id,created_at desc);

create table if not exists public.together_push_deliveries(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token_id uuid references public.together_push_tokens(id) on delete set null,
  proactive_message_id uuid references public.together_proactive_messages(id) on delete set null,
  expo_ticket_id text,
  status text not null default 'queued' check(status in('queued','accepted','delivered','failed')),
  error_code text,
  error_detail_safe text,
  sent_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint together_push_error_length check(error_detail_safe is null or length(error_detail_safe)<=500)
);
create index if not exists together_push_delivery_receipt_idx on public.together_push_deliveries(expo_ticket_id) where expo_ticket_id is not null;
create index if not exists together_push_delivery_status_idx on public.together_push_deliveries(status,created_at desc);
create unique index if not exists together_push_delivery_message_token_idx
  on public.together_push_deliveries(proactive_message_id,push_token_id)
  where proactive_message_id is not null and push_token_id is not null;

alter table public.together_client_error_events enable row level security;
alter table public.together_support_tickets enable row level security;
alter table public.together_push_deliveries enable row level security;

drop policy if exists together_support_own_read on public.together_support_tickets;
create policy together_support_own_read on public.together_support_tickets
for select to authenticated using(user_id=auth.uid());

revoke all on table public.together_client_error_events from anon,authenticated;
revoke all on table public.together_support_tickets from anon,authenticated;
revoke all on table public.together_push_deliveries from anon,authenticated;
grant select on table public.together_support_tickets to authenticated;
grant all on table public.together_client_error_events,public.together_support_tickets,public.together_push_deliveries to service_role;

comment on table public.together_client_error_events is 'Sanitized client diagnostics only. Never store prompts, messages, credentials, or provider payloads.';
comment on table public.together_support_tickets is 'Private user support requests; full conversation content is never copied automatically.';
comment on table public.together_push_deliveries is 'Expo delivery tickets and receipts without notification body content.';

commit;
