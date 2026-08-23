begin;

create or replace function public.kivelle_ops_terminate_media_job(
  p_job_id uuid,
  p_failure_code text,
  p_failure_reason_safe text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  job public.together_media_provider_jobs;
  media public.together_generated_media;
  transaction_id uuid;
  next_metadata jsonb;
  current_time timestamptz := clock_timestamp();
begin
  select * into job
  from public.together_media_provider_jobs
  where id=p_job_id
  for update;

  if job.id is null then raise exception 'media provider job not found'; end if;
  if job.status in('completed','failed','cancelled') then
    return jsonb_build_object('ended',false,'alreadyEnded',true,'jobId',job.id,'userId',job.user_id);
  end if;
  if job.generated_media_id is null then
    raise exception 'only generated media jobs can be terminated through operations';
  end if;

  select * into media
  from public.together_generated_media
  where id=job.generated_media_id
  for update;

  if media.id is null then raise exception 'generated media request not found'; end if;
  if media.status not in('queued','generating') then
    raise exception 'generated media request is no longer active';
  end if;

  next_metadata := coalesce(media.metadata,'{}'::jsonb);
  begin
    transaction_id := nullif(next_metadata->>'creditTransactionId','')::uuid;
  exception when invalid_text_representation then
    transaction_id := null;
  end;

  if transaction_id is not null and coalesce(next_metadata->>'creditRefunded','false')<>'true' then
    perform public.kivelle_refund_credit_transaction(
      media.user_id,
      transaction_id,
      'refund:'||transaction_id::text,
      jsonb_build_object('reason','ops_terminated_media','mediaId',media.id,'failureCode',left(p_failure_code,100))
    );
    next_metadata := next_metadata||jsonb_build_object('creditRefunded',true,'creditRefundedAt',current_time);
  end if;

  update public.together_media_provider_jobs set
    status='failed',
    failure_code=left(p_failure_code,100),
    failure_reason_safe=left(p_failure_reason_safe,500),
    poll_lease_token=null,
    poll_lease_expires_at=null,
    finalization_lease_token=null,
    finalization_lease_expires_at=null,
    provider_metadata=coalesce(provider_metadata,'{}'::jsonb)||jsonb_build_object('opsTerminated',true),
    updated_at=current_time
  where id=job.id;

  update public.together_generated_media set
    status='failed',
    failure_code=left(p_failure_code,100),
    failure_reason_safe=left(p_failure_reason_safe,500),
    claimed_at=null,
    next_attempt_at=null,
    metadata=next_metadata,
    updated_at=current_time
  where id=media.id;

  update public.together_media_usage_events set
    success=false,
    failure_code=left(p_failure_code,100),
    updated_at=current_time
  where provider_job_id=job.id and success is null;

  if media.media_offer_id is not null then
    update public.together_media_offers set
      status='failed',
      failure_code=left(p_failure_code,100),
      failure_reason_safe=left(p_failure_reason_safe,500),
      credit_refunded=coalesce(next_metadata->>'creditRefunded','false')='true',
      updated_at=current_time
    where id=media.media_offer_id and user_id=media.user_id and status in('accepted','failed');
  end if;

  return jsonb_build_object(
    'ended',true,
    'alreadyEnded',false,
    'jobId',job.id,
    'mediaId',media.id,
    'userId',media.user_id,
    'creditRefunded',coalesce(next_metadata->>'creditRefunded','false')='true'
  );
end;
$$;

revoke all on function public.kivelle_ops_terminate_media_job(uuid,text,text) from public,anon,authenticated;
grant execute on function public.kivelle_ops_terminate_media_job(uuid,text,text) to service_role;

comment on function public.kivelle_ops_terminate_media_job(uuid,text,text) is 'Atomically ends one active generated-media provider job and restores its exact credit transaction.';

commit;
