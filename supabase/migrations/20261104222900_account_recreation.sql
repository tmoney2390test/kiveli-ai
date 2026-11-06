-- Minimal billing tombstones survive a deliberate fresh enrollment; deleted content does not.
create table if not exists public.kivelle_account_recreations (
  user_id uuid not null,
  deleted_at timestamptz not null,
  recreated_at timestamptz not null default now(),
  billing_provider text,
  provider_customer_id text,
  primary key(user_id,deleted_at)
);
create index if not exists kivelle_account_recreations_customer_idx on public.kivelle_account_recreations(billing_provider,provider_customer_id) where provider_customer_id is not null;
alter table public.kivelle_account_recreations enable row level security;
revoke all on public.kivelle_account_recreations from public,anon,authenticated;
grant all on public.kivelle_account_recreations to service_role;

-- Only the service endpoint can call this after verifying a fresh login token.
create or replace function public.kivelle_recreate_application_account(p_user_id uuid,p_authenticated_at timestamptz,p_token_issued_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare marker public.together_account_deletion_markers%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into marker from together_account_deletion_markers where user_id=p_user_id for update;
  if not found then return false; end if;
  if p_authenticated_at is null or p_token_issued_at is null or p_authenticated_at<=marker.created_at or p_token_issued_at<=marker.created_at
     or p_authenticated_at<now()-interval '10 minutes' or p_authenticated_at>now()+interval '1 minute' then
    raise exception 'FRESH_SIGN_IN_REQUIRED';
  end if;
  if not exists(select 1 from together_account_deletion_jobs where user_id=p_user_id and created_at<=now())
     or exists(select 1 from together_account_deletion_jobs where user_id=p_user_id and (status<>'complete' or apple_revocation_status in ('pending','retry'))) then
    raise exception 'DELETION_CLEANUP_PENDING';
  end if;
  -- Never revive a profile or permit a cleanup retry to delete the new profile.
  if exists(select 1 from together_profiles where user_id=p_user_id) then raise exception 'DELETION_CLEANUP_PENDING'; end if;
  insert into kivelle_account_recreations(user_id,deleted_at,billing_provider,provider_customer_id)
    values(p_user_id,marker.created_at,marker.billing_provider,marker.provider_customer_id);
  delete from together_account_deletion_markers where user_id=p_user_id;
  return true;
end $$;
revoke all on function public.kivelle_recreate_application_account(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_recreate_application_account(uuid,timestamptz,timestamptz) to service_role;
