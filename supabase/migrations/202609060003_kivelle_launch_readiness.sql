-- Launch-readiness state is additive so currently deployed clients continue to
-- receive the conservative projection until they record the new choices.

alter table public.together_profiles
  add column if not exists private_text_preference text,
  add column if not exists private_text_preference_version text,
  add column if not exists private_text_preference_recorded_at timestamptz,
  add column if not exists ai_data_consent_decision text,
  add column if not exists ai_data_consent_version text,
  add column if not exists ai_data_consent_recorded_at timestamptz;

-- A JSON default from an older release is not evidence that the user chose it.
-- New rows begin safe and the transactional choice RPC records any later opt-in.
alter table public.together_profiles
  alter column content_preferences set default '{"contentMode":"standard","romanceEnabled":true,"matureContentEnabled":false,"explicitContentEnabled":false,"suggestiveMediaEnabled":false,"nudityMediaEnabled":false,"explicitMediaEnabled":false}'::jsonb;

alter table public.together_profiles
  drop constraint if exists together_profiles_private_text_preference_check;
alter table public.together_profiles
  add constraint together_profiles_private_text_preference_check
  check (private_text_preference is null or private_text_preference in ('standard','mature','explicit'));
alter table public.together_profiles
  drop constraint if exists together_profiles_ai_data_consent_decision_check;
alter table public.together_profiles
  add constraint together_profiles_ai_data_consent_decision_check
  check (ai_data_consent_decision is null or ai_data_consent_decision in ('accepted','declined','withdrawn'));

create table if not exists public.together_ai_data_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  disclosure_version text not null,
  decision text not null check (decision in ('accepted','declined','withdrawn')),
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, purpose)
);

create table if not exists public.together_ai_data_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null,
  disclosure_version text not null,
  decision text not null check (decision in ('accepted','declined','withdrawn')),
  source text not null default 'account' check (source in ('onboarding','privacy','account','migration')),
  created_at timestamptz not null default now()
);
create index if not exists together_ai_data_consent_events_user_idx
  on public.together_ai_data_consent_events(user_id, purpose, created_at desc);

alter table public.together_ai_data_consents enable row level security;
alter table public.together_ai_data_consent_events enable row level security;
drop policy if exists together_ai_data_consents_own_read on public.together_ai_data_consents;
create policy together_ai_data_consents_own_read on public.together_ai_data_consents
  for select using (auth.uid() = user_id);
drop policy if exists together_ai_data_consent_events_own_read on public.together_ai_data_consent_events;
create policy together_ai_data_consent_events_own_read on public.together_ai_data_consent_events
  for select using (auth.uid() = user_id);
revoke all on public.together_ai_data_consents, public.together_ai_data_consent_events from anon, authenticated;
grant select on public.together_ai_data_consents, public.together_ai_data_consent_events to authenticated;
grant all on public.together_ai_data_consents, public.together_ai_data_consent_events to service_role;

create or replace function public.kivelle_record_launch_privacy_choices(
  p_user_id uuid,
  p_ai_decision text,
  p_private_text_preference text,
  p_disclosure_version text,
  p_source text
) returns void language plpgsql security definer set search_path = public as $$
declare profile_is_adult boolean;
begin
  if p_ai_decision is null or p_ai_decision not in ('accepted','declined','withdrawn') then raise exception 'INVALID_AI_CONSENT_DECISION'; end if;
  if p_private_text_preference is null or p_private_text_preference not in ('standard','mature','explicit') then raise exception 'INVALID_PRIVATE_TEXT_PREFERENCE'; end if;
  if p_disclosure_version is null or length(trim(p_disclosure_version)) < 3 then raise exception 'INVALID_DISCLOSURE_VERSION'; end if;
  if p_source is null or p_source not in ('onboarding','privacy','account') then raise exception 'INVALID_CONSENT_SOURCE'; end if;
  select age_verified_at is not null and adult_eligible_at is not null
    into profile_is_adult from public.together_profiles where user_id = p_user_id for update;
  if not coalesce(profile_is_adult, false) then raise exception 'ADULT_ELIGIBILITY_REQUIRED'; end if;

  insert into public.together_ai_data_consents(user_id,purpose,disclosure_version,decision,decided_at,updated_at)
  values(p_user_id,'core_ai_processing_v1',p_disclosure_version,p_ai_decision,now(),now())
  on conflict(user_id,purpose) do update set
    disclosure_version=excluded.disclosure_version,
    decision=excluded.decision,
    decided_at=excluded.decided_at,
    updated_at=excluded.updated_at;
  insert into public.together_ai_data_consent_events(user_id,purpose,disclosure_version,decision,source)
  values(p_user_id,'core_ai_processing_v1',p_disclosure_version,p_ai_decision,p_source);

  update public.together_profiles set
    private_text_preference=p_private_text_preference,
    private_text_preference_version='private-text-choice-v1',
    private_text_preference_recorded_at=now(),
    ai_data_consent_decision=p_ai_decision,
    ai_data_consent_version=p_disclosure_version,
    ai_data_consent_recorded_at=now(),
    content_preferences=coalesce(content_preferences,'{}'::jsonb) || jsonb_build_object(
      'contentMode',p_private_text_preference,
      'explicitContentEnabled',p_private_text_preference='explicit',
      'matureContentEnabled',p_private_text_preference in ('mature','explicit')
    ),
    updated_at=now()
  where user_id=p_user_id;
