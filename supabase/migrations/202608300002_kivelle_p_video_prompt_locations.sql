begin;

drop policy if exists "Users read their generated media" on public.together_generated_media;
create policy "Users read their generated media" on public.together_generated_media for select
using(auth.uid()=user_id and coalesce(metadata->>'hiddenIntermediate','false')<>'true');

create or replace function public.kivelle_reserve_direct_video_generation_v2(
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
  select count(*) into daily_count from public.together_generated_media where user_id=p_user_id and media_type='video' and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
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
      'image','standard','queued',p_source_frame_request_key,90,
      coalesce(p_source_frame_metadata,'{}'::jsonb)||jsonb_build_object('source','direct_video_frame','hiddenIntermediate',true,'directVideoTargetMediaId',video_id,'requestKey',p_source_frame_request_key,'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'placeContext',coalesce(p_place_context,'{}'::jsonb),'routeConcurrencyLimit',1,'creditCost',0)
    );
  end if;

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,parent_media_id,
    media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,source_aspect_ratio,provider_quote_usd,testing_selection,video_source_mode,user_prompt,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,p_world_id,p_location_id,source_frame_id,
    'video','standard','queued',p_request_key,70,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_aspect_ratio,p_quote_usd,true,case when generated_first_frame then 'source_photo' else 'canonical_references' end,trim(p_user_prompt),
    jsonb_build_object('source','user_request','videoSourceMode',case when generated_first_frame then 'source_photo' else 'canonical_references' end,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','direct_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'locationId',p_location_id,'worldId',p_world_id,'locationSource',p_source_frame_metadata->>'locationSource','activity',p_source_frame_metadata->>'activity','mood',character_instance.current_mood,'aspectRatio',p_aspect_ratio,'placeContext',coalesce(p_place_context,'{}'::jsonb),'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'generationIntent',jsonb_build_object('requestText',trim(p_user_prompt),'requestedContentLevel','standard'),'directVideoGeneratedFirstFrame',generated_first_frame,'directVideoSourceFrameId',source_frame_id,'videoRequest',jsonb_build_object('routeId',p_route_id,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'audioBehavior',p_audio_behavior,'aspectRatio',p_aspect_ratio,'quotedCostUsd',p_quote_usd,'testingSelection',true))
  );
  return jsonb_build_object('mediaId',video_id,'sourceFrameId',source_frame_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

revoke all on function public.kivelle_reserve_direct_video_generation_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_direct_video_generation_v2(uuid,uuid,uuid,uuid,text,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) to service_role;

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
      and (
        media.media_type<>'video' or media.video_source_mode<>'source_photo' or media.parent_media_id is null
        or exists(select 1 from public.together_generated_media parent where parent.id=media.parent_media_id and parent.user_id=media.user_id and parent.media_type='image' and parent.status='ready' and parent.storage_path is not null)
      )
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
