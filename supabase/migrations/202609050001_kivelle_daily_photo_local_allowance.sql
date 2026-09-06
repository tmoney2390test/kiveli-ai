begin;

alter table public.together_daily_photo_allowance_claims
  add column if not exists benefit_timezone text not null default 'UTC',
  add column if not exists period_ends_at timestamptz;

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

  -- Release reservations whose work ended unsuccessfully. Also recover the
  -- narrow crash window after reservation but before a media row was linked.
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
        claim.reserved_at < p_now-interval '30 minutes'
        and not exists(
          select 1
          from public.together_media_offers offer
          left join public.together_generated_media media on media.id=offer.generated_media_id
          where 'offer:'||offer.id::text=claim.reservation_key
            and offer.user_id=p_user_id
            and offer.status in('accepted','fulfilled')
            and media.status in('queued','generating','ready')
        )
      )
    );
end $$;

create or replace function public.kivelle_daily_photo_allowance_status(
  p_user_id uuid,
  p_daily_limit integer,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  requested_timezone text;
  timezone_name text:='UTC';
  claim_date date;
  reset_at timestamptz;
  used_count integer:=0;
begin
  if p_user_id is null then
    raise exception using errcode='22023',message='INVALID_DAILY_PHOTO_USER';
  end if;

  select profile.experience_timezone into requested_timezone
    from public.together_profiles profile
    where profile.user_id=p_user_id;
  select name into timezone_name
    from pg_timezone_names
    where name=coalesce(requested_timezone,'UTC')
    limit 1;
  timezone_name:=coalesce(timezone_name,'UTC');
  claim_date:=(p_now at time zone timezone_name)::date;
  reset_at:=((claim_date+1)::timestamp at time zone timezone_name);

  perform public.kivelle_reconcile_daily_photo_allowance(p_user_id,p_now);

  if p_daily_limit>0 then
    select count(*) into used_count
      from public.together_daily_photo_allowance_claims claim
      where claim.user_id=p_user_id
        and (claim.reserved_at at time zone timezone_name)::date=claim_date;
  end if;

  return jsonb_build_object(
    'limit',greatest(coalesce(p_daily_limit,0),0),
    'used',greatest(used_count,0),
    'remaining',greatest(coalesce(p_daily_limit,0)-used_count,0),
    'benefitDate',claim_date,
    'timezone',timezone_name,
    'resetsAt',reset_at
  );
end $$;

create or replace function public.kivelle_claim_daily_photo_allowance(
  p_user_id uuid,
  p_reservation_key text,
  p_daily_limit integer,
  p_tier text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  requested_timezone text;
  timezone_name text:='UTC';
  claim_date date;
  reset_at timestamptz;
  existing public.together_daily_photo_allowance_claims;
  used_count integer:=0;
  next_slot integer;
begin
  if p_user_id is null or char_length(coalesce(p_reservation_key,'')) not between 8 and 180 then
    raise exception using errcode='22023',message='INVALID_DAILY_PHOTO_RESERVATION';
  end if;

  select profile.experience_timezone into requested_timezone
    from public.together_profiles profile
    where profile.user_id=p_user_id;
  select name into timezone_name
    from pg_timezone_names
    where name=coalesce(requested_timezone,'UTC')
    limit 1;
  timezone_name:=coalesce(timezone_name,'UTC');
  claim_date:=(p_now at time zone timezone_name)::date;
  reset_at:=((claim_date+1)::timestamp at time zone timezone_name);

  if p_daily_limit not between 1 and 10 or p_tier not in('kivelle_plus','kivelle_max') then
    return jsonb_build_object('claimed',false,'remaining',0,'benefitDate',claim_date,'timezone',timezone_name,'resetsAt',reset_at);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||claim_date::text,0));
  perform public.kivelle_reconcile_daily_photo_allowance(p_user_id,p_now);

  -- Reservation keys are globally idempotent for a user, even across a local
  -- midnight or a timezone correction.
  select * into existing
    from public.together_daily_photo_allowance_claims
    where user_id=p_user_id and reservation_key=p_reservation_key
    order by reserved_at desc
    limit 1;
  if existing.id is not null then
    select count(*) into used_count
      from public.together_daily_photo_allowance_claims claim
      where claim.user_id=p_user_id
        and (claim.reserved_at at time zone timezone_name)::date=claim_date;
    return jsonb_build_object('claimed',true,'idempotent',true,'status',existing.status,'slot',existing.slot_number,'remaining',greatest(p_daily_limit-used_count,0),'benefitDate',claim_date,'timezone',timezone_name,'resetsAt',reset_at);
  end if;

  select count(*) into used_count
    from public.together_daily_photo_allowance_claims claim
    where claim.user_id=p_user_id
      and (claim.reserved_at at time zone timezone_name)::date=claim_date;
  if used_count>=p_daily_limit then
    return jsonb_build_object('claimed',false,'remaining',0,'benefitDate',claim_date,'timezone',timezone_name,'resetsAt',reset_at);
  end if;

  -- Legacy UTC-day claims may occupy today's low slot numbers. Pick any free
  -- storage slot while the local-day count remains the actual allowance gate.
  select candidate into next_slot
    from generate_series(1,10) candidate
    where not exists(
      select 1 from public.together_daily_photo_allowance_claims claim
      where claim.user_id=p_user_id and claim.benefit_date=claim_date and claim.slot_number=candidate
    )
    order by candidate limit 1;
  if next_slot is null then
    return jsonb_build_object('claimed',false,'remaining',0,'benefitDate',claim_date,'timezone',timezone_name,'resetsAt',reset_at);
  end if;

  insert into public.together_daily_photo_allowance_claims(
    user_id,benefit_date,reservation_key,slot_number,subscription_tier,
    limit_at_claim,benefit_timezone,period_ends_at,reserved_at
  ) values(
    p_user_id,claim_date,p_reservation_key,next_slot,p_tier,
    p_daily_limit,timezone_name,reset_at,p_now
  ) returning * into existing;
  return jsonb_build_object('claimed',true,'idempotent',false,'status','reserved','slot',existing.slot_number,'remaining',greatest(p_daily_limit-used_count-1,0),'benefitDate',claim_date,'timezone',timezone_name,'resetsAt',reset_at);
