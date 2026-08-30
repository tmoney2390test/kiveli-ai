begin;

alter table public.together_generated_media
  add column if not exists video_source_mode text,
  add column if not exists user_prompt text;

update public.together_generated_media
set video_source_mode='source_photo'
where media_type='video' and video_source_mode is null;

alter table public.together_generated_media drop constraint if exists together_generated_media_video_source_mode_check;
alter table public.together_generated_media add constraint together_generated_media_video_source_mode_check check(
  media_type<>'video' or (video_source_mode is not null and video_source_mode in('source_photo','canonical_references','video_continuation'))
) not valid;
alter table public.together_generated_media drop constraint if exists together_generated_media_user_prompt_check;
alter table public.together_generated_media add constraint together_generated_media_user_prompt_check check(
  user_prompt is null or char_length(user_prompt)<=400
) not valid;

alter table public.together_generated_media drop constraint if exists together_generated_media_video_intent_check;
alter table public.together_generated_media add constraint together_generated_media_video_intent_check check(
  media_type<>'video' or (
    video_route_id is not null
    and video_route_id in(
      'wavespeed-p-video-i2v',
      'wavespeed-gemini-omni-flash-i2v',
      'wavespeed-minimax-h3-i2v',
      'wavespeed-gemini-omni-flash-r2v',
      'wavespeed-minimax-h3-r2v'
    )
    and motion_preset in('subtle','playful','cinematic')
    and (
      (video_route_id='wavespeed-p-video-i2v' and requested_duration_seconds in(5,10,15,20)) or
      (video_route_id='wavespeed-gemini-omni-flash-i2v' and requested_duration_seconds in(5,10)) or
      (video_route_id='wavespeed-minimax-h3-i2v' and requested_duration_seconds in(5,10,15)) or
      (video_route_id='wavespeed-gemini-omni-flash-r2v' and requested_duration_seconds in(5,10)) or
      (video_route_id='wavespeed-minimax-h3-r2v' and requested_duration_seconds in(10,15))
    )
    and requested_resolution in('provider_native','768p','720p')
    and requested_audio_behavior in('generated_audio','silent','provider_default')
    and source_aspect_ratio in('9:16','16:9')
    and provider_quote_usd>=0
  )
) not valid;

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
  select count(*) into daily_count from public.together_generated_media where user_id=p_user_id and media_type='video' and created_at>=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
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

create or replace function public.kivelle_reserve_direct_video_generation(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_conversation_id uuid,
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
  p_user_prompt text,
  p_reference_assets jsonb,
  p_route_concurrency_limit integer
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  character_instance public.together_character_instances;
  existing_media public.together_generated_media;
  account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();
  transaction_id uuid:=gen_random_uuid();
  v_location_id uuid;
  v_world_id uuid;
  subscription_spend integer;
  permanent_spend integer;
  active_count integer;
  daily_count integer;
begin
  if p_request_key is null or char_length(p_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY'; end if;
  if p_route_id not in('wavespeed-gemini-omni-flash-r2v','wavespeed-minimax-h3-r2v') then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE'; end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_aspect_ratio not in('9:16','16:9') or char_length(trim(coalesce(p_user_prompt,''))) not between 2 and 400 then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT'; end if;
  if not(
    (p_route_id='wavespeed-gemini-omni-flash-r2v' and p_model='google/gemini-omni-flash/reference-to-video' and p_duration_seconds=10 and p_resolution='provider_native' and p_audio_behavior='generated_audio') or
    (p_route_id='wavespeed-minimax-h3-r2v' and p_model='minimax/h3/reference-to-video' and p_duration_seconds in(10,15) and p_resolution='768p' and p_audio_behavior='generated_audio')
  ) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION'; end if;
  if p_provider<>'wavespeed' or p_credit_cost<>p_duration_seconds*25 or p_quote_usd<0 or p_route_concurrency_limit not between 1 and 4 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS'; end if;
  if jsonb_typeof(coalesce(p_reference_assets,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_reference_assets,'[]'::jsonb))>12 then raise exception using errcode='22023',message='INVALID_VIDEO_REFERENCES'; end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));
  select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then
    select * into account from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object('mediaId',existing_media.id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));
  end if;

  select * into character_instance from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id and continuity_id=p_continuity_id for share;
  if character_instance.id is null then raise exception using errcode='P0001',message='VIDEO_CHARACTER_UNAVAILABLE'; end if;
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

  v_location_id=character_instance.current_location_id;
  if v_location_id is not null then select world_id into v_world_id from public.together_locations where id=v_location_id; end if;
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
    values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','direct_video','characterInstanceId',p_character_instance_id,'videoRouteId',p_route_id,'durationSeconds',p_duration_seconds));

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,
    media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,source_aspect_ratio,provider_quote_usd,testing_selection,video_source_mode,user_prompt,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,v_world_id,v_location_id,
    'video','standard','queued',p_request_key,70,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_aspect_ratio,p_quote_usd,true,'canonical_references',trim(p_user_prompt),
    jsonb_build_object('source','user_request','videoSourceMode','canonical_references','requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','direct_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'locationId',v_location_id,'activity',character_instance.current_activity,'mood',character_instance.current_mood,'aspectRatio',p_aspect_ratio,'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'generationIntent',jsonb_build_object('requestText',trim(p_user_prompt),'requestedContentLevel','standard'),'videoRequest',jsonb_build_object('routeId',p_route_id,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'audioBehavior',p_audio_behavior,'aspectRatio',p_aspect_ratio,'quotedCostUsd',p_quote_usd,'testingSelection',true))
  );
  return jsonb_build_object('mediaId',video_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

revoke all on function public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_direct_video_generation(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,numeric,integer,text,text,text,text,jsonb,integer) to service_role;

commit;
