begin;

create or replace function public.kivelle_reconcile_daily_photo_allowance(
  p_user_id uuid,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  -- A completed asset owns the benefit even if a worker stopped between
  -- fulfilling the offer and flipping the reservation to consumed.
  update public.together_daily_photo_allowance_claims claim
    set status='consumed',
        consumed_at=coalesce(claim.consumed_at,p_now),
        updated_at=p_now
  where claim.user_id=p_user_id
    and claim.status='reserved'
    and claim.reservation_key like 'offer:%'
    and exists(
      select 1
      from public.together_media_offers offer
      left join public.together_generated_media media on media.id=offer.generated_media_id
      where 'offer:'||offer.id::text=claim.reservation_key
        and offer.user_id=p_user_id
        and (offer.status='fulfilled' or media.status='ready')
    );

  -- If a request reserved the daily benefit but crashed before creating its
  -- media row, put the offer back into its ordinary pending state before the
  -- claim is released. This prevents an abandoned zero-credit offer from
  -- outliving the allowance reservation that authorized it.
  update public.together_media_offers offer
    set status='pending',
        credit_cost=10,
        included_subscription_benefit=false,
        included_benefit_type=null,
        subscription_tier_at_creation=null,
        acceptance_request_id=null,
        credit_transaction_id=null,
        accepted_at=null,
        failure_code=null,
        failure_reason_safe=null,
        credit_refunded=false,
        preview_metadata=(coalesce(offer.preview_metadata,'{}'::jsonb)
          - 'dailyPhotoReservationKey'
          - 'dailyPhotoBenefitDate'
          - 'dailyPhotoAllowanceLimit'
          - 'dailyPhotoAllowanceRemaining'
          - 'dailyPhotoAllowanceTimezone'
          - 'dailyPhotoAllowanceResetsAt')
          || jsonb_build_object('dailyPhotoBenefitReleasedAt',p_now),
        updated_at=p_now
  from public.together_daily_photo_allowance_claims claim
  where claim.user_id=p_user_id
    and claim.status='reserved'
    and claim.reservation_key='offer:'||offer.id::text
    and claim.reserved_at<p_now-interval '30 minutes'
    and offer.user_id=p_user_id
    and offer.source='user_request'
    and offer.included_subscription_benefit
    and offer.included_benefit_type='daily_companion_photo'
    and offer.status in('pending','accepted')
    and offer.generated_media_id is null;

  -- Keep failed media retryable, while making its offer accurately terminal.
  update public.together_media_offers offer
    set status='failed',
        failure_code=coalesce(offer.failure_code,'generation_failed'),
        failure_reason_safe=coalesce(offer.failure_reason_safe,'That photo did not finish. You can retry it.'),
        updated_at=p_now
  from public.together_daily_photo_allowance_claims claim,
       public.together_generated_media media
  where claim.user_id=p_user_id
    and claim.status='reserved'
    and claim.reservation_key='offer:'||offer.id::text
    and offer.user_id=p_user_id
    and offer.generated_media_id=media.id
    and media.user_id=p_user_id
    and media.status='failed'
    and offer.status in('pending','accepted');

  -- Release reservations whose work ended unsuccessfully. Also recover the
  -- narrow crash window after reservation but before a media row was linked.
  -- Active work protects its reservation regardless of an offer-status lag.
  delete from public.together_daily_photo_allowance_claims claim
  where claim.user_id=p_user_id
    and claim.status='reserved'
    and claim.reservation_key like 'offer:%'
    and (
      exists(
        select 1
        from public.together_media_offers offer
        left join public.together_generated_media media on media.id=offer.generated_media_id
        where 'offer:'||offer.id::text=claim.reservation_key
          and offer.user_id=p_user_id
          and (offer.status in('declined','expired','failed') or media.status='failed')
      )
      or (
        claim.reserved_at<p_now-interval '30 minutes'
        and not exists(
          select 1
          from public.together_media_offers offer
          join public.together_generated_media media on media.id=offer.generated_media_id
          where 'offer:'||offer.id::text=claim.reservation_key
            and offer.user_id=p_user_id
            and media.status in('queued','generating','ready')
        )
      )
    );
end $$;

revoke all on function public.kivelle_reconcile_daily_photo_allowance(uuid,timestamptz)
  from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_daily_photo_allowance(uuid,timestamptz)
  to service_role;

comment on function public.kivelle_reconcile_daily_photo_allowance(uuid,timestamptz) is
  'Consumes delivered daily-photo reservations, releases terminal failures, and safely resets abandoned offers before releasing crash-window claims.';

commit;