end;
$$;
revoke all on function public.kivelle_record_launch_privacy_choices(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.kivelle_record_launch_privacy_choices(uuid,text,text,text,text) to service_role;

create table if not exists public.together_account_deletion_markers (
  user_id uuid primary key,
  user_fingerprint text not null,
  auth_user_deleted boolean not null default false,
  billing_provider text,
  external_renewal_may_continue boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.together_account_deletion_markers
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;
create index if not exists together_account_deletion_marker_customer_idx
  on public.together_account_deletion_markers(billing_provider,provider_customer_id)
  where provider_customer_id is not null;

create table if not exists public.together_account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'queued' check (status in ('queued','processing','retry','complete','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  apple_revocation_status text not null default 'not_applicable' check (apple_revocation_status in ('not_applicable','pending','complete','retry','unavailable')),
  failure_code text,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.together_account_deletion_jobs
  add column if not exists storage_job_ids uuid[] not null default '{}',
  add column if not exists auth_user_owned boolean not null default false,
  add column if not exists billing_cancellation_required boolean not null default false,
  add column if not exists billing_canceled boolean not null default false;
create index if not exists together_account_deletion_jobs_claim_idx
  on public.together_account_deletion_jobs(status, next_attempt_at)
  where status in ('queued','retry');
alter table public.together_account_deletion_markers enable row level security;
alter table public.together_account_deletion_jobs enable row level security;
revoke all on public.together_account_deletion_markers, public.together_account_deletion_jobs from anon, authenticated;
grant all on public.together_account_deletion_markers, public.together_account_deletion_jobs to service_role;

-- Storage cleanup must survive deletion of an app-owned Supabase Auth row.
alter table public.together_storage_cleanup_jobs
  alter column user_id drop not null;
alter table public.together_storage_cleanup_jobs
  drop constraint if exists together_storage_cleanup_jobs_user_id_fkey;
alter table public.together_storage_cleanup_jobs
  add constraint together_storage_cleanup_jobs_user_id_fkey
  foreign key(user_id) references auth.users(id) on delete set null;

-- Shared-auth installations cannot safely delete auth.users indiscriminately.
-- This service-only function removes tables owned by Kivelle while retaining
-- the minimal deletion marker and durable cleanup jobs.
create or replace function public.kivelle_delete_application_user_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target record; pass integer; deleted_rows bigint; remaining_rows bigint; remaining_total bigint := 0;
begin
  -- Child tables are normally cascade-linked, but older installations have a
  -- few restrictive references. Retry a bounded number of dependency passes
  -- rather than disabling constraints or deleting another application's rows.
  for pass in 1..8 loop
    deleted_rows := 0;
    for target in
      select distinct c.table_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name = 'user_id'
        and c.table_name like 'together\_%' escape '\'
        and c.table_name not in (
          'together_account_deletion_markers','together_account_deletion_jobs',
          'together_account_deletion_receipts','together_storage_cleanup_jobs'
        )
      order by c.table_name
    loop
      begin
        execute format('delete from public.%I where user_id = $1', target.table_name) using p_user_id;
        get diagnostics remaining_rows = row_count;
        deleted_rows := deleted_rows + remaining_rows;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
    exit when deleted_rows = 0;
  end loop;

  -- Do not report a shared-auth deletion as complete when an unexpected
  -- restrictive reference left Kivelle-owned rows behind. Raising here rolls
  -- back this RPC and leaves the durable deletion job available for retry.
  for target in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and c.table_name like 'together\_%' escape '\'
      and c.table_name not in (
        'together_account_deletion_markers','together_account_deletion_jobs',
        'together_account_deletion_receipts','together_storage_cleanup_jobs'
      )
  loop
    execute format('select count(*) from public.%I where user_id = $1', target.table_name)
      into remaining_rows using p_user_id;
    remaining_total := remaining_total + remaining_rows;
  end loop;
  if remaining_total > 0 then
    raise exception 'KIVELLE_APPLICATION_DATA_REMAINS';
  end if;

  -- Private, unpublished creator records cannot be useful to another account.
  delete from public.together_character_templates
    where creator_id = p_user_id and visibility = 'private';
  update public.together_character_templates
    set creator_id = null,
        lifecycle_status = case when visibility = 'public' then lifecycle_status else 'archived' end,
        updated_at = now()
    where creator_id = p_user_id;
end;
$$;
revoke all on function public.kivelle_delete_application_user_data(uuid) from public, anon, authenticated;
grant execute on function public.kivelle_delete_application_user_data(uuid) to service_role;

alter table public.together_push_tokens
  add column if not exists installation_id text,
  add column if not exists deactivated_at timestamptz;
create index if not exists together_push_tokens_installation_idx
  on public.together_push_tokens(installation_id)
  where installation_id is not null;

alter table public.together_push_deliveries
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists opened_at timestamptz;
alter table public.together_push_deliveries
  drop constraint if exists together_push_deliveries_status_check;
alter table public.together_push_deliveries
  add constraint together_push_deliveries_status_check
  check (status in ('queued','retry','accepted','delivered','failed','expired'));
create index if not exists together_push_delivery_retry_idx
  on public.together_push_deliveries(status, next_attempt_at)
  where status in ('queued','retry');

create or replace function public.kivelle_claim_push_deliveries(
  p_worker_id text,
  p_limit integer default 25
) returns table(id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) < 8 then raise exception 'INVALID_WORKER_ID'; end if;
  return query
    with claimed as (
      select delivery.id
      from public.together_push_deliveries delivery
      where delivery.status in ('queued','retry')
        and coalesce(delivery.next_attempt_at, delivery.created_at) <= now()
        and (delivery.expires_at is null or delivery.expires_at > now())
        and (delivery.lease_expires_at is null or delivery.lease_expires_at < now())
      order by coalesce(delivery.next_attempt_at, delivery.created_at), delivery.created_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit,25),100))
    )
    update public.together_push_deliveries delivery
      set lease_owner=p_worker_id,
          lease_expires_at=now()+interval '90 seconds',
          attempt_count=delivery.attempt_count+1,
          updated_at=now()
      from claimed
      where delivery.id=claimed.id
      returning delivery.id;
end;
$$;
revoke all on function public.kivelle_claim_push_deliveries(text,integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_push_deliveries(text,integer) to service_role;

alter table public.together_safety_reports
  add column if not exists severity text not null default 'normal',
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_code text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.together_safety_reports
  drop constraint if exists together_safety_reports_severity_check;
alter table public.together_safety_reports
  add constraint together_safety_reports_severity_check
  check (severity in ('normal','high','urgent'));
create index if not exists together_safety_reports_queue_idx
  on public.together_safety_reports(status, severity, created_at);

create table if not exists public.together_safety_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.together_safety_reports(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('reporter','reviewer','admin','system')),
  event_type text not null check (event_type in ('created','assigned','status','note','resolved','reopened')),
  from_status text,
  to_status text,
  note_safe text check (note_safe is null or length(note_safe) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists together_safety_report_events_report_idx
  on public.together_safety_report_events(report_id, created_at);
alter table public.together_safety_report_events enable row level security;
revoke all on public.together_safety_report_events from anon, authenticated;
grant all on public.together_safety_report_events to service_role;

insert into public.together_ops_alert_rules(slug,name,metric,operator,threshold,window_minutes,severity,cooldown_minutes,channels,metadata)
values
  ('stuck-account-deletions','Account deletion jobs are stuck','stuck_account_deletions_30m','gte',1,30,'critical',60,array['dashboard'],jsonb_build_object('description','One or more account deletion jobs exceeded the retry window.')),
  ('stuck-media-jobs','Media jobs are stuck','stuck_media_jobs_30m','gte',3,30,'warning',60,array['dashboard'],jsonb_build_object('description','Media jobs remained queued or generating beyond their expected window.')),
  ('billing-sync-failures','Billing synchronization failures increased','billing_sync_failures_30m','gte',3,30,'critical',60,array['dashboard'],jsonb_build_object('description','Signed billing reconciliation is failing.')),
  ('provider-credential-failures','Provider credential failures detected','provider_credential_failures_15m','gte',1,15,'critical',60,array['dashboard'],jsonb_build_object('description','A provider rejected Kivelle credentials; customer device tokens must remain active.')),
  ('abnormal-provider-spend','Provider spend exceeded the configured monitor','provider_spend_usd_60m','gte',100,60,'critical',60,array['dashboard'],jsonb_build_object('description','Provider spend requires operator review. Configure the threshold for the production budget.'))
on conflict (slug) do update set
  name=excluded.name,
  metric=excluded.metric,
  operator=excluded.operator,
  severity=excluded.severity,
  cooldown_minutes=excluded.cooldown_minutes,
  channels=excluded.channels,
  metadata=public.together_ops_alert_rules.metadata || excluded.metadata,
  updated_at=now();

comment on table public.together_ai_data_consents is 'Current, versioned consent for third-party AI processing; independent of age, content, and notification choices.';
comment on table public.together_account_deletion_markers is 'Minimal tombstone preventing shared Supabase Auth identities from silently recreating deleted Kivelle access.';
