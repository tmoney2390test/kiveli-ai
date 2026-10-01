begin;

-- Existing boolean values do not prove an informed, versioned opt-in.
alter table public.together_profiles
  alter column privacy_settings set default '{"personalization":true,"analytics":false}'::jsonb;

update public.together_profiles
set privacy_settings = jsonb_set(coalesce(privacy_settings,'{}'::jsonb) - 'analyticsConsent', '{analytics}', 'false'::jsonb),
    updated_at = now()
where privacy_settings->'analyticsConsent' is null
   or privacy_settings->'analyticsConsent'->>'decision' <> 'accepted'
   or privacy_settings->'analyticsConsent'->>'version' <> 'product-analytics-v1'
   or privacy_settings->'analyticsConsent'->>'recordedAt' is null;

create or replace function public.kivelle_analytics_insert_guard()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from public.together_profiles p
    where p.user_id=new.user_id
      and p.privacy_settings->>'analytics'='true'
      and p.privacy_settings->'analyticsConsent'->>'decision'='accepted'
      and p.privacy_settings->'analyticsConsent'->>'version'='product-analytics-v1'
      and p.privacy_settings->'analyticsConsent'->>'recordedAt' is not null
  ) then return null; end if;
  return new;
end;
$$;

drop trigger if exists together_analytics_privacy_guard on public.together_analytics_events;
create trigger together_analytics_privacy_guard
before insert on public.together_analytics_events
for each row execute function public.kivelle_analytics_insert_guard();

drop trigger if exists together_client_performance_privacy_guard on public.together_client_performance_events;
create trigger together_client_performance_privacy_guard
before insert on public.together_client_performance_events
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
declare inserted_count integer;
begin
  if p_user_id is null or length(btrim(p_event_name))=0 then return false; end if;
  if not exists (
    select 1 from public.together_profiles p
    where p.user_id=p_user_id
      and p.privacy_settings->>'analytics'='true'
      and p.privacy_settings->'analyticsConsent'->>'decision'='accepted'
      and p.privacy_settings->'analyticsConsent'->>'version'='product-analytics-v1'
      and p.privacy_settings->'analyticsConsent'->>'recordedAt' is not null
  ) then return false; end if;
  insert into public.together_analytics_events(user_id,event_name,properties)
  values(p_user_id,left(btrim(p_event_name),120),coalesce(p_properties,'{}'::jsonb));
  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;

-- Minimize events collected before an explicit choice was available.
delete from public.together_analytics_events e
where e.user_id is not null and not exists (
  select 1 from public.together_profiles p
  where p.user_id=e.user_id and p.privacy_settings->>'analytics'='true'
    and p.privacy_settings->'analyticsConsent'->>'decision'='accepted'
    and p.privacy_settings->'analyticsConsent'->>'version'='product-analytics-v1'
);
delete from public.together_client_performance_events e
where e.user_id is not null and not exists (
  select 1 from public.together_profiles p
  where p.user_id=e.user_id and p.privacy_settings->>'analytics'='true'
    and p.privacy_settings->'analyticsConsent'->>'decision'='accepted'
    and p.privacy_settings->'analyticsConsent'->>'version'='product-analytics-v1'
);

commit;
