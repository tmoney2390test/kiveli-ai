-- Independent consent: do not change age or private-text choices.
create or replace function public.kivelle_record_ai_consent(p_user_id uuid, p_decision text, p_version text, p_source text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_decision not in ('accepted','declined','withdrawn') or p_version <> '2026-09-06'
    or p_source not in ('onboarding','privacy','account') then raise exception 'INVALID_CONSENT'; end if;
  perform 1 from public.together_profiles where user_id=p_user_id for update;
  if not found or exists(select 1 from public.together_account_deletion_markers where user_id=p_user_id) then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
  insert into public.together_ai_data_consents(user_id,purpose,disclosure_version,decision)
  values(p_user_id,'core_ai_processing_v1',p_version,p_decision)
  on conflict(user_id,purpose) do update set disclosure_version=excluded.disclosure_version,decision=excluded.decision,decided_at=now(),updated_at=now();
  insert into public.together_ai_data_consent_events(user_id,purpose,disclosure_version,decision,source)
  values(p_user_id,'core_ai_processing_v1',p_version,p_decision,p_source);
  update public.together_profiles set ai_data_consent_decision=p_decision,ai_data_consent_version=p_version,ai_data_consent_recorded_at=now() where user_id=p_user_id;
end $$;
revoke all on function public.kivelle_record_ai_consent(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kivelle_record_ai_consent(uuid,text,text,text) to service_role;

-- Encrypted Apple refresh tokens survive only until revocation. No Auth FK:
-- deletion must not erase the credential before a retry can revoke it.
create table public.together_apple_credentials (
  user_id uuid not null,
  client_id text not null,
  subject text not null,
  encrypted_token text not null,
  status text not null default 'active' check(status in ('active','pending','processing','revoked','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,client_id)
);
alter table public.together_apple_credentials enable row level security;
revoke all on public.together_apple_credentials from public,anon,authenticated;
grant all on public.together_apple_credentials to service_role;
create index together_apple_revocation_due_idx on public.together_apple_credentials(next_attempt_at) where status in ('pending','processing');

create or replace function public.kivelle_claim_apple_revocations(p_now timestamptz default now())
returns setof public.together_apple_credentials language sql security invoker set search_path=public as $$
  update public.together_apple_credentials c set status='processing',lease_id=gen_random_uuid(),lease_expires_at=p_now+interval '2 minutes',attempt_count=attempt_count+1,updated_at=p_now
  where (user_id,client_id) in (
    select user_id,client_id from public.together_apple_credentials
    where (status='pending' and next_attempt_at<=p_now) or (status='processing' and lease_expires_at<p_now)
    order by next_attempt_at limit 10 for update skip locked
  ) returning c.*;
$$;
revoke all on function public.kivelle_claim_apple_revocations(timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_claim_apple_revocations(timestamptz) to service_role;


-- Serializes provider snapshots across webhook deliveries and foreground restores.
create table public.together_billing_reconciliation_leases (
  user_id uuid primary key,
  lease_id uuid not null,
  expires_at timestamptz not null
);
alter table public.together_billing_reconciliation_leases enable row level security;
revoke all on public.together_billing_reconciliation_leases from public,anon,authenticated;
grant all on public.together_billing_reconciliation_leases to service_role;
create or replace function public.kivelle_claim_billing_reconciliation(p_user_id uuid,p_lease uuid)
returns boolean language sql security invoker set search_path=public as $$
  with claimed as (
    insert into together_billing_reconciliation_leases(user_id,lease_id,expires_at)
    values(p_user_id,p_lease,now()+interval '60 seconds')
    on conflict(user_id) do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at
    where together_billing_reconciliation_leases.expires_at < now()
    returning user_id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.kivelle_claim_billing_reconciliation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_claim_billing_reconciliation(uuid,uuid) to service_role;

create or replace function public.kivelle_store_apple_credential(p_user_id uuid,p_client_id text,p_subject text,p_encrypted_token text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if not exists(select 1 from auth.users where id=p_user_id) or exists(select 1 from together_account_deletion_markers where user_id=p_user_id) then raise exception 'ACCOUNT_UNAVAILABLE'; end if;
  insert into together_apple_credentials(user_id,client_id,subject,encrypted_token)
  values(p_user_id,p_client_id,p_subject,p_encrypted_token)
  on conflict(user_id,client_id) do update set subject=excluded.subject,encrypted_token=excluded.encrypted_token,status='active',attempt_count=0,failure_code=null,updated_at=now();
end $$;
revoke all on function public.kivelle_store_apple_credential(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kivelle_store_apple_credential(uuid,text,text,text) to service_role;

create or replace function public.kivelle_queue_apple_revocation_on_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  update together_apple_credentials set status='pending',next_attempt_at=now(),updated_at=now()
    where user_id=new.user_id and status='active';
  if found then update together_account_deletion_jobs set apple_revocation_status='pending' where user_id=new.user_id; end if;
  return new;
end $$;
revoke all on function public.kivelle_queue_apple_revocation_on_delete() from public,anon,authenticated;
create trigger kivelle_queue_apple_revocation_on_delete before insert on public.together_account_deletion_markers
for each row execute function public.kivelle_queue_apple_revocation_on_delete();


-- Preserve pending revocation credentials during shared-Auth application cleanup.
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
          'together_account_deletion_receipts','together_storage_cleanup_jobs','together_apple_credentials'
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
        'together_account_deletion_receipts','together_storage_cleanup_jobs','together_apple_credentials'
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

-- A delayed billing snapshot cannot recreate benefits after deletion admission.
create or replace function public.kivelle_deny_deleted_account_billing()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists(select 1 from together_account_deletion_markers where user_id=new.user_id) then
    raise exception 'ACCOUNT_DELETED';
  end if;
  return new;
end $$;
revoke all on function public.kivelle_deny_deleted_account_billing() from public,anon,authenticated;
create trigger kivelle_deny_deleted_billing before insert or update on public.together_billing_subscriptions for each row execute function public.kivelle_deny_deleted_account_billing();
create trigger kivelle_deny_deleted_credit_grant before insert on public.together_credit_ledger for each row execute function public.kivelle_deny_deleted_account_billing();
create trigger kivelle_deny_deleted_entitlement before insert or update on public.together_entitlements for each row execute function public.kivelle_deny_deleted_account_billing();
