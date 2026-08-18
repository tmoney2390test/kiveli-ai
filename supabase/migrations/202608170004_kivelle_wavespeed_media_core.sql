begin;

-- Stable, revisioned references. Generated requests snapshot these row IDs so
-- later content changes cannot rewrite historical generation context.
create table if not exists public.together_media_reference_assets(
  id uuid primary key default gen_random_uuid(),
  asset_role text not null check(asset_role in(
    'character_identity','character_training','location_canonical','location_alternate',
    'world_canonical','outfit_continuity','previous_media'
  )),
  character_version_id uuid references public.together_character_versions(id) on delete cascade,
  location_id uuid references public.together_locations(id) on delete cascade,
  world_id uuid references public.together_worlds(id) on delete cascade,
  source_key text not null,
  storage_bucket text not null default 'kivelle-reference-media',
  storage_path text not null,
  content_type text not null check(content_type in('image/jpeg','image/png','image/webp')),
  width integer,
  height integer,
  byte_size integer,
  sha256 text,
  revision integer not null default 1 check(revision>0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(num_nonnulls(character_version_id,location_id,world_id)=1),
  check(width is null or width>0),
  check(height is null or height>0),
  check(byte_size is null or byte_size>0)
);
create unique index if not exists together_media_reference_asset_revision_idx
  on public.together_media_reference_assets(asset_role,source_key,revision);
create index if not exists together_media_reference_character_idx
  on public.together_media_reference_assets(character_version_id,asset_role,revision desc) where active;
create index if not exists together_media_reference_location_idx
  on public.together_media_reference_assets(location_id,asset_role,revision desc) where active;
create index if not exists together_media_reference_world_idx
  on public.together_media_reference_assets(world_id,asset_role,revision desc) where active;
alter table public.together_media_reference_assets enable row level security;
revoke all on public.together_media_reference_assets from public,anon,authenticated;
grant select,insert,update,delete on public.together_media_reference_assets to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kivelle-reference-media','kivelle-reference-media',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.together_character_media_profiles(
  id uuid primary key default gen_random_uuid(),
  character_version_id uuid not null references public.together_character_versions(id) on delete cascade,
  provider text not null,
  model_family text not null,
  profile_kind text not null default 'character_lora' check(profile_kind in('character_lora')),
  provider_training_id text,
  provider_model_id text,
  model_storage_bucket text,
  model_storage_path text,
  trigger_word text,
  source_reference_asset_ids uuid[] not null default '{}',
  source_revision integer not null default 1 check(source_revision>0),
  status text not null check(status in('pending','preparing','training','ready','failed','archived')),
  training_params jsonb not null default '{}'::jsonb,
  compatibility jsonb not null default '{}'::jsonb,
  trained_at timestamptz,
  failure_code text,
  failure_reason_safe text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_version_id,provider,model_family,source_revision)
);
create index if not exists together_character_media_profile_ready_idx
  on public.together_character_media_profiles(character_version_id,source_revision desc) where status='ready';
alter table public.together_character_media_profiles enable row level security;
revoke all on public.together_character_media_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.together_character_media_profiles to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kivelle-model-assets','kivelle-model-assets',false,1073741824,array['application/octet-stream','application/zip','application/x-zip-compressed'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- One durable row per external submission. No request payload, provider key,
-- prompt, or signed URL is stored here.
create table if not exists public.together_media_provider_jobs(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  continuity_id uuid references public.together_continuities(id) on delete cascade,
  generated_media_id uuid references public.together_generated_media(id) on delete cascade,
  creator_asset_id uuid references public.together_creator_assets(id) on delete cascade,
  character_media_profile_id uuid references public.together_character_media_profiles(id) on delete cascade,
  job_type text not null check(job_type in('image','video','lora')),
  provider text not null,
  model text not null,
  route_id text not null,
  request_id text not null,
  provider_request_id text,
  status text not null check(status in('created','submitting','processing','completed','failed','cancelled','submission_unknown')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 10),
  submitted_at timestamptz,
  provider_completed_at timestamptz,
  finalized_at timestamptz,
  next_poll_at timestamptz,
  last_polled_at timestamptz,
  output_storage_path text,
  failure_code text,
  failure_reason_safe text,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(
    (job_type='lora' and character_media_profile_id is not null and generated_media_id is null and creator_asset_id is null)
    or (job_type in('image','video') and generated_media_id is not null and creator_asset_id is null and character_media_profile_id is null)
    or (job_type='image' and creator_asset_id is not null and generated_media_id is null and character_media_profile_id is null)
  ),
  unique(provider,request_id)
);
create unique index if not exists together_media_provider_request_idx
  on public.together_media_provider_jobs(provider,provider_request_id) where provider_request_id is not null;
create index if not exists together_media_provider_recovery_idx
  on public.together_media_provider_jobs(status,next_poll_at,created_at)
  where status in('processing','submitting');
alter table public.together_media_provider_jobs enable row level security;
revoke all on public.together_media_provider_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.together_media_provider_jobs to service_role;

