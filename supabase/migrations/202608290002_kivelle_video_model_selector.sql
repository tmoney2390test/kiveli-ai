begin;

alter table public.together_generated_media
  add column if not exists video_route_id text,
  add column if not exists motion_preset text,
  add column if not exists requested_duration_seconds smallint,
  add column if not exists requested_resolution text,
  add column if not exists requested_audio_behavior text,
  add column if not exists actual_audio_behavior text,
  add column if not exists source_aspect_ratio text,
  add column if not exists provider_quote_usd numeric(10,4),
  add column if not exists testing_selection boolean not null default false;

alter table public.together_generated_media drop constraint if exists together_generated_media_video_intent_check;
alter table public.together_generated_media add constraint together_generated_media_video_intent_check check(
  media_type<>'video' or (
    video_route_id in(
      'wavespeed-gemini-omni-flash-i2v',
      'wavespeed-minimax-h3-i2v',
      'wavespeed-p-video-i2v',
      'wavespeed-gemini-omni-flash-r2v'
    )
    and motion_preset in('subtle','playful','cinematic')
    and requested_duration_seconds=5
    and requested_resolution in('provider_native','768p','720p')
    and requested_audio_behavior in('generated_audio','silent','provider_default')
    and source_aspect_ratio in('9:16','16:9')
    and provider_quote_usd>=0
  )
) not valid;
alter table public.together_generated_media drop constraint if exists together_generated_media_actual_audio_check;
alter table public.together_generated_media add constraint together_generated_media_actual_audio_check check(
  actual_audio_behavior is null or actual_audio_behavior in('has_audio','silent','unknown')
) not valid;
create index if not exists together_generated_media_active_video_user_idx
  on public.together_generated_media(user_id,created_at)
  where media_type='video' and status in('queued','generating');
create index if not exists together_generated_media_video_daily_idx
  on public.together_generated_media(user_id,created_at desc)
  where media_type='video';
create index if not exists together_generated_media_video_route_queue_idx
  on public.together_generated_media(video_route_id,status,created_at)
  where media_type='video' and status in('queued','generating');

alter table public.together_media_provider_jobs
  add column if not exists quoted_provider_cost_usd numeric(10,4),
  add column if not exists actual_provider_cost_usd numeric(10,4),
  add column if not exists requested_duration_seconds smallint,
  add column if not exists requested_resolution text,
  add column if not exists requested_audio_behavior text,
  add column if not exists actual_audio_behavior text,
  add column if not exists source_aspect_ratio text,
  add column if not exists motion_preset text,
  add column if not exists testing_selection boolean not null default false;
alter table public.together_media_provider_jobs drop constraint if exists together_media_provider_jobs_actual_audio_check;
alter table public.together_media_provider_jobs add constraint together_media_provider_jobs_actual_audio_check check(
  actual_audio_behavior is null or actual_audio_behavior in('has_audio','silent','unknown')
) not valid;

create table if not exists public.together_video_feedback(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_media_id uuid not null references public.together_generated_media(id) on delete cascade,
  verdict text not null check(verdict in('looks_good','needs_work')),
  reason_codes text[] not null default '{}',
  other_text text,
  playback_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,video_media_id),
  check(cardinality(reason_codes)<=10),
  check(other_text is null or char_length(other_text)<=500),
  check(verdict='needs_work' or cardinality(reason_codes)=0)
);
create index if not exists together_video_feedback_media_idx on public.together_video_feedback(video_media_id,updated_at desc);
alter table public.together_video_feedback enable row level security;
drop policy if exists together_video_feedback_own_read on public.together_video_feedback;
create policy together_video_feedback_own_read on public.together_video_feedback for select to authenticated using(user_id=auth.uid());
revoke all on public.together_video_feedback from public,anon,authenticated;
grant select on public.together_video_feedback to authenticated;
grant select,insert,update,delete on public.together_video_feedback to service_role;

