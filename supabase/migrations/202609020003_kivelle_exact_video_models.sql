begin;

alter table public.together_generated_media
  add column if not exists requested_model text,
  add column if not exists resolved_model text,
  add column if not exists sound_requested boolean,
  add column if not exists provider_audio_mode text,
  add column if not exists audio_stream_detected boolean,
  add column if not exists audio_stripped boolean not null default false,
  add column if not exists final_sound_present boolean,
  add column if not exists provider_baseline_cost_usd numeric(10,4);

alter table public.together_media_provider_jobs
  add column if not exists requested_model text,
  add column if not exists resolved_model text,
  add column if not exists sound_requested boolean,
  add column if not exists provider_audio_mode text,
  add column if not exists audio_stream_detected boolean,
  add column if not exists audio_stripped boolean not null default false,
  add column if not exists final_sound_present boolean,
  add column if not exists retry_count integer not null default 0;

update public.together_generated_media set
  sound_requested=coalesce(sound_requested,requested_audio_behavior='generated_audio'),
  provider_audio_mode=coalesce(provider_audio_mode,case when requested_audio_behavior='silent' then 'none' when requested_audio_behavior='generated_audio' then 'toggleable' else 'always' end),
  requested_model=coalesce(requested_model,metadata->>'providerModel'),
  resolved_model=coalesce(resolved_model,metadata->>'providerModel')
where media_type='video';

alter table public.together_generated_media drop constraint if exists together_generated_media_video_intent_check;
alter table public.together_generated_media add constraint together_generated_media_video_intent_check check(
  media_type<>'video' or (
    video_route_id is not null and motion_preset in('subtle','playful','cinematic')
    and requested_duration_seconds between 1 and 20
    and requested_resolution in('provider_native','480p','540p','720p','768p','1080p','4k')
    and requested_audio_behavior in('generated_audio','silent','provider_default')
    and provider_audio_mode in('toggleable','always','none','reference_only')
    and source_aspect_ratio in('9:16','16:9') and provider_quote_usd>=0
  )
) not valid;

alter table public.together_generated_media drop constraint if exists together_generated_media_provider_audio_mode_check;
alter table public.together_generated_media add constraint together_generated_media_provider_audio_mode_check check(provider_audio_mode is null or provider_audio_mode in('toggleable','always','none','reference_only')) not valid;
alter table public.together_media_provider_jobs drop constraint if exists together_media_provider_jobs_provider_audio_mode_check;
alter table public.together_media_provider_jobs add constraint together_media_provider_jobs_provider_audio_mode_check check(provider_audio_mode is null or provider_audio_mode in('toggleable','always','none','reference_only')) not valid;
alter table public.together_media_provider_jobs drop constraint if exists together_media_provider_jobs_retry_count_check;
alter table public.together_media_provider_jobs add constraint together_media_provider_jobs_retry_count_check check(retry_count>=0) not valid;

create index if not exists together_generated_media_video_requested_model_idx on public.together_generated_media(requested_model,created_at desc) where media_type='video';
create index if not exists together_media_provider_jobs_video_comparison_idx on public.together_media_provider_jobs(requested_model,requested_resolution,requested_duration_seconds,sound_requested,created_at desc) where job_type='video';

