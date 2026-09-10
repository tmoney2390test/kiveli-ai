create table public.together_video_price_observations (
  id bigint generated always as identity primary key,
  route_id text not null,
  settings_key text not null,
  list_price_usd numeric,
  payable_price_usd numeric,
  discount_rate numeric,
  source text not null check(source in ('monitor','request')),
  error_code text,
  observed_at timestamptz not null default now(),
  check (list_price_usd is null or list_price_usd >= 0),
  check (payable_price_usd is null or payable_price_usd >= 0)
);
create index on public.together_video_price_observations(route_id,settings_key,observed_at desc);
create table public.together_video_price_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  checked integer not null default 0,
  failed integer not null default 0
);
create table public.together_video_price_publications (
  id bigint generated always as identity primary key,
  credits_per_unit numeric not null check(credits_per_unit between 1 and 10000),
  minimum_credits integer not null check(minimum_credits between 1 and 10000),
  reason text not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now()
);
insert into public.together_video_price_publications(credits_per_unit,minimum_credits,reason) values(250,25,'Initial two-tier catalog; existing credit rate retained');

alter table public.together_video_price_observations enable row level security;
alter table public.together_video_price_runs enable row level security;
alter table public.together_video_price_publications enable row level security;
revoke all on public.together_video_price_observations,public.together_video_price_runs,public.together_video_price_publications from public,anon,authenticated;
grant select,insert on public.together_video_price_observations,public.together_video_price_publications to service_role;
grant select,insert,update on public.together_video_price_runs to service_role;
grant usage,select on sequence public.together_video_price_observations_id_seq,public.together_video_price_publications_id_seq to service_role;

create function public.kivelle_claim_video_price_monitor() returns uuid language plpgsql security invoker set search_path=public as $$
declare run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('video-price-monitor',0));
  if exists(select 1 from public.together_video_price_runs where completed_at is null and started_at>now()-interval '15 minutes') then return null; end if;
  insert into public.together_video_price_runs default values returning id into run_id;
  return run_id;
end $$;
revoke all on function public.kivelle_claim_video_price_monitor() from public,anon,authenticated;
grant execute on function public.kivelle_claim_video_price_monitor() to service_role;

create function public.kivelle_video_cost_summary() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (
 select j.route_id, count(*) as attempts,
 count(*) filter(where j.status='completed') as delivered,
 count(*) filter(where j.status='failed') as failures,
 count(*) filter(where m.metadata->>'creditRefunded'='true') as refunds,
 count(*) filter(where jsonb_array_length(coalesce(j.provider_metadata->'videoQualityAdvisoryReasonCodes','[]'::jsonb))>0) as advisories,
 sum(j.quoted_provider_cost_usd) as quoted_usd,
 sum(j.actual_provider_cost_usd) as recorded_actual_usd,
 count(j.actual_provider_cost_usd) as recorded_actual_count,
 percentile_cont(0.5) within group(order by extract(epoch from j.finalized_at-j.created_at)) filter(where j.finalized_at is not null) as median_seconds,
 percentile_cont(0.95) within group(order by extract(epoch from j.finalized_at-j.created_at)) filter(where j.finalized_at is not null) as p95_seconds
 from public.together_media_provider_jobs j left join public.together_generated_media m on m.id=j.generated_media_id
 where j.created_at>now()-interval '30 days' and j.route_id in ('seedance-1-5-pro-sfw','seedance-1-5-pro-spicy','minimax-h3-sfw','minimax-h3-spicy')
 group by j.route_id
 ) s;
$$;
revoke all on function public.kivelle_video_cost_summary() from public,anon,authenticated;
grant execute on function public.kivelle_video_cost_summary() to service_role;

select cron.schedule('kivelle-video-price-monitor','15 6 * * *',$$
 select net.http_post(
 url := (select decrypted_secret from vault.decrypted_secrets where name='together_project_url') || '/functions/v1/together-video-prices',
 headers := jsonb_build_object('Content-Type','application/json','x-together-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='together_media_dispatch_secret')),
 body := '{}'::jsonb, timeout_milliseconds := 10000);
$$);
