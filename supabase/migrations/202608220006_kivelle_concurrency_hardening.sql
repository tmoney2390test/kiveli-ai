begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The Edge Functions have always called consume_rate_limit(), but its
-- implementation was not represented in the repository. Keep the counter in
-- a narrow server-only table so concurrent requests cannot all pass a
-- count-then-insert check.
create table if not exists public.kivelle_rate_limit_windows(
  subject text not null,
  action text not null,
  window_key bigint not null,
  request_count integer not null default 0 check(request_count>=0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(subject,action,window_key)
);
create index if not exists kivelle_rate_limit_windows_expiry_idx
  on public.kivelle_rate_limit_windows(expires_at);
alter table public.kivelle_rate_limit_windows enable row level security;
revoke all on public.kivelle_rate_limit_windows from public,anon,authenticated;
grant select,insert,update,delete on public.kivelle_rate_limit_windows to service_role;

create or replace function public.consume_rate_limit(
  p_subject text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  bounded_window integer:=least(greatest(p_window_seconds,1),2592000);
  bounded_limit integer:=least(greatest(p_limit,1),1000000);
  current_window bigint;
  next_count integer;
begin
  if nullif(trim(p_subject),'') is null or nullif(trim(p_action),'') is null then
    return false;
  end if;
  current_window:=floor(extract(epoch from clock_timestamp())/bounded_window)::bigint;
  insert into public.kivelle_rate_limit_windows(subject,action,window_key,request_count,expires_at)
  values(p_subject,p_action,current_window,1,to_timestamp((current_window+1)*bounded_window))
  on conflict(subject,action,window_key) do update set
    request_count=public.kivelle_rate_limit_windows.request_count+1,
    updated_at=clock_timestamp()
  returning request_count into next_count;
  return next_count<=bounded_limit;
end $$;
revoke all on function public.consume_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;

-- Provider calls are still request/response, not a second dialogue queue. A
-- short server-side semaphore prevents a traffic burst from opening unlimited
-- upstream connections and lets the existing retry/fallback behavior engage.
create table if not exists public.kivelle_provider_concurrency_leases(
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  operation text not null,
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists kivelle_provider_concurrency_lease_idx
  on public.kivelle_provider_concurrency_leases(provider,expires_at);
alter table public.kivelle_provider_concurrency_leases enable row level security;
revoke all on public.kivelle_provider_concurrency_leases from public,anon,authenticated;
grant select,insert,delete on public.kivelle_provider_concurrency_leases to service_role;

create or replace function public.kivelle_acquire_provider_slot(
  p_provider text,
  p_operation text,
  p_user_id uuid,
  p_max_concurrency integer,
  p_lease_seconds integer default 30
) returns uuid
language plpgsql security definer set search_path=public as $$
declare active_count integer;lease_id uuid;
begin
  if nullif(trim(p_provider),'') is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-provider:'||p_provider,0));
  delete from public.kivelle_provider_concurrency_leases where provider=p_provider and expires_at<=clock_timestamp();
  select count(*)::integer into active_count from public.kivelle_provider_concurrency_leases
  where provider=p_provider and expires_at>clock_timestamp();
  if active_count>=least(greatest(p_max_concurrency,1),500) then return null; end if;
  insert into public.kivelle_provider_concurrency_leases(provider,operation,user_id,expires_at)
  values(p_provider,left(coalesce(p_operation,'dialogue'),100),p_user_id,clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,10),120)))
  returning id into lease_id;
  return lease_id;
end $$;

