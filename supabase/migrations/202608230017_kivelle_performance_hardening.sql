create extension if not exists pg_trgm with schema extensions;

do $$
declare trgm_schema text;
begin
  select namespace.nspname into trgm_schema
  from pg_catalog.pg_opclass operator_class
  join pg_catalog.pg_namespace namespace on namespace.oid=operator_class.opcnamespace
  join pg_catalog.pg_am access_method on access_method.oid=operator_class.opcmethod
  where operator_class.opcname='gin_trgm_ops' and access_method.amname='gin'
  limit 1;
  if trgm_schema is null then
    raise exception 'pg_trgm gin operator class is unavailable';
  end if;
  execute format(
    'create index if not exists together_messages_content_trgm_idx on public.together_messages using gin (content %I.gin_trgm_ops)',
    trgm_schema
  );
end $$;
create index if not exists together_schedules_version_day_time_idx
  on public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute);
create index if not exists together_generated_media_conversation_updated_idx
  on public.together_generated_media(conversation_id,updated_at desc)
  where conversation_id is not null;
create index if not exists together_media_offers_conversation_updated_idx
  on public.together_media_offers(conversation_id,updated_at desc)
  where conversation_id is not null;
create index if not exists together_conversation_events_conversation_created_idx
  on public.together_conversation_events(conversation_id,created_at desc);
create index if not exists together_conversation_actions_conversation_updated_idx
  on public.together_conversation_actions(conversation_id,updated_at desc);

create table if not exists public.together_client_performance_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null,
  operation text not null,
  duration_ms integer not null check(duration_ms between 0 and 600000),
  success boolean not null,
  status_code integer check(status_code is null or status_code between 100 and 599),
  platform text,
  app_version text,
  build_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint together_client_performance_surface_length check(length(surface) between 1 and 100),
  constraint together_client_performance_operation_length check(length(operation) between 1 and 160)
);
create index if not exists together_client_performance_recent_idx
  on public.together_client_performance_events(created_at desc);
create index if not exists together_client_performance_surface_idx
  on public.together_client_performance_events(surface,operation,created_at desc);
create index if not exists together_client_performance_user_idx
  on public.together_client_performance_events(user_id,created_at desc);
alter table public.together_client_performance_events enable row level security;
revoke all on table public.together_client_performance_events from public,anon,authenticated;
grant select,insert,delete on table public.together_client_performance_events to service_role;

create or replace function public.kivelle_ops_runtime_rollup(p_since timestamptz)
returns jsonb
language sql security definer set search_path=public as $$
  with
  ai_base as (
    select provider,model,operation,success,latency_ms,
      coalesce(provider_cost_usd,estimated_cost_usd,0) as cost
    from public.together_ai_usage_events where created_at>=p_since
  ),
  media_base as (
    select provider,model,source,success,generation_ms,
      coalesce(actual_provider_cost_usd,estimated_provider_cost_usd,0) as cost
    from public.together_media_usage_events where created_at>=p_since
  ),
  providers as (
    select provider,model,'ai'::text as modality,count(*)::bigint as requests,
      count(*) filter(where not success)::bigint as failures,
      coalesce(percentile_cont(.95) within group(order by latency_ms) filter(where latency_ms>0),0)::numeric as p95,
      coalesce(sum(cost),0)::numeric as cost
    from ai_base group by provider,model
    union all
    select provider,model,'media'::text,count(*)::bigint,
      count(*) filter(where not success)::bigint,
      coalesce(percentile_cont(.95) within group(order by generation_ms) filter(where generation_ms>0),0)::numeric,
      coalesce(sum(cost),0)::numeric
    from media_base group by provider,model
  ),
  surfaces as (
    select surface,operation,count(*)::bigint as requests,
      count(*) filter(where not success)::bigint as failures,
      coalesce(percentile_cont(.50) within group(order by duration_ms),0)::numeric as p50,
      coalesce(percentile_cont(.95) within group(order by duration_ms),0)::numeric as p95
    from public.together_client_performance_events where created_at>=p_since
    group by surface,operation
  ),
  versions as (
    select platform,app_version,build_id,count(distinct user_id)::bigint as users,max(last_seen_at) as last_seen_at
    from public.together_client_sessions where last_seen_at>=p_since
    group by platform,app_version,build_id
  )
  select jsonb_build_object(
    'ai',jsonb_build_object(
      'requests',(select count(*) from ai_base),
      'successes',(select count(*) from ai_base where success),
      'p95LatencyMs',coalesce((select percentile_cont(.95) within group(order by latency_ms) from ai_base where latency_ms>0),0),
      'cost',coalesce((select sum(cost) from ai_base),0)
    ),
    'providerHealth',coalesce((select jsonb_agg(jsonb_build_object(
      'provider',coalesce(provider,'unknown'),'model',coalesce(model,'unknown'),'modality',modality,
      'requests',requests,'failures',failures,
      'successRate',case when requests=0 then 1 else (requests-failures)::numeric/requests end,
      'p95LatencyMs',p95,'estimatedCost',cost
    ) order by modality,provider,model) from providers),'[]'::jsonb),
    'clientSurfaces',coalesce((select jsonb_agg(jsonb_build_object(
      'surface',surface,'operation',operation,'requests',requests,'failures',failures,
      'successRate',case when requests=0 then 1 else (requests-failures)::numeric/requests end,
      'p50DurationMs',p50,'p95DurationMs',p95
    ) order by p95 desc) from surfaces),'[]'::jsonb),
    'clientVersions',coalesce((select jsonb_agg(jsonb_build_object(
      'platform',platform,'appVersion',app_version,'buildId',build_id,'users',users,'lastSeenAt',last_seen_at
    ) order by last_seen_at desc) from versions),'[]'::jsonb)
  );
