begin;

create or replace function public.kivelle_defer_media_submission(
  p_provider_job_id uuid,
  p_media_id uuid,
  p_failure_code text,
  p_retry_delay_ms integer
) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare
  provider_job public.together_media_provider_jobs;
  media public.together_generated_media;
  retry_at timestamptz;
begin
  if p_retry_delay_ms not between 1000 and 120000 then
    raise exception using errcode='22023',message='INVALID_MEDIA_RETRY_DELAY';
  end if;
  if char_length(trim(coalesce(p_failure_code,''))) not between 2 and 100 then
    raise exception using errcode='22023',message='INVALID_MEDIA_RETRY_CODE';
  end if;

  select * into provider_job
  from public.together_media_provider_jobs
  where id=p_provider_job_id and generated_media_id=p_media_id and status='submitting'
  for update;
  select * into media
  from public.together_generated_media
  where id=p_media_id and status='generating'
  for update;
  if provider_job.id is null or media.id is null then return false; end if;

  retry_at=clock_timestamp()+make_interval(secs=>p_retry_delay_ms/1000.0);
  update public.together_media_provider_jobs set
    status='failed',
    failure_code=left(p_failure_code,100),
    failure_reason_safe='The provider is busy. This request will retry automatically.',
    updated_at=clock_timestamp()
  where id=provider_job.id;
  update public.together_generated_media set
    status='queued',
    claimed_at=null,
    next_attempt_at=retry_at,
    failure_code=null,
    failure_reason_safe=null,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'providerSubmitRetryCount',attempt_count,
      'providerSubmitRetryAt',retry_at,
      'providerSubmitRetryReason',left(p_failure_code,100)
    ),
    updated_at=clock_timestamp()
  where id=media.id;
  return true;
end $$;

revoke all on function public.kivelle_defer_media_submission(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.kivelle_defer_media_submission(uuid,uuid,text,integer) to service_role;

commit;