create or replace function public.kivelle_release_provider_slot(p_lease_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare released integer;
begin
  delete from public.kivelle_provider_concurrency_leases where id=p_lease_id;
  get diagnostics released=row_count;return released=1;
end $$;
revoke all on function public.kivelle_acquire_provider_slot(text,text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_release_provider_slot(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_acquire_provider_slot(text,text,uuid,integer,integer) to service_role;
grant execute on function public.kivelle_release_provider_slot(uuid) to service_role;

-- One authoritative active floor per conversation. Direct chat rejects a
-- competing turn; group chat may supersede an already-generating turn. A
-- planning turn is never superseded, which closes the setup race between
-- acquiring the floor and attaching the canonical user message.
alter table public.together_dialogue_turns
  add column if not exists request_id text,
  add column if not exists turn_kind text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

update public.together_dialogue_turns set
  request_id=coalesce(nullif(request_id,''),'legacy:'||id::text),
  turn_kind=coalesce(turn_kind,'group'),
  lease_token=coalesce(lease_token,gen_random_uuid()),
  lease_expires_at=coalesce(lease_expires_at,updated_at+interval '3 minutes');

alter table public.together_dialogue_turns
  alter column request_id set not null,
  alter column turn_kind set not null,
  alter column lease_token set not null,
  alter column lease_token set default gen_random_uuid(),
  alter column lease_expires_at set not null,
  alter column lease_expires_at set default (now()+interval '3 minutes');

alter table public.together_dialogue_turns drop constraint if exists together_dialogue_turns_turn_kind_check;
alter table public.together_dialogue_turns add constraint together_dialogue_turns_turn_kind_check
  check(turn_kind in('direct','group','shared_scene'));

with ranked as(
  select id,row_number() over(partition by conversation_id order by created_at desc,id desc) as row_number
  from public.together_dialogue_turns where state in('planning','generating')
)
update public.together_dialogue_turns turn_row set
  state='cancelled',cancelled_at=coalesce(cancelled_at,now()),version=version+1,
  metadata=metadata||'{"migrationCancellation":true}'::jsonb,updated_at=now()
from ranked where ranked.id=turn_row.id and ranked.row_number>1;

drop index if exists public.together_dialogue_turns_active_idx;
create unique index together_dialogue_turns_active_idx
  on public.together_dialogue_turns(conversation_id)
  where state in('planning','generating');
create unique index if not exists together_dialogue_turns_request_idx
  on public.together_dialogue_turns(conversation_id,request_id);
create index if not exists together_dialogue_turns_lease_expiry_idx
  on public.together_dialogue_turns(lease_expires_at)
  where state in('planning','generating');

create or replace function public.kivelle_begin_dialogue_turn(
  p_user_id uuid,
  p_continuity_id uuid,
  p_conversation_id uuid,
  p_request_id text,
  p_turn_kind text,
  p_supersede_generating boolean default false,
  p_lease_seconds integer default 180
) returns table(
  turn_id uuid,
  lease_token uuid,
  acquired boolean,
  active_state text,
  active_request_id text,
  interrupted_count integer
)
language plpgsql security definer set search_path=public as $$
declare
  conversation_row public.together_conversations%rowtype;
  active_turn public.together_dialogue_turns%rowtype;
  created_turn public.together_dialogue_turns%rowtype;
  interruption_count integer:=0;
  bounded_lease integer:=least(greatest(p_lease_seconds,30),600);
begin
  if p_turn_kind not in('direct','group','shared_scene') or nullif(trim(p_request_id),'') is null then
    raise exception 'invalid dialogue turn request';
  end if;
  select * into conversation_row from public.together_conversations
  where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id
    and archived_at is null and user_archived_at is null
  for update;
  if not found then raise exception 'conversation unavailable'; end if;

  update public.together_dialogue_turns set
    state='failed',version=version+1,
    metadata=metadata||'{"leaseExpired":true}'::jsonb,updated_at=clock_timestamp()
  where conversation_id=p_conversation_id and state in('planning','generating')
    and lease_expires_at<=clock_timestamp();

  select * into active_turn from public.together_dialogue_turns
  where conversation_id=p_conversation_id and state in('planning','generating')
  order by created_at desc limit 1 for update;
  if found then
    if active_turn.request_id=p_request_id then
      return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0;
      return;
    end if;
    if not p_supersede_generating or active_turn.state='planning' then
      return query select active_turn.id,active_turn.lease_token,false,active_turn.state,active_turn.request_id,0;
      return;
    end if;
    update public.together_dialogue_turns set
      state='cancelled',cancelled_at=clock_timestamp(),version=version+1,
      metadata=metadata||jsonb_build_object('supersededByRequestId',p_request_id),updated_at=clock_timestamp()
    where id=active_turn.id and state='generating';
    get diagnostics interruption_count=row_count;
  end if;

  insert into public.together_dialogue_turns(
    user_id,continuity_id,conversation_id,state,version,request_id,turn_kind,
    lease_token,lease_expires_at,planned_actions,metadata
  ) values(
    p_user_id,p_continuity_id,p_conversation_id,'planning',1,p_request_id,p_turn_kind,
    gen_random_uuid(),clock_timestamp()+make_interval(secs=>bounded_lease),'[]'::jsonb,'{}'::jsonb
  ) returning * into created_turn;
  return query select created_turn.id,created_turn.lease_token,true,created_turn.state,created_turn.request_id,interruption_count;
end $$;

create or replace function public.kivelle_activate_dialogue_turn(
  p_turn_id uuid,
  p_lease_token uuid,
  p_source_message_id uuid,
  p_planned_actions jsonb default null,
  p_metadata jsonb default null,
  p_lease_seconds integer default 180
) returns setof public.together_dialogue_turns
language plpgsql security definer set search_path=public as $$
begin
  return query update public.together_dialogue_turns turn_row set
    source_message_id=p_source_message_id,
    state='generating',
    planned_actions=coalesce(p_planned_actions,turn_row.planned_actions),
    metadata=turn_row.metadata||coalesce(p_metadata,'{}'::jsonb),
    lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,30),600)),
    updated_at=clock_timestamp()
  where turn_row.id=p_turn_id and turn_row.lease_token=p_lease_token
    and turn_row.state='planning' and turn_row.lease_expires_at>clock_timestamp()
  returning turn_row.*;