create or replace function public.kivelle_video_configuration_valid(
  p_route_id text,p_model text,p_duration integer,p_resolution text,p_sound boolean,p_audio_mode text
) returns boolean language sql immutable set search_path=public,extensions as $$
  select p_audio_mode in('toggleable','always','none','reference_only')
    and (p_sound=false or p_audio_mode in('toggleable','always'))
    and (
      (p_route_id='seedance-1-5-pro-spicy' and p_model='bytedance/seedance-v1.5-pro/image-to-video-spicy' and p_duration in(5,10) and p_resolution in('480p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='ltx-2-3-spicy' and p_model='wavespeed-ai/ltx-2.3-spicy/image-to-video' and p_duration between 3 and 20 and p_resolution in('480p','720p','1080p') and p_audio_mode='always') or
      (p_route_id='minimax-h3-spicy' and p_model='wavespeed-ai/minimax-h3/image-to-video-spicy' and p_duration between 3 and 15 and p_resolution in('480p','768p') and p_audio_mode='always') or
      (p_route_id='seedance-2-0-mini-spicy' and p_model='bytedance/seedance-2.0-mini/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-fast-spicy' and p_model='bytedance/seedance-2.0-fast/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-0-spicy' and p_model='bytedance/seedance-2.0/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='seedance-2-5-spicy' and p_model='bytedance/seedance-2.5/image-to-video-spicy' and p_duration between 4 and 15 and p_resolution in('480p','720p','1080p','4k') and p_audio_mode='toggleable') or
      (p_route_id='vidu-q3-spicy' and p_model='vidu/q3/image-to-video-spicy' and p_duration between 1 and 16 and p_resolution in('540p','720p','1080p') and p_audio_mode='toggleable') or
      (p_route_id='wan-2-7-spicy' and p_model='alibaba/wan-2.7/image-to-video-spicy' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-6-spicy' and p_model='alibaba/wan-2.6/image-to-video-spicy' and p_duration in(5,10,15) and p_resolution in('720p','1080p') and p_audio_mode='reference_only' and p_sound=false) or
      (p_route_id='wan-2-2-spicy' and p_model='wavespeed-ai/wan-2.2-spicy/image-to-video' and p_duration in(5,8) and p_resolution in('480p','720p') and p_audio_mode='none' and p_sound=false)
    );
$$;
revoke all on function public.kivelle_video_configuration_valid(text,text,integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.kivelle_video_configuration_valid(text,text,integer,text,boolean,text) to service_role;

create or replace function public.kivelle_reserve_video_generation_v3(
  p_user_id uuid,p_continuity_id uuid,p_source_media_id uuid,p_request_key text,p_route_id text,p_motion_preset text,
  p_provider text,p_model text,p_requested_model text,p_resolved_model text,p_credit_cost integer,p_quote_usd numeric,p_baseline_usd numeric,
  p_duration_seconds integer,p_resolution text,p_audio_behavior text,p_sound_requested boolean,p_provider_audio_mode text,
  p_aspect_ratio text,p_testing_selection boolean,p_route_concurrency_limit integer
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  source_media public.together_generated_media;existing_media public.together_generated_media;account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();transaction_id uuid:=gen_random_uuid();subscription_spend integer;permanent_spend integer;active_count integer;
begin
  if p_request_key is null or char_length(p_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY';end if;
  if p_provider<>'wavespeed' or p_model<>p_requested_model or p_model<>p_resolved_model or not public.kivelle_video_configuration_valid(p_route_id,p_model,p_duration_seconds,p_resolution,p_sound_requested,p_provider_audio_mode) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION';end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_aspect_ratio not in('9:16','16:9') or p_audio_behavior<>(case when p_sound_requested then 'generated_audio' else 'silent' end) then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT';end if;
  if p_credit_cost<1 or p_credit_cost>100000 or p_quote_usd<0 or p_baseline_usd<0 or p_route_concurrency_limit not between 1 and 8 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS';end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));
  select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then select * into account from public.together_credit_accounts where user_id=p_user_id;return jsonb_build_object('mediaId',existing_media.id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));end if;
  select * into source_media from public.together_generated_media where id=p_source_media_id and user_id=p_user_id and continuity_id=p_continuity_id for share;
  if source_media.id is null or source_media.media_type<>'image' or source_media.status<>'ready' or source_media.storage_path is null then raise exception using errcode='P0001',message='VIDEO_SOURCE_NOT_READY';end if;
  if source_media.content_level not in('standard','romance') then raise exception using errcode='P0001',message='VIDEO_CONTENT_LEVEL_BLOCKED';end if;
  if coalesce(cardinality(array_remove(source_media.subject_character_instance_ids,null)),1)<>1 then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED';end if;
  if not exists(select 1 from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id join public.together_character_versions version on version.id=instance.character_version_id where instance.id=source_media.character_instance_id and instance.user_id=p_user_id and instance.continuity_id=p_continuity_id and template.age>=18 and coalesce(template.discovery_metadata->>'fictional','true')<>'false' and coalesce(version.character_bible->>'fictional','true')<>'false' and coalesce(version.visual_identity->>'fictional','true')<>'false') then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED';end if;
  select count(*) into active_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating');if active_count>0 then raise exception using errcode='P0001',message='ACTIVE_VIDEO_EXISTS';end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS';end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);permanent_spend=p_credit_cost-subscription_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','short_video','sourceMediaId',p_source_media_id,'videoRouteId',p_route_id,'requestedModel',p_requested_model,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested));
  insert into public.together_generated_media(id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,message_id,life_event_id,date_session_id,moment_id,story_arc_id,scene_session_id,scene_action_id,shared_plan_id,world_id,location_id,parent_media_id,media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,sound_requested,provider_audio_mode,requested_model,resolved_model,source_aspect_ratio,provider_quote_usd,provider_baseline_cost_usd,testing_selection,video_source_mode,metadata)
  values(video_id,p_user_id,p_continuity_id,source_media.character_instance_id,source_media.subject_character_instance_ids,source_media.conversation_id,source_media.message_id,source_media.life_event_id,source_media.date_session_id,source_media.moment_id,source_media.story_arc_id,source_media.scene_session_id,source_media.scene_action_id,source_media.shared_plan_id,source_media.world_id,source_media.location_id,source_media.id,'video',source_media.content_level,'queued',p_request_key,source_media.queue_priority,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_sound_requested,p_provider_audio_mode,p_requested_model,p_resolved_model,p_aspect_ratio,p_quote_usd,p_baseline_usd,p_testing_selection,'source_photo',jsonb_build_object('source','user_request','videoSourceMode','source_photo','parentMediaId',source_media.id,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','short_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'videoRequest',jsonb_build_object('routeId',p_route_id,'requestedModel',p_requested_model,'resolvedModel',p_resolved_model,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested,'providerAudioMode',p_provider_audio_mode,'quotedCostUsd',p_quote_usd,'baselineCostUsd',p_baseline_usd,'aspectRatio',p_aspect_ratio,'testingSelection',p_testing_selection)));
  return jsonb_build_object('mediaId',video_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;
revoke all on function public.kivelle_reserve_video_generation_v3(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_video_generation_v3(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,boolean,integer) to service_role;

create or replace function public.kivelle_reserve_direct_video_generation_v4(
  p_user_id uuid,p_continuity_id uuid,p_character_instance_id uuid,p_conversation_id uuid,p_request_key text,p_source_frame_request_key text,
  p_route_id text,p_motion_preset text,p_provider text,p_model text,p_requested_model text,p_resolved_model text,p_credit_cost integer,p_quote_usd numeric,p_baseline_usd numeric,
  p_duration_seconds integer,p_resolution text,p_audio_behavior text,p_sound_requested boolean,p_provider_audio_mode text,p_aspect_ratio text,p_user_prompt text,p_reference_assets jsonb,
  p_route_concurrency_limit integer,p_location_id uuid,p_world_id uuid,p_place_context jsonb,p_source_frame_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  character_instance public.together_character_instances;existing_media public.together_generated_media;account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();source_frame_id uuid:=gen_random_uuid();transaction_id uuid:=gen_random_uuid();subscription_spend integer;permanent_spend integer;active_count integer;
begin
  if p_request_key is null or char_length(p_request_key)<12 or p_source_frame_request_key is null or char_length(p_source_frame_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY';end if;
  if p_provider<>'wavespeed' or p_model<>p_requested_model or p_model<>p_resolved_model or not public.kivelle_video_configuration_valid(p_route_id,p_model,p_duration_seconds,p_resolution,p_sound_requested,p_provider_audio_mode) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION';end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_aspect_ratio not in('9:16','16:9') or char_length(trim(coalesce(p_user_prompt,''))) not between 2 and 400 or p_audio_behavior<>(case when p_sound_requested then 'generated_audio' else 'silent' end) then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT';end if;
  if p_credit_cost<1 or p_credit_cost>100000 or p_quote_usd<0 or p_baseline_usd<0 or p_route_concurrency_limit not between 1 and 8 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS';end if;
  if jsonb_typeof(coalesce(p_reference_assets,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_reference_assets,'[]'::jsonb))>12 or jsonb_typeof(coalesce(p_place_context,'{}'::jsonb))<>'object' or jsonb_typeof(coalesce(p_source_frame_metadata,'{}'::jsonb))<>'object' then raise exception using errcode='22023',message='INVALID_VIDEO_CONTEXT';end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then select * into account from public.together_credit_accounts where user_id=p_user_id;return jsonb_build_object('mediaId',existing_media.id,'sourceFrameId',existing_media.parent_media_id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));end if;
  select * into character_instance from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id and continuity_id=p_continuity_id for share;if character_instance.id is null then raise exception using errcode='P0001',message='VIDEO_CHARACTER_UNAVAILABLE';end if;
  if not exists(select 1 from public.together_worlds where id=p_world_id and published=true) then raise exception using errcode='P0001',message='VIDEO_WORLD_UNAVAILABLE';end if;if p_location_id is not null and not exists(select 1 from public.together_locations where id=p_location_id and world_id=p_world_id) then raise exception using errcode='P0001',message='VIDEO_LOCATION_UNAVAILABLE';end if;
  if not exists(select 1 from public.together_character_templates template join public.together_character_versions version on version.id=character_instance.character_version_id where template.id=character_instance.character_template_id and template.age>=18 and coalesce(template.discovery_metadata->>'fictional','true')<>'false' and coalesce(version.character_bible->>'fictional','true')<>'false' and coalesce(version.visual_identity->>'fictional','true')<>'false' and (case when jsonb_typeof(version.visual_identity->'referenceStoragePaths')='array' then jsonb_array_length(version.visual_identity->'referenceStoragePaths')>0 else false end or exists(select 1 from jsonb_array_elements(coalesce(p_reference_assets,'[]'::jsonb)) item where item->>'role'='character_identity'))) then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED';end if;
  if p_conversation_id is not null and not exists(select 1 from public.together_conversations where id=p_conversation_id and user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=p_character_instance_id) then raise exception using errcode='P0001',message='VIDEO_CONVERSATION_UNAVAILABLE';end if;
  select count(*) into active_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating');if active_count>0 then raise exception using errcode='P0001',message='ACTIVE_VIDEO_EXISTS';end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;select * into account from public.together_credit_accounts where user_id=p_user_id for update;if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS';end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);permanent_spend=p_credit_cost-subscription_spend;update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata) values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','direct_video','characterInstanceId',p_character_instance_id,'videoRouteId',p_route_id,'requestedModel',p_requested_model,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested,'locationId',p_location_id,'worldId',p_world_id));
  insert into public.together_generated_media(id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,media_type,content_level,status,request_key,queue_priority,metadata) values(source_frame_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,p_world_id,p_location_id,'image','standard','queued',p_source_frame_request_key,0,coalesce(p_source_frame_metadata,'{}'::jsonb)||jsonb_build_object('source','direct_video_frame','hiddenIntermediate',true,'directVideoTargetMediaId',video_id,'requestKey',p_source_frame_request_key,'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'placeContext',coalesce(p_place_context,'{}'::jsonb),'routeConcurrencyLimit',1,'creditCost',0));
  insert into public.together_generated_media(id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,world_id,location_id,parent_media_id,media_type,content_level,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,sound_requested,provider_audio_mode,requested_model,resolved_model,source_aspect_ratio,provider_quote_usd,provider_baseline_cost_usd,testing_selection,video_source_mode,user_prompt,metadata)
  values(video_id,p_user_id,p_continuity_id,p_character_instance_id,array[p_character_instance_id],p_conversation_id,p_world_id,p_location_id,source_frame_id,'video','standard','queued',p_request_key,0,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_sound_requested,p_provider_audio_mode,p_requested_model,p_resolved_model,p_aspect_ratio,p_quote_usd,p_baseline_usd,true,'source_photo',trim(p_user_prompt),jsonb_build_object('source','user_request','videoSourceMode','source_photo','requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','direct_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'locationId',p_location_id,'worldId',p_world_id,'locationSource',p_source_frame_metadata->>'locationSource','activity',p_source_frame_metadata->>'activity','mood',character_instance.current_mood,'aspectRatio',p_aspect_ratio,'placeContext',coalesce(p_place_context,'{}'::jsonb),'referenceAssets',coalesce(p_reference_assets,'[]'::jsonb),'generationIntent',jsonb_build_object('requestText',trim(p_user_prompt),'requestedContentLevel','standard'),'directVideoGeneratedFirstFrame',true,'directVideoSourceFrameId',source_frame_id,'videoRequest',jsonb_build_object('routeId',p_route_id,'requestedModel',p_requested_model,'resolvedModel',p_resolved_model,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested,'providerAudioMode',p_provider_audio_mode,'quotedCostUsd',p_quote_usd,'baselineCostUsd',p_baseline_usd,'aspectRatio',p_aspect_ratio,'testingSelection',true)));
  return jsonb_build_object('mediaId',video_id,'sourceFrameId',source_frame_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;
revoke all on function public.kivelle_reserve_direct_video_generation_v4(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_direct_video_generation_v4(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,jsonb,integer,uuid,uuid,jsonb,jsonb) to service_role;

commit;