create table if not exists public.together_media_provider_webhook_receipts(
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  webhook_id text not null,
  provider_request_id text,
  received_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(provider,webhook_id)
);
alter table public.together_media_provider_webhook_receipts enable row level security;
revoke all on public.together_media_provider_webhook_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.together_media_provider_webhook_receipts to service_role;

alter table public.together_generated_media drop constraint if exists together_generated_media_media_type_check;
alter table public.together_generated_media add constraint together_generated_media_media_type_check
  check(media_type in('image','voice_note','video'));
alter table public.together_generated_media
  add column if not exists parent_media_id uuid references public.together_generated_media(id) on delete set null;
create index if not exists together_generated_media_parent_idx on public.together_generated_media(parent_media_id) where parent_media_id is not null;

create or replace function public.kivelle_claim_media_jobs(p_limit integer default 5)
returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
begin
  return query
  with claimable as (
    select media.id from public.together_generated_media media
    where media.media_type in('image','video') and media.status='queued'
      and coalesce(media.next_attempt_at,'-infinity'::timestamptz)<=now()
    order by media.queue_priority desc,media.created_at
    for update skip locked
    limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media
  set status='generating',claimed_at=now(),attempt_count=media.attempt_count+1,updated_at=now()
  from claimable where media.id=claimable.id returning media.*;
end $$;
revoke all on function public.kivelle_claim_media_jobs(integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs(integer) to service_role;

create or replace function public.kivelle_claim_media_profile_training(p_limit integer default 2)
returns setof public.together_character_media_profiles
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimable as (
    select profile.id from public.together_character_media_profiles profile
    where profile.status='pending'
    order by profile.created_at
    for update skip locked
    limit least(greatest(p_limit,1),5)
  )
  update public.together_character_media_profiles profile
  set status='preparing',updated_at=now()
  from claimable where profile.id=claimable.id returning profile.*;
end $$;
revoke all on function public.kivelle_claim_media_profile_training(integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_profile_training(integer) to service_role;

create or replace function public.kivelle_claim_creator_media_jobs(p_limit integer default 3)
returns setof public.together_creator_assets
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimable as (
    select asset.id from public.together_creator_assets asset
    where asset.status='queued' and asset.asset_type='appearance_candidate'
    order by asset.created_at
    for update skip locked
    limit least(greatest(p_limit,1),6)
  )
  update public.together_creator_assets asset
  set status='generating',updated_at=now()
  from claimable where asset.id=claimable.id returning asset.*;
end $$;
revoke all on function public.kivelle_claim_creator_media_jobs(integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_creator_media_jobs(integer) to service_role;

create or replace function public.kivelle_queue_media_profile_cleanup()
returns trigger language plpgsql security definer set search_path=public as $$
declare archive_path text;
begin
  if old.model_storage_path is not null then
    insert into public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count)
    select template.creator_id,coalesce(old.model_storage_bucket,'kivelle-model-assets'),old.model_storage_path,'pending',0
    from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id
    where version.id=old.character_version_id and template.creator_id is not null
    on conflict do nothing;
  end if;
  archive_path:=old.metadata->>'trainingArchivePath';
  if archive_path is not null then
    insert into public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count)
    select template.creator_id,coalesce(old.metadata->>'trainingArchiveBucket','kivelle-model-assets'),archive_path,'pending',0
    from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id
    where version.id=old.character_version_id and template.creator_id is not null
    on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists together_media_profile_queue_storage_cleanup on public.together_character_media_profiles;
create trigger together_media_profile_queue_storage_cleanup before delete on public.together_character_media_profiles
for each row execute function public.kivelle_queue_media_profile_cleanup();

-- Recovery never requeues a confirmed asynchronous submission. It only makes
-- stale synchronous claims retryable; provider jobs are reconciled by ID.
create or replace function public.kivelle_recover_stale_media_jobs(p_stale_minutes integer default 12)
returns integer language plpgsql security definer set search_path=public as $$
declare recovered integer;
begin
  update public.together_generated_media media set
    status=case when media.attempt_count>=2 then 'failed' else 'queued' end,
    failure_code=case when media.attempt_count>=2 then 'provider_timeout' else media.failure_code end,
    failure_reason_safe=case when media.attempt_count>=2 then 'The media took too long. You can try again.' else media.failure_reason_safe end,
    claimed_at=null,next_attempt_at=case when media.attempt_count>=2 then null else now()+interval '1 minute' end,updated_at=now()
  where media.status='generating'
    and media.claimed_at<now()-make_interval(mins=>least(greatest(p_stale_minutes,5),60))
    and not exists(
      select 1 from public.together_media_provider_jobs job
      where job.generated_media_id=media.id and job.status in('processing','completed')
    );
  get diagnostics recovered=row_count;
  return recovered;
end $$;

comment on table public.together_media_provider_jobs is 'Durable provider-neutral async generation ledger. Provider payloads, prompts, credentials, and signed URLs are intentionally excluded.';
comment on table public.together_media_reference_assets is 'Revisioned canonical visual references for characters, locations, and worlds.';

commit;