end $$;

create or replace function public.kivelle_touch_dialogue_turn(
  p_turn_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 180
) returns boolean
language plpgsql security definer set search_path=public as $$
declare touched integer;
begin
  update public.together_dialogue_turns set
    lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,30),600)),
    updated_at=clock_timestamp()
  where id=p_turn_id and lease_token=p_lease_token and state in('planning','generating')
    and lease_expires_at>clock_timestamp();
  get diagnostics touched=row_count;
  return touched=1;
end $$;

create or replace function public.kivelle_finish_dialogue_turn(
  p_turn_id uuid,
  p_lease_token uuid,
  p_state text default 'completed',
  p_metadata jsonb default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare finished integer;
begin
  if p_state not in('completed','yielded','cancelled','failed') then raise exception 'invalid terminal turn state'; end if;
  update public.together_dialogue_turns set
    state=p_state,
    yielded_at=case when p_state in('completed','yielded') then clock_timestamp() else yielded_at end,
    cancelled_at=case when p_state='cancelled' then clock_timestamp() else cancelled_at end,
    metadata=metadata||coalesce(p_metadata,'{}'::jsonb),updated_at=clock_timestamp()
  where id=p_turn_id and lease_token=p_lease_token and state in('planning','generating');
  get diagnostics finished=row_count;
  return finished=1;
end $$;

revoke all on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.kivelle_activate_dialogue_turn(uuid,uuid,uuid,jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function public.kivelle_touch_dialogue_turn(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.kivelle_finish_dialogue_turn(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer) to service_role;
grant execute on function public.kivelle_activate_dialogue_turn(uuid,uuid,uuid,jsonb,jsonb,integer) to service_role;
grant execute on function public.kivelle_touch_dialogue_turn(uuid,uuid,integer) to service_role;
grant execute on function public.kivelle_finish_dialogue_turn(uuid,uuid,text,jsonb) to service_role;

-- Provider polling and result finalization are separate critical sections.
-- A webhook may finalize while a dispatcher owns a poll lease, but only one
-- invocation may own the finalization lease and download the provider result.
alter table public.together_media_provider_jobs
  add column if not exists poll_lease_token uuid,
  add column if not exists poll_lease_expires_at timestamptz,
  add column if not exists finalization_lease_token uuid,
  add column if not exists finalization_lease_expires_at timestamptz;
create index if not exists together_media_provider_poll_lease_idx
  on public.together_media_provider_jobs(status,next_poll_at,poll_lease_expires_at)
  where status='processing' and finalized_at is null;
create index if not exists together_media_provider_finalization_lease_idx
  on public.together_media_provider_jobs(finalization_lease_expires_at)
  where finalized_at is null and status in('submitting','processing');

-- Fair claiming favors one oldest job per user before a second job from the
-- same account, retains subscription priority among peers, and lets waiting
-- jobs age past continuously arriving higher-tier work. The advisory lock and
-- generating-count cap provide atomic global backpressure.
create or replace function public.kivelle_claim_media_jobs_v2(
  p_limit integer default 5,
  p_max_inflight integer default 48
) returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
declare
  available_slots integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('kivelle-media-global-claim',0));
  select greatest(0,least(greatest(p_max_inflight,1),500)-count(*))::integer into available_slots
  from public.together_generated_media where media_type in('image','video') and status='generating';
  if available_slots=0 then return; end if;
  return query
  with ranked as(
    select media.id,
      row_number() over(partition by media.user_id order by media.created_at,media.id) as user_rank,
      greatest(0,floor(extract(epoch from (clock_timestamp()-media.created_at))/600)::bigint) as rank_promotions,
      media.queue_priority+least(40,greatest(0,floor(extract(epoch from (clock_timestamp()-media.created_at))/60)::integer)) as effective_priority
    from public.together_generated_media media
    where media.media_type in('image','video') and media.status='queued'
      and coalesce(media.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp()
  ),claimable as(
    select media.id from public.together_generated_media media
    join ranked on ranked.id=media.id
    order by greatest(1,ranked.user_rank-ranked.rank_promotions),ranked.effective_priority desc,media.created_at,media.id
    for update of media skip locked
    limit least(greatest(p_limit,1),20,available_slots)
  )
  update public.together_generated_media media set
    status='generating',claimed_at=clock_timestamp(),attempt_count=media.attempt_count+1,updated_at=clock_timestamp()
  from claimable where media.id=claimable.id returning media.*;
end $$;

create or replace function public.kivelle_claim_media_provider_poll_jobs(
  p_provider text,
  p_limit integer default 5,
  p_lease_seconds integer default 60
) returns setof public.together_media_provider_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimable as(
    select job.id,gen_random_uuid() as token from public.together_media_provider_jobs job
    where job.provider=p_provider and job.status='processing' and job.finalized_at is null
      and job.provider_request_id is not null
      and coalesce(job.next_poll_at,'-infinity'::timestamptz)<=clock_timestamp()
      and (job.poll_lease_expires_at is null or job.poll_lease_expires_at<=clock_timestamp())
    order by job.next_poll_at nulls first,job.created_at,job.id
    for update skip locked limit least(greatest(p_limit,1),20)
  )
  update public.together_media_provider_jobs job set
    poll_lease_token=claimable.token,
    poll_lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,15),300)),
    updated_at=clock_timestamp()
  from claimable where job.id=claimable.id returning job.*;
