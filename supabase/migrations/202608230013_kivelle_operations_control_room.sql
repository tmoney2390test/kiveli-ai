begin;

create table if not exists public.together_ops_incidents(
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  source text not null check(source in('client_error','alert','support','manual','provider')),
  severity text not null default 'warning' check(severity in('info','warning','critical')),
  status text not null default 'open' check(status in('open','acknowledged','monitoring','resolved')),
  title text not null,
  summary_safe text,
  correlation_id text,
  assignee_user_id uuid references auth.users(id) on delete set null,
  occurrence_count integer not null default 1 check(occurrence_count>0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint together_ops_incident_title_length check(length(title) between 3 and 180),
  constraint together_ops_incident_summary_length check(summary_safe is null or length(summary_safe)<=1000)
);
create index if not exists together_ops_incidents_status_recent_idx on public.together_ops_incidents(status,severity,last_seen_at desc);

alter table public.together_client_error_events add column if not exists incident_id uuid references public.together_ops_incidents(id) on delete set null;
create index if not exists together_client_error_incident_idx on public.together_client_error_events(incident_id,created_at desc) where incident_id is not null;

alter table public.together_support_tickets
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists incident_id uuid references public.together_ops_incidents(id) on delete set null;
create index if not exists together_support_assignee_idx on public.together_support_tickets(assigned_to,status,updated_at desc) where assigned_to is not null;

create table if not exists public.together_ops_ticket_events(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.together_support_tickets(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check(event_type in('created','status','priority','assignment','tag','note','response','linked_incident')),
  note_safe text,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint together_ops_ticket_note_length check(note_safe is null or length(note_safe)<=2000)
);
create index if not exists together_ops_ticket_events_ticket_idx on public.together_ops_ticket_events(ticket_id,created_at);

create table if not exists public.together_ops_alert_rules(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  metric text not null,
  operator text not null default 'gte' check(operator in('gt','gte','lt','lte','eq')),
  threshold numeric not null,
  window_minutes integer not null default 15 check(window_minutes between 1 and 10080),
  severity text not null default 'warning' check(severity in('info','warning','critical')),
  cooldown_minutes integer not null default 60 check(cooldown_minutes between 5 and 10080),
  channels text[] not null default '{dashboard}'::text[],
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint together_ops_alert_channels check(channels<@array['dashboard','webhook','email']::text[])
);

create table if not exists public.together_ops_alert_events(
  id uuid primary key default gen_random_uuid(),
  alert_rule_id uuid not null references public.together_ops_alert_rules(id) on delete cascade,
  incident_id uuid references public.together_ops_incidents(id) on delete set null,
  metric_value numeric not null,
  threshold numeric not null,
  status text not null default 'triggered' check(status in('triggered','delivered','partial','skipped','failed','resolved')),
  channels text[] not null default '{}'::text[],
  delivery_metadata jsonb not null default '{}'::jsonb,
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists together_ops_alert_events_recent_idx on public.together_ops_alert_events(triggered_at desc);
create index if not exists together_ops_alert_events_rule_idx on public.together_ops_alert_events(alert_rule_id,triggered_at desc);

create table if not exists public.together_ops_audit_log(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check(actor_role in('viewer','support','admin','system')),
  action text not null,
  target_type text,
  target_id text,
  request_id text,
  reason_safe text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint together_ops_audit_reason_length check(reason_safe is null or length(reason_safe)<=1000)
);
create index if not exists together_ops_audit_recent_idx on public.together_ops_audit_log(created_at desc);
create index if not exists together_ops_audit_actor_idx on public.together_ops_audit_log(actor_user_id,created_at desc) where actor_user_id is not null;

create or replace function public.kivelle_ops_audit_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'operations audit records are immutable';
end;
$$;
drop trigger if exists together_ops_audit_immutable on public.together_ops_audit_log;
create trigger together_ops_audit_immutable before update or delete on public.together_ops_audit_log
for each row execute function public.kivelle_ops_audit_immutable();

create table if not exists public.together_ops_release_records(
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production' check(environment in('development','preview','production')),
  git_commit text not null,
  deploy_id text,
  app_version text,
  web_url text,
  migration_version text,
  edge_versions jsonb not null default '{}'::jsonb,
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(environment,git_commit,deploy_id)
);
create index if not exists together_ops_release_recent_idx on public.together_ops_release_records(environment,released_at desc);

create table if not exists public.together_client_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  app_version text not null,
  build_id text not null default 'unknown',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,platform,app_version,build_id)
);
create index if not exists together_client_sessions_recent_idx on public.together_client_sessions(last_seen_at desc);
create index if not exists together_client_sessions_version_idx on public.together_client_sessions(app_version,platform,last_seen_at desc);

create or replace function public.kivelle_ops_upsert_incident(
  p_dedupe_key text,
  p_source text,
  p_severity text,
  p_title text,
  p_summary_safe text default null,
  p_correlation_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare incident_id uuid;
begin
  insert into public.together_ops_incidents(dedupe_key,source,severity,status,title,summary_safe,correlation_id,metadata)
  values(left(p_dedupe_key,240),p_source,p_severity,'open',left(p_title,180),left(p_summary_safe,1000),left(p_correlation_id,200),coalesce(p_metadata,'{}'::jsonb))
  on conflict(dedupe_key) do update set
    occurrence_count=together_ops_incidents.occurrence_count+1,
    last_seen_at=now(),
    severity=excluded.severity,
    title=excluded.title,
    summary_safe=coalesce(excluded.summary_safe,together_ops_incidents.summary_safe),
    correlation_id=coalesce(excluded.correlation_id,together_ops_incidents.correlation_id),
    status=case when together_ops_incidents.status='resolved' then 'open' else together_ops_incidents.status end,
    resolved_at=case when together_ops_incidents.status='resolved' then null else together_ops_incidents.resolved_at end,
    metadata=together_ops_incidents.metadata||excluded.metadata,
    updated_at=now()
  returning id into incident_id;
  return incident_id;
end;
$$;

create or replace function public.kivelle_ops_find_user(p_query text)
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,banned_until timestamptz,deleted_at timestamptz)
language sql security definer set search_path=auth,public as $$
  select id,email,created_at,last_sign_in_at,banned_until,deleted_at
  from auth.users
  where lower(email)=lower(btrim(p_query)) or id::text=btrim(p_query)
  order by created_at desc limit 1
$$;

create or replace function public.kivelle_ops_latest_migration()
returns text language sql security definer set search_path=public,supabase_migrations as $$
  select max(version)::text from supabase_migrations.schema_migrations
$$;

revoke all on function public.kivelle_ops_upsert_incident(text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kivelle_ops_find_user(text) from public,anon,authenticated;
revoke all on function public.kivelle_ops_latest_migration() from public,anon,authenticated;
grant execute on function public.kivelle_ops_upsert_incident(text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.kivelle_ops_find_user(text) to service_role;
grant execute on function public.kivelle_ops_latest_migration() to service_role;

insert into public.together_ops_alert_rules(slug,name,metric,operator,threshold,window_minutes,severity,cooldown_minutes,channels,metadata)
values
  ('media-oldest','Media queue is stalled','media_oldest_seconds','gte',600,15,'critical',30,array['dashboard'],jsonb_build_object('description','Oldest queued or generating media request age.')),
  ('media-failures','Media failures increased','media_failures_15m','gte',5,15,'warning',60,array['dashboard'],jsonb_build_object('description','Failed generated-media requests in the last 15 minutes.')),
  ('ai-failure-rate','AI failure rate increased','ai_failure_rate_15m','gte',10,15,'critical',30,array['dashboard'],jsonb_build_object('description','Failed AI operations as a percentage of recent requests.')),
  ('ai-latency','AI latency increased','ai_p95_latency_ms_15m','gte',15000,15,'warning',30,array['dashboard'],jsonb_build_object('description','Recent AI p95 latency in milliseconds.')),
  ('voice-failures','Voice calls are failing','voice_failures_30m','gte',3,30,'warning',60,array['dashboard'],jsonb_build_object('description','Failed voice calls in the last 30 minutes.')),
  ('push-failures','Push delivery failures increased','push_failures_30m','gte',10,30,'warning',120,array['dashboard'],jsonb_build_object('description','Failed push deliveries in the last 30 minutes.')),
  ('refund-volume','Refund volume increased','refunds_24h','gte',20,1440,'warning',240,array['dashboard'],jsonb_build_object('description','Credit refunds in the last 24 hours.')),
  ('auth-client-errors','Authentication errors increased','auth_client_errors_15m','gte',5,15,'critical',30,array['dashboard'],jsonb_build_object('description','Sanitized client errors reported from authentication routes.')),
  ('dialogue-oldest','Chat generation is stalled','dialogue_oldest_seconds','gte',180,10,'critical',20,array['dashboard'],jsonb_build_object('description','Oldest active dialogue turn age.')),
  ('proactive-oldest','Proactive delivery is stalled','proactive_oldest_seconds','gte',1800,60,'warning',120,array['dashboard'],jsonb_build_object('description','Oldest eligible proactive message age.'))
on conflict(slug) do nothing;

alter table public.together_ops_incidents enable row level security;
alter table public.together_ops_ticket_events enable row level security;
alter table public.together_ops_alert_rules enable row level security;
alter table public.together_ops_alert_events enable row level security;
alter table public.together_ops_audit_log enable row level security;
alter table public.together_ops_release_records enable row level security;
alter table public.together_client_sessions enable row level security;

revoke all on table public.together_ops_incidents,public.together_ops_ticket_events,public.together_ops_alert_rules,public.together_ops_alert_events,public.together_ops_audit_log,public.together_ops_release_records,public.together_client_sessions from anon,authenticated;
grant all on table public.together_ops_incidents,public.together_ops_ticket_events,public.together_ops_alert_rules,public.together_ops_alert_events,public.together_ops_audit_log,public.together_ops_release_records,public.together_client_sessions to service_role;

comment on table public.together_ops_incidents is 'Sanitized operational incidents grouped by a stable non-content fingerprint.';
comment on table public.together_ops_audit_log is 'Append-only audit trail for private operations access and mutations.';
comment on table public.together_client_sessions is 'Version heartbeat only; no device fingerprint, IP address, message, prompt, or content.';

commit;
