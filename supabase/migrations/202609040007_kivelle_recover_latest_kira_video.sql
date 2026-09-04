-- One-time recovery requested by the owner for the latest Kira-3 video that
-- completed at the provider but was rejected only by Kivelle's visual-quality
-- review. Provider safety, adult authorization, and private delivery checks
-- still run, and the already-refunded request is not charged again.
begin;

do $$
declare
  target_media_id uuid;
  target_job_id uuid;
  target_offer_id uuid;
  recovery_time timestamptz := clock_timestamp();
begin
  select media.id,media.media_offer_id
    into target_media_id,target_offer_id
  from public.together_generated_media media
  join public.together_character_instances instance on instance.id=media.character_instance_id
  join public.together_character_templates template on template.id=instance.character_template_id
  where template.slug='kira-3'
    and media.media_type='video'
    and media.status='failed'
    and media.failure_code='video_quality_failed'
    and media.created_at>=recovery_time-interval '14 days'
  order by media.created_at desc
  limit 1
  for update of media;

  if target_media_id is null then
    raise notice 'No recent Kira-3 video-quality rejection is eligible for recovery.';
    return;
  end if;

  select job.id into target_job_id
  from public.together_media_provider_jobs job
  where job.generated_media_id=target_media_id
    and job.job_type='video'
    and job.provider='wavespeed'
    and job.status='failed'
    and job.failure_code='video_quality_failed'
    and job.provider_request_id is not null
    and job.finalized_at is null
  order by job.created_at desc
  limit 1
  for update;

  if target_job_id is null then
    raise notice 'The latest Kira-3 video has no recoverable completed provider job.';
    return;
  end if;

  update public.together_generated_media set
    status='generating',
    failure_code=null,
    failure_reason_safe=null,
    claimed_at=null,
    next_attempt_at=null,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'videoQualityManualOverride',true,
      'videoQualityManualOverrideReason','owner_approved_minor_transient_artifact',
      'videoQualityManualOverrideAt',recovery_time
    ),
    updated_at=recovery_time
  where id=target_media_id and status='failed';

  update public.together_media_provider_jobs set
    status='processing',
    failure_code=null,
    failure_reason_safe=null,
    next_poll_at=recovery_time,
    poll_lease_token=null,
    poll_lease_expires_at=null,
    finalization_lease_token=null,
    finalization_lease_expires_at=null,
    provider_metadata=coalesce(provider_metadata,'{}'::jsonb)||jsonb_build_object(
      'opsQualityApproval',true,
      'opsQualityApprovalAt',recovery_time
    ),
    updated_at=recovery_time
  where id=target_job_id and status='failed';

  update public.together_media_usage_events set
    success=null,
    failure_code=null,
    updated_at=recovery_time
  where provider_job_id=target_job_id and success=false;

  if target_offer_id is not null then
    update public.together_media_offers set
      status='accepted',
      failure_code=null,
      failure_reason_safe=null,
      updated_at=recovery_time
    where id=target_offer_id and generated_media_id=target_media_id and status='failed';
  end if;
end;
$$;

commit;