end $$;

create or replace function public.kivelle_claim_stale_synchronous_media_jobs(
  p_route_ids text[],
  p_stale_before timestamptz,
  p_limit integer default 5,
  p_lease_seconds integer default 60
) returns setof public.together_media_provider_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimable as(
    select job.id,gen_random_uuid() as token from public.together_media_provider_jobs job
    where job.status='processing' and job.finalized_at is null and job.route_id=any(p_route_ids)
      and job.updated_at<=p_stale_before
      and (job.poll_lease_expires_at is null or job.poll_lease_expires_at<=clock_timestamp())
    order by job.updated_at,job.id
    for update skip locked limit least(greatest(p_limit,1),20)
  )
  update public.together_media_provider_jobs job set
    poll_lease_token=claimable.token,
    poll_lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,15),300)),
    updated_at=clock_timestamp()
  from claimable where job.id=claimable.id returning job.*;
end $$;

create or replace function public.kivelle_claim_media_finalization(
  p_job_id uuid,
  p_lease_seconds integer default 180
) returns setof public.together_media_provider_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with claimable as(
    select job.id,gen_random_uuid() as token from public.together_media_provider_jobs job
    where job.id=p_job_id and job.finalized_at is null and job.status in('submitting','processing')
      and (job.finalization_lease_expires_at is null or job.finalization_lease_expires_at<=clock_timestamp())
    for update skip locked
  )
  update public.together_media_provider_jobs job set
    finalization_lease_token=claimable.token,
    finalization_lease_expires_at=clock_timestamp()+make_interval(secs=>least(greatest(p_lease_seconds,30),600)),
    updated_at=clock_timestamp()
  from claimable where job.id=claimable.id returning job.*;
