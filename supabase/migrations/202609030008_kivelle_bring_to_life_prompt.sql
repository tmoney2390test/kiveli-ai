begin;

-- Bring-to-life uses an explicit user direction just like direct video.
-- The source image remains authoritative for identity, place, and content level.
create or replace function public.kivelle_reserve_video_generation_v6(
  p_user_id uuid,p_continuity_id uuid,p_source_media_id uuid,p_request_key text,p_route_id text,p_motion_preset text,
  p_provider text,p_model text,p_requested_model text,p_resolved_model text,p_credit_cost integer,p_quote_usd numeric,p_baseline_usd numeric,
  p_duration_seconds integer,p_resolution text,p_audio_behavior text,p_sound_requested boolean,p_provider_audio_mode text,
  p_aspect_ratio text,p_user_prompt text,p_testing_selection boolean,p_route_concurrency_limit integer,
  p_adult_authorized boolean,p_adult_web_session_id uuid
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  source_media public.together_generated_media;
  existing_media public.together_generated_media;
  account public.together_credit_accounts;
  video_id uuid:=gen_random_uuid();
  transaction_id uuid:=gen_random_uuid();
  subscription_spend integer;
  permanent_spend integer;
  active_count integer;
  restricted_source boolean;
  adult_route boolean;
  adult_metadata jsonb;
begin
  if p_request_key is null or char_length(p_request_key)<12 then raise exception using errcode='22023',message='INVALID_VIDEO_REQUEST_KEY';end if;
  if p_provider<>'wavespeed' or p_model<>p_requested_model or p_model<>p_resolved_model or not public.kivelle_video_configuration_valid(p_route_id,p_model,p_duration_seconds,p_resolution,p_sound_requested,p_provider_audio_mode) then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION';end if;
  if p_motion_preset not in('subtle','playful','cinematic') or p_aspect_ratio not in('9:16','16:9') or char_length(trim(coalesce(p_user_prompt,''))) not between 2 and 400 or p_audio_behavior<>(case when p_sound_requested then 'generated_audio' else 'silent' end) then raise exception using errcode='22023',message='INVALID_VIDEO_INTENT';end if;
  if p_credit_cost<1 or p_credit_cost>100000 or p_quote_usd<0 or p_baseline_usd<0 or p_route_concurrency_limit not between 1 and 8 then raise exception using errcode='22023',message='INVALID_VIDEO_ECONOMICS';end if;

  perform pg_advisory_xact_lock(hashtextextended('kivelle-video-user:'||p_user_id::text,0));
  select * into existing_media from public.together_generated_media where user_id=p_user_id and request_key=p_request_key;
  if existing_media.id is not null then
    select * into account from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object('mediaId',existing_media.id,'transactionId',existing_media.metadata->>'creditTransactionId','idempotent',true,'total',coalesce(account.permanent_balance,0)+coalesce(account.subscription_balance,0));
  end if;

  select * into source_media from public.together_generated_media where id=p_source_media_id and user_id=p_user_id and continuity_id=p_continuity_id for share;
  if source_media.id is null or source_media.media_type<>'image' or source_media.status<>'ready' or source_media.storage_path is null then raise exception using errcode='P0001',message='VIDEO_SOURCE_NOT_READY';end if;
  restricted_source:=source_media.content_level in('suggestive','mature','explicit');
  adult_route:=p_route_id like '%-spicy';

  if restricted_source and not adult_route then raise exception using errcode='22023',message='INVALID_VIDEO_ROUTE_CONFIGURATION';end if;
  if not restricted_source and source_media.content_level not in('standard','romance') then raise exception using errcode='P0001',message='VIDEO_CONTENT_LEVEL_BLOCKED';end if;

  if adult_route then
    if coalesce(p_adult_authorized,false)<>true or p_adult_web_session_id is null then raise exception using errcode='22023',message='INVALID_VIDEO_CONTENT_POLICY';end if;
    if not (
      exists(select 1 from public.together_profiles profile where profile.user_id=p_user_id and profile.adult_eligible_at is not null)
      and exists(select 1 from public.together_entitlements entitlement where entitlement.user_id=p_user_id and entitlement.tier<>'free' and (entitlement.expires_at is null or entitlement.expires_at>now()))
      and exists(select 1 from public.together_web_adult_sessions session where session.id=p_adult_web_session_id and session.user_id=p_user_id and session.adult_mode_enabled=true and session.revoked_at is null and session.expires_at>now())
    ) then raise exception using errcode='P0001',message='WEB_ADULT_VIDEO_AUTHORIZATION_REQUIRED';end if;
  elsif coalesce(p_adult_authorized,false) or p_adult_web_session_id is not null then
    raise exception using errcode='22023',message='INVALID_VIDEO_CONTENT_POLICY';
  end if;

  if coalesce(cardinality(array_remove(source_media.subject_character_instance_ids,null)),1)<>1 then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED';end if;
  if not exists(
    select 1 from public.together_character_instances instance
    join public.together_character_templates template on template.id=instance.character_template_id
    join public.together_character_versions version on version.id=instance.character_version_id
    where instance.id=source_media.character_instance_id and instance.user_id=p_user_id and instance.continuity_id=p_continuity_id
      and template.age>=18 and coalesce(template.discovery_metadata->>'fictional','true')<>'false'
      and coalesce(version.character_bible->>'fictional','true')<>'false' and coalesce(version.visual_identity->>'fictional','true')<>'false'
  ) then raise exception using errcode='P0001',message='VIDEO_SINGLE_FICTIONAL_ADULT_REQUIRED';end if;

  select count(*) into active_count from public.together_generated_media where user_id=p_user_id and media_type='video' and status in('queued','generating');
  if active_count>0 then raise exception using errcode='P0001',message='ACTIVE_VIDEO_EXISTS';end if;
  insert into public.together_credit_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into account from public.together_credit_accounts where user_id=p_user_id for update;
  if account.permanent_balance+account.subscription_balance<p_credit_cost then raise exception using errcode='P0001',message='INSUFFICIENT_KIVELLE_CREDITS';end if;
  subscription_spend=least(account.subscription_balance,p_credit_cost);
  permanent_spend=p_credit_cost-subscription_spend;
  update public.together_credit_accounts set subscription_balance=subscription_balance-subscription_spend,permanent_balance=permanent_balance-permanent_spend,updated_at=clock_timestamp() where user_id=p_user_id returning * into account;
  insert into public.together_credit_ledger(id,user_id,event_type,permanent_delta,subscription_delta,idempotency_key,reference_type,reference_id,metadata)
  values(transaction_id,p_user_id,'spend',-permanent_spend,-subscription_spend,'media-video:'||p_request_key,'generated_media',video_id::text,jsonb_build_object('action','short_video','sourceMediaId',p_source_media_id,'videoRouteId',p_route_id,'requestedModel',p_requested_model,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested,'contentLevel',source_media.content_level));

  adult_metadata:=case when adult_route then jsonb_build_object('adultAuthorized',true,'adultWebSessionId',p_adult_web_session_id,'moderationVersion','web-adult-video-v1','adultCapableRoute',true) else '{}'::jsonb end
    ||case when restricted_source and coalesce((source_media.metadata->>'anonymousAdultPartner')='true',false) then jsonb_build_object('anonymousAdultPartner',true,'expectedAdultSubjectCount',2) else '{}'::jsonb end;

  insert into public.together_generated_media(
    id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,message_id,life_event_id,date_session_id,moment_id,story_arc_id,scene_session_id,scene_action_id,shared_plan_id,world_id,location_id,parent_media_id,
    media_type,content_level,content_rating,visibility_scope,moderation_version,status,request_key,queue_priority,video_route_id,motion_preset,requested_duration_seconds,requested_resolution,requested_audio_behavior,sound_requested,provider_audio_mode,requested_model,resolved_model,source_aspect_ratio,provider_quote_usd,provider_baseline_cost_usd,testing_selection,video_source_mode,user_prompt,metadata
  ) values(
    video_id,p_user_id,p_continuity_id,source_media.character_instance_id,source_media.subject_character_instance_ids,source_media.conversation_id,source_media.message_id,source_media.life_event_id,source_media.date_session_id,source_media.moment_id,source_media.story_arc_id,source_media.scene_session_id,source_media.scene_action_id,source_media.shared_plan_id,source_media.world_id,source_media.location_id,source_media.id,
    'video',source_media.content_level,case when restricted_source then 'explicit' when source_media.content_level='romance' then 'suggestive' else 'safe' end,case when adult_route then 'web_adult' else 'all' end,case when adult_route then 'web-adult-video-v1' else coalesce(source_media.moderation_version,'video-source-v1') end,'queued',p_request_key,source_media.queue_priority,p_route_id,p_motion_preset,p_duration_seconds,p_resolution,p_audio_behavior,p_sound_requested,p_provider_audio_mode,p_requested_model,p_resolved_model,p_aspect_ratio,p_quote_usd,p_baseline_usd,p_testing_selection,'source_photo',trim(p_user_prompt),
    jsonb_build_object('source','user_request','videoSourceMode','source_photo','parentMediaId',source_media.id,'requestKey',p_request_key,'creditTransactionId',transaction_id,'creditCost',p_credit_cost,'creditAction','short_video','creditRefunded',false,'routeConcurrencyLimit',p_route_concurrency_limit,'generationIntent',jsonb_build_object('requestText',trim(p_user_prompt),'requestedContentLevel',source_media.content_level),'videoRequest',jsonb_build_object('routeId',p_route_id,'requestedModel',p_requested_model,'resolvedModel',p_resolved_model,'motionPreset',p_motion_preset,'durationSeconds',p_duration_seconds,'resolution',p_resolution,'soundRequested',p_sound_requested,'providerAudioMode',p_provider_audio_mode,'quotedCostUsd',p_quote_usd,'baselineCostUsd',p_baseline_usd,'aspectRatio',p_aspect_ratio,'testingSelection',p_testing_selection))||adult_metadata
  );
  return jsonb_build_object('mediaId',video_id,'transactionId',transaction_id,'idempotent',false,'permanentBalance',account.permanent_balance,'subscriptionBalance',account.subscription_balance,'total',account.permanent_balance+account.subscription_balance);
end $$;

revoke all on function public.kivelle_reserve_video_generation_v6(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,boolean,integer,boolean,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_reserve_video_generation_v6(uuid,uuid,uuid,text,text,text,text,text,text,text,integer,numeric,numeric,integer,text,text,boolean,text,text,text,boolean,integer,boolean,uuid) to service_role;

commit;
