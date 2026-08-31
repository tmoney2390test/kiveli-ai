-- Private account exports, durable deletion cleanup, and deletion receipts.
-- Cleanup jobs must survive auth.users deletion so the existing life dispatcher
-- can retry private object removal after the account row is gone.
alter table public.together_storage_cleanup_jobs
  drop constraint if exists together_storage_cleanup_jobs_user_id_fkey;
alter table public.together_storage_cleanup_jobs
  alter column user_id drop not null;
alter table public.together_storage_cleanup_jobs
  add constraint together_storage_cleanup_jobs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
alter table public.together_storage_cleanup_jobs
  drop constraint if exists together_storage_cleanup_jobs_status_check;
alter table public.together_storage_cleanup_jobs
  add constraint together_storage_cleanup_jobs_status_check
  check (status in ('held','pending','complete'));

create table if not exists public.together_account_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','expired')),
  storage_bucket text not null default 'together-user-media',
  storage_path text,
  file_name text not null,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  expires_at timestamptz not null,
  downloaded_at timestamptz,
  size_bytes bigint,
  record_count integer,
  failure_code text,
  updated_at timestamptz not null default now()
);
create index if not exists together_account_exports_user_idx
  on public.together_account_exports(user_id, requested_at desc);
create index if not exists together_account_exports_expiry_idx
  on public.together_account_exports(status, expires_at)
  where status = 'ready';
alter table public.together_account_exports enable row level security;
drop policy if exists "Users read their account exports" on public.together_account_exports;
create policy "Users read their account exports"
  on public.together_account_exports for select
  using (auth.uid() = user_id);

create table if not exists public.together_account_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  user_fingerprint text not null,
  billing_provider text,
  billing_canceled boolean not null default false,
  storage_object_count integer not null default 0,
  correlation_id text,
  completed_at timestamptz not null default now()
);
alter table public.together_account_deletion_receipts enable row level security;

revoke all on public.together_account_deletion_receipts from anon, authenticated;
grant select, insert, update, delete on public.together_account_exports to service_role;
grant select on public.together_account_exports to authenticated;
grant select, insert on public.together_account_deletion_receipts to service_role;