create or replace function public.kivelle_reserve_video_generation(
  p_user_id uuid,
  p_continuity_id uuid,
  p_source_media_id uuid,
  p_request_key text,
  p_route_id text,
  p_motion_preset text,
  p_provider text,
  p_model text,
  p_credit_cost integer,
  p_quote_usd numeric,
  p_duration_seconds integer,
  p_resolution text,
  p_audio_behavior text,
  p_aspect_ratio text,
  p_testing_selection boolean,
  p_route_concurrency_limit integer
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  source_media public.together_generated_media;
  existing_media public.together_generated_media;
  account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();
  transaction_id uuid:=gen_random_uuid();
  subscription_spend integer;
  permanent_spend integer;
  active_count integer;
  daily_count integer;
begin
  if p_request_key is null or char_length(p_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY'; end if;
  if p_route_id not in('wavespeed-gemini-omni-flash-i2v','wavespeed-minimax-h3-i2v','wavespeed-p-video-i2v','wavespeed-gemini-omni-flash-r2v') then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE'; end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_duration_seconds<>5 or p_resolution not in('provider_native','768p','720p') or p_audio_behavior not in('generated_audio','silent','provider_default') or p_aspect_ratio not in('9:16','16:9') then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT'; end if;
  if p_provider<>'wavespeed' or p_credit_cost<>125 or p_quote_usd<0 or p_route_concurrency_limit not between 1 and 4 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS'; end if;
  if not(
    (p_route_id='wavespeed-gemini-omni-flash-i2v' and p_model='google/gemini-omni-flash/image-to-video' and p_resolution='provider_native' and p_audio_behavior='generated_audio') or
    (p_route_id='wavespeed-minimax-h3-i2v' and p_model='minimax/h3/image-to-video' and p_resolution='768p' and p_audio_behavior='provider_default') or
    (p_route_id='wavespeed-p-video-i2v' and p_model='pruna-ai/p-video/image-to-video' and p_resolution='720p' and p_audio_behavior='silent') or
    (p_route_id='wavespeed-gemini-omni-flash-r2v' and p_model='google/gemini-omni-flash/reference-to-video' and p_resolution='provider_native' and p_audio_behavior='generated_audio')
  ) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION'; end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));
  select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then
    select * into account from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object('mediaId',existing_media.id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));
  end if;

  select * into source_media from public.together_generated_media
    where id=p_source_media_id and user_id=p_user_id and continuity_id=p_continuity_id
    for share;
  if source_media.id is null or source_media.media_type<>'image' or source_media.status<>'ready' or source_media.storage_path is null then raise exception using errcode='P0001',message='VIDEO_SOURCE_NOT_READY'; end if;
  if source_media.content_level not in('standard','romance') then raise exception using errcode='P0001',message='VIDEO_CONTENT_LEVEL_BLOCKED'; end if;
  if coalesce(cardinality(array_remove(source_media.subject_character_instance_ids,null)),1)<>1 then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED'; end if;
  if not exists(
    select 1 from public.together_character_instances instance
    join public.together_character_templates template on template.id=instance.character_template_id
    join public.together_character_versions version on version.id=instance.character_version_id
    where instance.id=source_media.character_instance_id and instance.user_id=p_user_id and instance.continuity_id=p_continuity_id and template.age>=18
      and coalesce(template.discovery_metadata->>'fictional','true')<>'false'
      and coalesce(version.character_bible->>'fictional','true')<>'false'
      and coalesce(version.visual_identity->>'fictional','true')<>'false'
  ) then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED'; end if;

  select count(*) into active_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating');
  if active_count>0 then raise exception using errcode='P0001',message='ACTIVE_VIDEO_EXISTS'; end if;
  select count(*) into daily_count from public.together_generated_media where user_id=p_user_id and media_type='video' and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  if daily_count>=3 then raise exception using errcode='P0001',message='VIDEO_DAILY_LIMIT'; end if;

  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS'; end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);
  permanent_spend=p_credit_cost-subscription_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
    values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','short_video','sourceMediaId',p_source_media_id,'videoRouteId',p_route_id));

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,message_id,life_event_id,date_session_id,moment_id,story_arc_id,scene_session_id,scene_action_id,shared_plan_id,world_id,location_id,parent_media_id,
    media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,source_aspect_ratio,provider_quote_usd,testing_selection,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,source_media.character_instance_id,source_media.subject_character_instance_ids,source_media.conversation_id,source_media.message_id,source_media.life_event_id,source_media.date_session_id,source_media.moment_id,source_media.story_arc_id,source_media.scene_session_id,source_media.scene_action_id,source_media.shared_plan_id,source_media.world_id,source_media.location_id,source_media.id,
    'video',source_media.content_level,'queued',p_request_key,source_media.queue_priority,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_aspect_ratio,p_quote_usd,p_testing_selection,
    jsonb_build_object('source','user_request','parentMediaId',source_media.id,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','short_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'videoRequest',jsonb_build_object('routeId',p_route_id,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'audioBehavior',p_audio_behavior,'aspectRatio',p_aspect_ratio,'quotedCostUsd',p_quote_usd,'testingSelection',p_testing_selection))
  );
  return jsonb_build_object('mediaId',video_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;
revoke all on function public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_video_generation(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer) to service_role;

create or replace function public.kivelle_claim_media_jobs_v3(
  p_limit integer default 5,
  p_max_image_inflight integer default 48,
  p_max_video_inflight integer default 4
) returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
declare
  image_slots integer;
  video_slots integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('kivelle-media-global-claim-v3',0));
  select greatest(0,least(greatest(p_max_image_inflight,1),500)-count(*))::integer into image_slots from public.together_generated_media where media_type='image' and status='generating';
  select greatest(0,least(greatest(p_max_video_inflight,1),20)-count(*))::integer into video_slots from public.together_generated_media where media_type='video' and status='generating';
  if image_slots=0 and video_slots=0 then return; end if;
  return query
  with base as(
    select media.id,media.media_type,media.video_route_id,media.user_id,media.created_at,media.queue_priority,
      row_number() over(partition by media.user_id,media.media_type order by media.created_at,media.id) as user_rank,
      greatest(0,floor(extract(epoch from(clock_timestamp()-media.created_at))/600)::bigint) as rank_promotions,
      media.queue_priority+least(40,greatest(0,floor(extract(epoch from(clock_timestamp()-media.created_at))/60)::integer)) as effective_priority,
      case when media.metadata->>'routeConcurrencyLimit'~'^[1-4]$' then(media.metadata->>'routeConcurrencyLimit')::integer else 1 end as route_limit
    from public.together_generated_media media
    where media.media_type in('image','video') and media.status='queued' and coalesce(media.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp()
  ),ordered as(
    select base.*,
      row_number() over(partition by media_type order by greatest(1,user_rank-rank_promotions),effective_priority desc,created_at,id) as type_rank,
      row_number() over(partition by video_route_id order by greatest(1,user_rank-rank_promotions),effective_priority desc,created_at,id) as route_rank
    from base
  ),eligible as(
    select ordered.* from ordered where
      (media_type='image' and type_rank<=image_slots)
      or (media_type='video' and type_rank<=video_slots and route_rank<=greatest(0,route_limit-(select count(*) from public.together_generated_media active where active.media_type='video' and active.status='generating' and active.video_route_id=ordered.video_route_id)))
  ),claimable as(
    select media.id from public.together_generated_media media join eligible on eligible.id=media.id
    order by eligible.effective_priority desc,media.created_at,media.id
    for update of media skip locked
    limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media set status='generating',claimed_at=clock_timestamp(),attempt_count=media.attempt_count+1,updated_at=clock_timestamp()
  from claimable where media.id=claimable.id returning media.*;
end $$;
revoke all on function public.kivelle_claim_media_jobs_v3(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs_v3(integer,integer,integer) to service_role;

commit;
