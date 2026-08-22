begin;

alter table public.together_media_offers
  drop constraint if exists together_media_offers_source_check,
  drop constraint if exists together_media_offers_credit_cost_check,
  drop constraint if exists together_media_offers_check;

alter table public.together_media_offers
  add constraint together_media_offers_source_check
    check(source in('user_request','life_event','story','moment','date')),
  add constraint together_media_offers_credit_cost_check
    check(credit_cost>=0),
  add constraint together_media_offers_benefit_check
    check(
      (included_subscription_benefit and source='date' and credit_cost=0 and included_benefit_type='date_completion_photo')
      or
      (not included_subscription_benefit and included_benefit_type is null)
    );

commit;