$$;

create or replace function public.kivelle_ops_queue_rollup(p_since timestamptz)
returns jsonb
language sql security definer set search_path=public as $$
  with queue_definitions(key,label,stale_seconds) as (values
    ('dialogue'::text,'Chat generation'::text,180::numeric),
    ('media','Photo & video generation',600),
    ('provider_media','Provider handoff',600),
    ('calls','Realtime calls',180),
    ('push','Push delivery',900),
    ('proactive','Proactive messages',1800)
  ), queue_rows as (
    select 'dialogue'::text key,state::text status,created_at,
      state in('planning','generating') active,state='failed' failed,null::text provider,null::text model
    from public.together_dialogue_turns where created_at>=p_since or state in('planning','generating')
    union all
    select 'media',status,created_at,status in('queued','generating'),status='failed',null,null
    from public.together_generated_media where created_at>=p_since or status in('queued','generating')
    union all
    select 'provider_media',status,created_at,status in('created','submitting','processing','submission_unknown'),status='failed',provider,model
    from public.together_media_provider_jobs where created_at>=p_since or status in('created','submitting','processing','submission_unknown')
    union all
    select 'calls',status,created_at,status in('creating','ringing','connecting','active','reconnecting','ending'),status='failed',provider,model
    from public.together_voice_call_sessions where created_at>=p_since or status in('creating','ringing','connecting','active','reconnecting','ending')
    union all
    select 'push',status,created_at,status in('queued','accepted'),status='failed',null,null
    from public.together_push_deliveries where created_at>=p_since or status in('queued','accepted')
    union all
    select 'proactive',status,eligible_at,status='queued',false,null,null
    from public.together_proactive_messages where created_at>=p_since or status='queued'
  ), status_counts as (
    select key,status,count(*)::bigint as count from queue_rows group by key,status
  ), queue_summary as (
    select definition.key,definition.label,definition.stale_seconds,
      count(queue_row.key) filter(where queue_row.active)::bigint active,
      count(queue_row.key) filter(where queue_row.failed and queue_row.created_at>=p_since)::bigint failed,
      min(queue_row.created_at) filter(where queue_row.active) oldest_at
    from queue_definitions definition
    left join queue_rows queue_row on queue_row.key=definition.key
    group by definition.key,definition.label,definition.stale_seconds
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',summary.key,'label',summary.label,'active',summary.active,
    'stale',case when summary.oldest_at is not null and extract(epoch from(now()-summary.oldest_at))>=summary.stale_seconds then summary.active else 0 end,
    'oldestAgeSeconds',coalesce(greatest(0,floor(extract(epoch from(now()-summary.oldest_at)))),0),
    'failed24h',summary.failed,
    'statuses',(select coalesce(jsonb_agg(jsonb_build_object('status',status,'count',count) order by status),'[]'::jsonb) from status_counts where key=summary.key),
    'oldest',(select jsonb_build_object('status',status,'provider',provider,'model',model) from queue_rows where key=summary.key and active order by created_at limit 1)
  ) order by summary.key),'[]'::jsonb) from queue_summary summary;
$$;

revoke all on function public.kivelle_ops_runtime_rollup(timestamptz) from public,anon,authenticated;
revoke all on function public.kivelle_ops_queue_rollup(timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_ops_runtime_rollup(timestamptz) to service_role;
grant execute on function public.kivelle_ops_queue_rollup(timestamptz) to service_role;