end $$;

create or replace function public.kivelle_release_media_poll_lease(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare released integer;
begin
  update public.together_media_provider_jobs set poll_lease_token=null,poll_lease_expires_at=null,updated_at=clock_timestamp()
  where id=p_job_id and poll_lease_token=p_lease_token;
  get diagnostics released=row_count;return released=1;
end $$;

create or replace function public.kivelle_release_media_finalization(p_job_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare released integer;
begin
  update public.together_media_provider_jobs set finalization_lease_token=null,finalization_lease_expires_at=null,updated_at=clock_timestamp()
  where id=p_job_id and finalization_lease_token=p_lease_token and finalized_at is null;
  get diagnostics released=row_count;return released=1;
end $$;

revoke all on function public.kivelle_claim_media_jobs_v2(integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_claim_media_provider_poll_jobs(text,integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_claim_stale_synchronous_media_jobs(text[],timestamptz,integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_claim_media_finalization(uuid,integer) from public,anon,authenticated;
revoke all on function public.kivelle_release_media_poll_lease(uuid,uuid) from public,anon,authenticated;
revoke all on function public.kivelle_release_media_finalization(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs_v2(integer,integer) to service_role;
grant execute on function public.kivelle_claim_media_provider_poll_jobs(text,integer,integer) to service_role;
grant execute on function public.kivelle_claim_stale_synchronous_media_jobs(text[],timestamptz,integer,integer) to service_role;
grant execute on function public.kivelle_claim_media_finalization(uuid,integer) to service_role;
grant execute on function public.kivelle_release_media_poll_lease(uuid,uuid) to service_role;
grant execute on function public.kivelle_release_media_finalization(uuid,uuid) to service_role;

alter table public.together_media_provider_webhook_receipts
  add column if not exists matched_at timestamptz,
  add column if not exists processed_at timestamptz;

-- Request-time dispatch remains the low-latency path. This minute-level sweep
-- is the durable recovery path when an Edge Function kick is dropped or the
-- requesting client leaves before polling media status.
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='together-media-dispatch' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'together-media-dispatch','* * * * *',
    $dispatch$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='together_project_url') || '/functions/v1/together-media-dispatch',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-together-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='together_media_dispatch_secret')
        ),
        body := '{"limit":10}'::jsonb,
        timeout_milliseconds := 50000
      );
    $dispatch$
  );

  select jobid into existing_job from cron.job where jobname='kivelle-rate-limit-cleanup' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'kivelle-rate-limit-cleanup','17 3 * * *',
    $cleanup$delete from public.kivelle_rate_limit_windows where expires_at<now()-interval '1 day'$cleanup$
  );
end $$;

comment on function public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer)
  is 'Atomically acquires one expiring conversational floor per conversation; service role only.';
comment on function public.kivelle_claim_media_jobs_v2(integer,integer)
  is 'Fair, aged, globally bounded claim for durable generated-media work.';
comment on function public.kivelle_claim_media_finalization(uuid,integer)
  is 'Exact-one active finalizer lease shared by provider polling and webhooks.';

commit;
