begin;

-- Video priority is derived server-side from the authoritative entitlement.
-- It is intentionally persisted on the job so dispatch ordering is auditable.
create or replace function public.kivelle_video_queue_priority(p_user_id uuid)
returns integer
language sql stable security definer set search_path=public,extensions as $$
  select case
    when entitlement.expires_at is not null and entitlement.expires_at<=clock_timestamp() then 0
    when entitlement.tier in('kivelle_max','unlimited') then 20
    when entitlement.tier in('kivelle_plus','together_plus') then 10
    else 0
  end
  from (select 1) seed
  left join public.together_entitlements entitlement on entitlement.user_id=p_user_id
  limit 1
$$;

create or replace function public.kivelle_assign_video_queue_priority()
returns trigger
language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.media_type='video' or (new.media_type='image' and new.metadata->>'source'='direct_video_frame') then
    new.queue_priority=public.kivelle_video_queue_priority(new.user_id);
    new.metadata=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('entitlementQueuePriority',new.queue_priority);
  end if;
  return new;
end $$;

drop trigger if exists kivelle_assign_video_queue_priority on public.together_generated_media;
create trigger kivelle_assign_video_queue_priority
before insert on public.together_generated_media
for each row execute function public.kivelle_assign_video_queue_priority();

revoke all on function public.kivelle_video_queue_priority(uuid) from public,anon,authenticated;
revoke all on function public.kivelle_assign_video_queue_priority() from public,anon,authenticated;
grant execute on function public.kivelle_video_queue_priority(uuid) to service_role;

-- One quote owner per price shape, with a small global admission ceiling. This
-- prevents a burst from fanning out into one provider price call per request.
create table if not exists public.together_video_price_cache(
  price_key text primary key check(char_length(price_key) between 8 and 240),
  status text not null check(status in('fetching','ready','backoff')),
  amount_usd numeric,
  currency text not null default 'USD' check(currency='USD'),
  lease_token uuid,
  lease_expires_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check(amount_usd is null or amount_usd>=0)
);
alter table public.together_video_price_cache enable row level security;
revoke all on table public.together_video_price_cache from public,anon,authenticated;
grant select,insert,update,delete on table public.together_video_price_cache to service_role;

create or replace function public.kivelle_claim_video_price_quote(
  p_price_key text,
  p_max_inflight integer default 4,
  p_lease_seconds integer default 25
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  cached public.together_video_price_cache;
  active_count integer;
  token uuid;
begin
  if char_length(coalesce(p_price_key,'')) not between 8 and 240 then raise exception using errcode='22023',message='INVALID_VIDEO_PRICE_KEY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-price-admission',0));
  select * into cached from public.together_video_price_cache where price_key=p_price_key for update;
  if cached.status='ready' and cached.amount_usd is not null and cached.expires_at>clock_timestamp() then
    return jsonb_build_object('state','ready','amountUsd',cached.amount_usd,'currency','USD');
  end if;
  if cached.status='fetching' and cached.lease_expires_at>clock_timestamp() then
    return jsonb_build_object('state','waiting');
  end if;
  if cached.status='backoff' and cached.expires_at>clock_timestamp() then
    return jsonb_build_object('state','backoff','retryAt',cached.expires_at);
  end if;
  select count(*) into active_count from public.together_video_price_cache where status='fetching' and lease_expires_at>clock_timestamp();
  if active_count>=least(8,greatest(1,p_max_inflight)) then return jsonb_build_object('state','busy'); end if;
  token=gen_random_uuid();
  insert into public.together_video_price_cache(price_key,status,amount_usd,lease_token,lease_expires_at,expires_at,updated_at)
  values(p_price_key,'fetching',null,token,clock_timestamp()+make_interval(secs=>least(60,greatest(5,p_lease_seconds))),null,clock_timestamp())
  on conflict(price_key) do update set status='fetching',amount_usd=null,lease_token=excluded.lease_token,lease_expires_at=excluded.lease_expires_at,expires_at=null,updated_at=clock_timestamp();
  return jsonb_build_object('state','owner','leaseToken',token);
end $$;

