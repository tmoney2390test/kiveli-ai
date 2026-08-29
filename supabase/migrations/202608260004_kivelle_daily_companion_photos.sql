begin;

create table if not exists public.together_daily_photo_allowance_claims(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  benefit_date date not null,
  reservation_key text not null check(char_length(reservation_key) between 8 and 180),
  slot_number integer not null check(slot_number between 1 and 10),
  subscription_tier text not null check(subscription_tier in('kivelle_plus','kivelle_max')),
  limit_at_claim integer not null check(limit_at_claim between 1 and 10),
  status text not null default 'reserved' check(status in('reserved','consumed')),
  reserved_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,benefit_date,reservation_key),
  unique(user_id,benefit_date,slot_number),
  check((status='reserved' and consumed_at is null) or (status='consumed' and consumed_at is not null))
);

create index if not exists together_daily_photo_claims_user_day_idx
  on public.together_daily_photo_allowance_claims(user_id,benefit_date,status);

alter table public.together_daily_photo_allowance_claims enable row level security;
revoke all on public.together_daily_photo_allowance_claims from public,anon,authenticated;
grant select,insert,update,delete on public.together_daily_photo_allowance_claims to service_role;

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
  claim_date date:=(p_now at time zone 'UTC')::date;
  existing public.together_daily_photo_allowance_claims;
  used_count integer;
  next_slot integer;
begin
  if p_user_id is null or char_length(coalesce(p_reservation_key,'')) not between 8 and 180 then
    raise exception using errcode='22023',message='INVALID_DAILY_PHOTO_RESERVATION';
  end if;
  if p_daily_limit not between 1 and 10 or p_tier not in('kivelle_plus','kivelle_max') then
    return jsonb_build_object('claimed',false,'remaining',0,'benefitDate',claim_date);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||claim_date::text,0));
  select * into existing
    from public.together_daily_photo_allowance_claims
    where user_id=p_user_id and benefit_date=claim_date and reservation_key=p_reservation_key;
  if existing.id is not null then
    select count(*) into used_count from public.together_daily_photo_allowance_claims
      where user_id=p_user_id and benefit_date=claim_date;
    return jsonb_build_object('claimed',true,'idempotent',true,'status',existing.status,'slot',existing.slot_number,'remaining',greatest(p_daily_limit-used_count,0),'benefitDate',claim_date);
  end if;

  select count(*) into used_count from public.together_daily_photo_allowance_claims
    where user_id=p_user_id and benefit_date=claim_date;
  if used_count>=p_daily_limit then
    return jsonb_build_object('claimed',false,'remaining',0,'benefitDate',claim_date);
  end if;

  select candidate into next_slot
    from generate_series(1,p_daily_limit) candidate
    where not exists(
      select 1 from public.together_daily_photo_allowance_claims c
      where c.user_id=p_user_id and c.benefit_date=claim_date and c.slot_number=candidate
    )
    order by candidate limit 1;
  insert into public.together_daily_photo_allowance_claims(user_id,benefit_date,reservation_key,slot_number,subscription_tier,limit_at_claim)
    values(p_user_id,claim_date,p_reservation_key,next_slot,p_tier,p_daily_limit)
    returning * into existing;
  return jsonb_build_object('claimed',true,'idempotent',false,'status','reserved','slot',existing.slot_number,'remaining',greatest(p_daily_limit-used_count-1,0),'benefitDate',claim_date);
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
    return jsonb_build_object('claimed',true,'idempotent',true,'offerId',offer.id);
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
    preview_metadata=coalesce(preview_metadata,'{}'::jsonb)||jsonb_build_object('dailyPhotoReservationKey',reservation_key,'dailyPhotoBenefitDate',claim->>'benefitDate','dailyPhotoAllowanceLimit',p_daily_limit,'dailyPhotoAllowanceRemaining',coalesce((claim->>'remaining')::integer,0)),
    updated_at=p_now
    where id=offer.id;
  return claim||jsonb_build_object('offerId',offer.id);
end $$;

create or replace function public.kivelle_release_daily_photo_allowance(
  p_user_id uuid,
  p_reservation_key text
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare removed integer;
begin
  delete from public.together_daily_photo_allowance_claims
    where user_id=p_user_id and reservation_key=p_reservation_key and status='reserved';
  get diagnostics removed=row_count;
  return removed>0;
end $$;

create or replace function public.kivelle_consume_daily_photo_allowance(
  p_user_id uuid,
  p_reservation_key text,
  p_now timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare affected integer; already_consumed boolean;
begin
  update public.together_daily_photo_allowance_claims
    set status='consumed',consumed_at=p_now,updated_at=p_now
    where user_id=p_user_id and reservation_key=p_reservation_key and status='reserved';
  get diagnostics affected=row_count;
  if affected>0 then return true; end if;
  select exists(select 1 from public.together_daily_photo_allowance_claims where user_id=p_user_id and reservation_key=p_reservation_key and status='consumed') into already_consumed;
  return already_consumed;
end $$;

revoke all on function public.kivelle_claim_daily_photo_allowance(uuid,text,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function public.kivelle_prepare_daily_photo_offer(uuid,uuid,integer,text,timestamptz) from public,anon,authenticated;
revoke all on function public.kivelle_release_daily_photo_allowance(uuid,text) from public,anon,authenticated;
revoke all on function public.kivelle_consume_daily_photo_allowance(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_claim_daily_photo_allowance(uuid,text,integer,text,timestamptz) to service_role;
grant execute on function public.kivelle_prepare_daily_photo_offer(uuid,uuid,integer,text,timestamptz) to service_role;
grant execute on function public.kivelle_release_daily_photo_allowance(uuid,text) to service_role;
grant execute on function public.kivelle_consume_daily_photo_allowance(uuid,text,timestamptz) to service_role;

alter table public.together_media_offers
  drop constraint if exists together_media_offers_included_benefit_type_check,
  drop constraint if exists together_media_offers_benefit_check;

alter table public.together_media_offers
  add constraint together_media_offers_included_benefit_type_check
    check(included_benefit_type is null or included_benefit_type in('date_completion_photo','daily_companion_photo')),
  add constraint together_media_offers_benefit_check
    check(
      (included_subscription_benefit and source='date' and credit_cost=0 and included_benefit_type='date_completion_photo')
      or
      (included_subscription_benefit and source='user_request' and credit_cost=0 and included_benefit_type='daily_companion_photo')
      or
      (not included_subscription_benefit and included_benefit_type is null)
    );

comment on table public.together_daily_photo_allowance_claims is 'Server-owned UTC-day reservations for successful included companion photos. Failed or declined work releases reserved rows; delivered photos become consumed.';

commit;