end $$;

create or replace function public.kivelle_prepare_daily_photo_offer(
  p_user_id uuid,
  p_offer_id uuid,
  p_daily_limit integer,
  p_tier text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  offer public.together_media_offers;
  reservation_key text:='offer:'||p_offer_id::text;
  claim jsonb;
begin
  select * into offer from public.together_media_offers
    where id=p_offer_id and user_id=p_user_id for update;
  if offer.id is null then raise exception using errcode='P0002',message='MEDIA_OFFER_NOT_FOUND'; end if;
  if offer.source<>'user_request' then raise exception using errcode='P0001',message='DAILY_PHOTO_REQUIRES_USER_REQUEST'; end if;
  if offer.included_subscription_benefit and offer.included_benefit_type='daily_companion_photo' then
    claim:=public.kivelle_daily_photo_allowance_status(p_user_id,p_daily_limit,p_now);
    return claim||jsonb_build_object('claimed',true,'idempotent',true,'offerId',offer.id);
  end if;
  if offer.status<>'pending' then raise exception using errcode='P0001',message='MEDIA_OFFER_NOT_PENDING'; end if;
  if offer.expires_at is not null and offer.expires_at<=p_now then
    update public.together_media_offers set status='expired',updated_at=p_now where id=offer.id;
    return jsonb_build_object('claimed',false,'expired',true,'offerId',offer.id);
  end if;

  claim:=public.kivelle_claim_daily_photo_allowance(p_user_id,reservation_key,p_daily_limit,p_tier,p_now);
  if not coalesce((claim->>'claimed')::boolean,false) then return claim; end if;

  update public.together_media_offers set
    credit_cost=0,
    included_subscription_benefit=true,
    included_benefit_type='daily_companion_photo',
    subscription_tier_at_creation=p_tier,
    preview_metadata=coalesce(preview_metadata,'{}'::jsonb)||jsonb_build_object(
      'dailyPhotoReservationKey',reservation_key,
      'dailyPhotoBenefitDate',claim->>'benefitDate',
      'dailyPhotoAllowanceLimit',p_daily_limit,
      'dailyPhotoAllowanceRemaining',coalesce((claim->>'remaining')::integer,0),
      'dailyPhotoAllowanceTimezone',claim->>'timezone',
      'dailyPhotoAllowanceResetsAt',claim->>'resetsAt'
    ),
    updated_at=p_now
    where id=offer.id;
  return claim||jsonb_build_object('offerId',offer.id);
end $$;

revoke all on function public.kivelle_reconcile_daily_photo_allowance(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.kivelle_daily_photo_allowance_status(uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_reconcile_daily_photo_allowance(uuid,timestamptz) to service_role;
grant execute on function public.kivelle_daily_photo_allowance_status(uuid,integer,timestamptz) to service_role;

comment on table public.together_daily_photo_allowance_claims is
  'Server-owned, account-local-day reservations for included companion photos. Terminal failures release reservations; delivered photos are consumed.';
comment on function public.kivelle_daily_photo_allowance_status(uuid,integer,timestamptz) is
  'Returns the authoritative included-photo allowance and next reset in the account experience timezone.';

commit;