create or replace function public.kivelle_complete_video_price_quote(
  p_price_key text,
  p_lease_token uuid,
  p_amount_usd numeric,
  p_ttl_seconds integer default 90
) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare changed integer;
begin
  if p_amount_usd<0 then raise exception using errcode='22023',message='INVALID_VIDEO_PRICE'; end if;
  update public.together_video_price_cache set status='ready',amount_usd=p_amount_usd,currency='USD',lease_token=null,lease_expires_at=null,expires_at=clock_timestamp()+make_interval(secs=>least(300,greatest(15,p_ttl_seconds))),updated_at=clock_timestamp()
  where price_key=p_price_key and status='fetching' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create or replace function public.kivelle_backoff_video_price_quote(
  p_price_key text,
  p_lease_token uuid,
  p_backoff_seconds integer default 5
) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare changed integer;
begin
  update public.together_video_price_cache set status='backoff',amount_usd=null,lease_token=null,lease_expires_at=null,expires_at=clock_timestamp()+make_interval(secs=>least(30,greatest(1,p_backoff_seconds))),updated_at=clock_timestamp()
  where price_key=p_price_key and status='fetching' and lease_token=p_lease_token;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.kivelle_claim_video_price_quote(text,integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_complete_video_price_quote(text,uuid,numeric,integer) from public,anon,authenticated;
revoke all on function public.kivelle_backoff_video_price_quote(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_video_price_quote(text,integer,integer) to service_role;
grant execute on function public.kivelle_complete_video_price_quote(text,uuid,numeric,integer) to service_role;
grant execute on function public.kivelle_backoff_video_price_quote(text,uuid,integer) to service_role;

-- Collapse simultaneous low-latency dispatcher kicks. Webhooks and the durable
-- minute sweep remain recovery paths, and a failed kick can release its token.
create table if not exists public.kivelle_media_dispatch_signal(
  singleton boolean primary key default true check(singleton),
  last_token uuid,
  last_kicked_at timestamptz not null default '-infinity',
  updated_at timestamptz not null default now()
);
insert into public.kivelle_media_dispatch_signal(singleton) values(true) on conflict(singleton) do nothing;
alter table public.kivelle_media_dispatch_signal enable row level security;
revoke all on table public.kivelle_media_dispatch_signal from public,anon,authenticated;
grant select,update on table public.kivelle_media_dispatch_signal to service_role;

create or replace function public.kivelle_claim_media_dispatch_signal(p_cooldown_ms integer default 1500)
returns uuid
language plpgsql security definer set search_path=public,extensions as $$
declare signal public.kivelle_media_dispatch_signal; token uuid;
begin
  select * into signal from public.kivelle_media_dispatch_signal where singleton=true for update;
  if signal.last_kicked_at>clock_timestamp()-make_interval(secs=>least(10,greatest(0,p_cooldown_ms)/1000.0)) then return null; end if;
  token=gen_random_uuid();
  update public.kivelle_media_dispatch_signal set last_token=token,last_kicked_at=clock_timestamp(),updated_at=clock_timestamp() where singleton=true;
  return token;
end $$;

create or replace function public.kivelle_release_media_dispatch_signal(p_token uuid)
returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare changed integer;
begin
  update public.kivelle_media_dispatch_signal set last_kicked_at='-infinity',updated_at=clock_timestamp() where singleton=true and last_token=p_token;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.kivelle_claim_media_dispatch_signal(integer) from public,anon,authenticated;
revoke all on function public.kivelle_release_media_dispatch_signal(uuid) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_dispatch_signal(integer) to service_role;
grant execute on function public.kivelle_release_media_dispatch_signal(uuid) to service_role;

-- Separate opening-frame capacity from ordinary images and video provider
-- capacity. Frames are filtered before the global image rank is assigned, so
-- a full frame lane cannot block ordinary companion photos.
create or replace function public.kivelle_claim_media_jobs_v4(
  p_limit integer default 10,
  p_max_image_inflight integer default 48,
  p_max_video_inflight integer default 4,
  p_max_video_frame_inflight integer default 4
) returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
declare image_slots integer; video_slots integer; frame_slots integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('kivelle-media-global-claim-v4',0));
  select greatest(0,least(greatest(p_max_image_inflight,1),500)-count(*))::integer into image_slots from public.together_generated_media where media_type='image' and status='generating';
  select greatest(0,least(greatest(p_max_video_inflight,1),20)-count(*))::integer into video_slots from public.together_generated_media where media_type='video' and status='generating';
  select greatest(0,least(greatest(p_max_video_frame_inflight,1),20)-count(*))::integer into frame_slots from public.together_generated_media where media_type='image' and status='generating' and metadata->>'source'='direct_video_frame' and metadata->>'hiddenIntermediate'='true';
  if image_slots=0 and video_slots=0 then return; end if;
  return query
  with base as(
    select media.id,media.media_type,media.video_route_id,media.user_id,media.created_at,media.queue_priority,
      coalesce(media.metadata->>'source'='direct_video_frame' and media.metadata->>'hiddenIntermediate'='true',false) as is_video_frame,
      row_number() over(partition by media.user_id,media.media_type order by media.created_at,media.id) as user_rank,
      greatest(0,floor(extract(epoch from(clock_timestamp()-media.created_at))/600)::bigint) as rank_promotions,
      media.queue_priority+least(40,greatest(0,floor(extract(epoch from(clock_timestamp()-media.created_at))/60)::integer)) as effective_priority,
      case when media.metadata->>'routeConcurrencyLimit'~'^[1-4]$' then(media.metadata->>'routeConcurrencyLimit')::integer else 1 end as route_limit
    from public.together_generated_media media
    where media.media_type in('image','video') and media.status='queued' and coalesce(media.next_attempt_at,'-infinity'::timestamptz)<=clock_timestamp()
      and (media.media_type<>'video' or media.video_source_mode<>'source_photo' or media.parent_media_id is null
        or exists(select 1 from public.together_generated_media parent where parent.id=media.parent_media_id and parent.user_id=media.user_id and parent.media_type='image' and parent.status='ready' and parent.storage_path is not null))
  ),ranked as(
    select base.*,
      row_number() over(partition by video_route_id order by greatest(1,user_rank-rank_promotions),effective_priority desc,created_at,id) as route_rank,
      sum(case when is_video_frame then 1 else 0 end) over(order by greatest(1,user_rank-rank_promotions),effective_priority desc,created_at,id) as frame_rank
    from base
  ),preeligible as(
    select ranked.* from ranked where
      (media_type='image' and (not is_video_frame or frame_rank<=frame_slots))
      or (media_type='video' and route_rank<=greatest(0,route_limit-(select count(*) from public.together_generated_media active where active.media_type='video' and active.status='generating' and active.video_route_id=ranked.video_route_id)))
  ),capacity_ranked as(
    select preeligible.*,row_number() over(partition by media_type order by greatest(1,user_rank-rank_promotions),effective_priority desc,created_at,id) as type_rank from preeligible
  ),eligible as(
    select * from capacity_ranked where (media_type='image' and type_rank<=image_slots) or (media_type='video' and type_rank<=video_slots)
  ),claimable as(
    select media.id from public.together_generated_media media join eligible on eligible.id=media.id
    order by eligible.effective_priority desc,media.created_at,media.id
    for update of media skip locked limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media set status='generating',claimed_at=clock_timestamp(),attempt_count=media.attempt_count+1,updated_at=clock_timestamp()
  from claimable where media.id=claimable.id returning media.*;
end $$;

revoke all on function public.kivelle_claim_media_jobs_v4(integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs_v4(integer,integer,integer,integer) to service_role;

-- Failed/refunded videos no longer consume a successful daily slot. The
-- priority trigger applies the user's current authoritative tier on insert.
create or replace function public.kivelle_reserve_video_generation_v2(
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
  if p_route_id not in('wavespeed-p-video-i2v','wavespeed-gemini-omni-flash-i2v','wavespeed-minimax-h3-i2v','wavespeed-gemini-omni-flash-r2v') then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE'; end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_resolution not in('provider_native','768p','720p') or p_audio_behavior not in('generated_audio','silent','provider_default') or p_aspect_ratio not in('9:16','16:9') then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT'; end if;
  if not(
    (p_route_id='wavespeed-p-video-i2v' and p_duration_seconds in(10,15,20)) or
    (p_route_id='wavespeed-gemini-omni-flash-i2v' and p_duration_seconds=10) or
    (p_route_id='wavespeed-minimax-h3-i2v' and p_duration_seconds in(10,15)) or
    (p_route_id='wavespeed-gemini-omni-flash-r2v' and p_duration_seconds=10)
  ) then raise exception using errcode='22023',message='INVALID_VIDEO_DURATION'; end if;
  if p_provider<>'wavespeed' or p_credit_cost<>p_duration_seconds*25 or p_quote_usd<0 or p_route_concurrency_limit not between 1 and 4 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS'; end if;
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

  select * into source_media from public.together_generated_media where id=p_source_media_id and user_id=p_user_id and continuity_id=p_continuity_id for share;
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
  select count(*) into daily_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating','ready') and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  if daily_count>=3 then raise exception using errcode='P0001',message='VIDEO_DAILY_LIMIT'; end if;

  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS'; end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);
  permanent_spend=p_credit_cost-subscription_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
    values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','short_video','sourceMediaId',p_source_media_id,'videoRouteId',p_route_id,'durationSeconds',p_duration_seconds));

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,message_id,life_event_id,date_session_id,moment_id,story_arc_id,scene_session_id,scene_action_id,shared_plan_id,world_id,location_id,parent_media_id,
    media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,source_aspect_ratio,provider_quote_usd,testing_selection,video_source_mode,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,source_media.character_instance_id,source_media.subject_character_instance_ids,source_media.conversation_id,source_media.message_id,source_media.life_event_id,source_media.date_session_id,source_media.moment_id,source_media.story_arc_id,source_media.scene_session_id,source_media.scene_action_id,source_media.shared_plan_id,source_media.world_id,source_media.location_id,source_media.id,
    'video',source_media.content_level,'queued',p_request_key,source_media.queue_priority,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_aspect_ratio,p_quote_usd,p_testing_selection,'source_photo',
    jsonb_build_object('source','user_request','videoSourceMode','source_photo','parentMediaId',source_media.id,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','short_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'videoRequest',jsonb_build_object('routeId',p_route_id,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'audioBehavior',p_audio_behavior,'aspectRatio',p_aspect_ratio,'quotedCostUsd',p_quote_usd,'testingSelection',p_testing_selection))
  );
  return jsonb_build_object('mediaId',video_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

revoke all on function public.kivelle_reserve_video_generation_v2(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_video_generation_v2(uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,boolean,integer) to service_role;

create or replace function public.kivelle_reserve_direct_video_generation_v3(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_conversation_id uuid,
  p_request_key text,
  p_source_frame_request_key text,
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
  p_user_prompt text,
  p_reference_assets jsonb,
  p_route_concurrency_limit integer,
  p_location_id uuid,
  p_world_id uuid,
  p_place_context jsonb,
  p_source_frame_metadata jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  character_instance public.together_character_instances;
  existing_media public.together_generated_media;
  account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();
  source_frame_id uuid;
  transaction_id uuid:=gen_random_uuid();
  subscription_spend integer;
  permanent_spend integer;
  active_count integer;
  daily_count integer;
  generated_first_frame boolean:=p_route_id='wavespeed-p-video-i2v';
begin
  if p_request_key is null or char_length(p_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY'; end if;
  if p_route_id not in('wavespeed-p-video-i2v','wavespeed-gemini-omni-flash-r2v','wavespeed-minimax-h3-r2v') then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE'; end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_aspect_ratio not in('9:16','16:9') or char_length(trim(coalesce(p_user_prompt,''))) not between 2 and 400 then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT'; end if;
  if not(
    (p_route_id='wavespeed-p-video-i2v' and p_model='pruna-ai/p-video/image-to-video' and p_duration_seconds in(10,15,20) and p_resolution='720p' and p_audio_behavior='silent') or
    (p_route_id='wavespeed-gemini-omni-flash-r2v' and p_model='google/gemini-omni-flash/reference-to-video' and p_duration_seconds=10 and p_resolution='provider_native' and p_audio_behavior='generated_audio') or
    (p_route_id='wavespeed-minimax-h3-r2v' and p_model='minimax/h3/reference-to-video' and p_duration_seconds in(10,15) and p_resolution='768p' and p_audio_behavior='generated_audio')
  ) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION'; end if;
  if p_provider<>'wavespeed' or p_credit_cost<>p_duration_seconds*25 or p_quote_usd<0 or p_route_concurrency_limit not between 1 and 4 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS'; end if;
  if jsonb_typeof(coalesce(p_reference_assets,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_reference_assets,'[]'::jsonb))>12 then raise exception using errcode='22023',message='INVALID_VIDEO_REFERENCES'; end if;
  if jsonb_typeof(coalesce(p_place_context,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_source_frame_metadata,'{}'::jsonb))<>'object' then raise exception using errcode='22023',message='INVALID_VIDEO_CONTEXT'; end if;
  if generated_first_frame and (p_source_frame_request_key is null or char_length(p_source_frame_request_key)<12) then raise exception using errcode='22023',message='INVALID_VIDEO_SOURCE_FRAME_KEY'; end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));
  select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then
    select * into account from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object('mediaId',existing_media.id,'sourceFrameId',existing_media.parent_media_id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));
  end if;

  select * into character_instance from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id and continuity_id=p_continuity_id for share;
  if character_instance.id is null then raise exception using errcode='P0001',message='VIDEO_CHARACTER_UNAVAILABLE'; end if;
  if not exists(select 1 from public.together_worlds where id=p_world_id and published=true) then raise exception using errcode='P0001',message='VIDEO_WORLD_UNAVAILABLE'; end if;
  if p_location_id is not null and not exists(select 1 from public.together_locations where id=p_location_id and world_id=p_world_id) then raise exception using errcode='P0001',message='VIDEO_LOCATION_UNAVAILABLE'; end if;
  if not exists(
    select 1 from public.together_character_templates template
    join public.together_character_versions version on version.id=character_instance.character_version_id
    where template.id=character_instance.character_template_id and template.age>=18
      and coalesce(template.discovery_metadata->>'fictional','true')<>'false'
      and coalesce(version.character_bible->>'fictional','true')<>'false'
      and coalesce(version.visual_identity->>'fictional','true')<>'false'
      and (
        case when jsonb_typeof(version.visual_identity->'referenceStoragePaths')='array' then jsonb_array_length(version.visual_identity->'referenceStoragePaths')>0 else false end
        or exists(select 1 from jsonb_array_elements(coalesce(p_reference_assets,'[]'::jsonb)) item where item->>'role'='character_identity')
      )
  ) then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED'; end if;
  if p_conversation_id is not null and not exists(select 1 from public.together_conversations where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=p_character_instance_id) then raise exception using errcode='P0001',message='VIDEO_CONVERSATION_UNAVAILABLE'; end if;

  select count(*) into active_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating');
  if active_count>0 then raise exception using errcode='P0001',message='ACTIVE_VIDEO_EXISTS'; end if;
  select count(*) into daily_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating','ready') and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  if daily_count>=3 then raise exception using errcode='P0001',message='VIDEO_DAILY_LIMIT'; end if;

  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS'; end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);
  permanent_spend=p_credit_cost-subscription_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
    values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','direct_video','characterInstanceId',p_character_instance_id,'videoRouteId',p_route_id,'durationSeconds',p_duration_seconds,'locationId',p_location_id,'worldId',p_world_id));

  if generated_first_frame then
    source_frame_id=gen_random_uuid();
    insert into public.together_generated_media(
      id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,
      media_type,content_level,status,request_key,queue_priority,metadata
    ) values(
      source_frame_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,p_world_id,p_location_id,
      'image','standard','queued',p_source_frame_request_key,0,
      coalesce(p_source_frame_metadata,'{}'::jsonb)||jsonb_build_object('source','direct_video_frame','hiddenIntermediate',true,'directVideoTargetMediaId',video_id,'requestKey',p_source_frame_request_key,'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'placeContext',coalesce(p_place_context,'{}'::jsonb),'routeConcurrencyLimit',1,'creditCost',0)
    );
  end if;

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,parent_media_id,
    media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,source_aspect_ratio,provider_quote_usd,testing_selection,video_source_mode,user_prompt,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,p_world_id,p_location_id,source_frame_id,
    'video','standard','queued',p_request_key,0,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_aspect_ratio,p_quote_usd,true,case when generated_first_frame then 'source_photo' else 'canonical_references' end,trim(p_user_prompt),
    jsonb_build_object('source','user_request','videoSourceMode',case when generated_first_frame then 'source_photo' else 'canonical_references' end,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','direct_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'locationId',p_location_id,'worldId',p_world_id,'locationSource',p_source_frame_metadata->>'locationSource','activity',p_source_frame_metadata->>'activity','mood',character_instance.current_mood,'aspectRatio',p_aspect_ratio,'placeContext',coalesce(p_place_context,'{}'::jsonb),'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'generationIntent',jsonb_build_object('requestText',trim(p_user_prompt),'requestedContentLevel','standard'),'directVideoGeneratedFirstFrame',generated_first_frame,'directVideoSourceFrameId',source_frame_id,'videoRequest',jsonb_build_object('routeId',p_route_id,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'audioBehavior',p_audio_behavior,'aspectRatio',p_aspect_ratio,'quotedCostUsd',p_quote_usd,'testingSelection',true))
  );
  return jsonb_build_object('mediaId',video_id,'sourceFrameId',source_frame_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

revoke all on function public.kivelle_reserve_direct_video_generation_v3(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_direct_video_generation_v3(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) to service_role;

commit;
