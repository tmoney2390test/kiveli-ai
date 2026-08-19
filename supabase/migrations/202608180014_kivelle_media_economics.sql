begin;

create table if not exists public.together_media_offers(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid references public.together_conversations(id) on delete cascade,
  message_id uuid references public.together_messages(id) on delete set null,
  life_event_id uuid references public.together_life_events(id) on delete cascade,
  date_session_id uuid references public.together_date_sessions(id) on delete cascade,
  moment_id uuid references public.together_moments(id) on delete cascade,
  story_arc_id uuid references public.together_story_arc_instances(id) on delete cascade,
  scene_session_id uuid references public.together_scene_sessions(id) on delete cascade,
  shared_plan_id uuid references public.together_shared_plans(id) on delete cascade,
  offer_key text not null,
  source text not null check(source in('life_event','story','moment','date')),
  status text not null default 'pending' check(status in('pending','accepted','declined','expired','fulfilled','failed')),
  content_level text not null default 'standard' check(content_level in('standard','romance','suggestive','mature','explicit')),
  quality_tier text not null default 'standard' check(quality_tier in('economy','standard','premium')),
  shot_type text not null default 'scene' check(shot_type in('selfie','portrait','candid','full_body','scene')),
  credit_action text not null default 'companion_photo' check(credit_action='companion_photo'),
  credit_cost integer not null default 10 check(credit_cost in(0,10)),
  title text not null,
  companion_message text not null,
  preview_metadata jsonb not null default '{}'::jsonb,
  included_subscription_benefit boolean not null default false,
  included_benefit_type text check(included_benefit_type is null or included_benefit_type='date_completion_photo'),
  subscription_tier_at_creation text not null default 'free' check(subscription_tier_at_creation in('free','kivelle_plus','kivelle_max')),
  acceptance_request_id text,
  credit_transaction_id uuid references public.together_credit_ledger(id) on delete set null,
  credit_refunded boolean not null default false,
  expires_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  generated_media_id uuid references public.together_generated_media(id) on delete set null,
  failure_code text,
  failure_reason_safe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,offer_key),
  check((included_subscription_benefit and source='date' and credit_cost=0 and included_benefit_type='date_completion_photo') or (not included_subscription_benefit and credit_cost=10 and included_benefit_type is null))
);
create index if not exists together_media_offers_pending_idx on public.together_media_offers(user_id,continuity_id,status,created_at desc);
create index if not exists together_media_offers_character_idx on public.together_media_offers(character_instance_id,status,created_at desc);
create index if not exists together_media_offers_expiry_idx on public.together_media_offers(expires_at) where status='pending' and expires_at is not null;
create unique index if not exists together_media_offers_date_benefit_idx on public.together_media_offers(user_id,date_session_id) where source='date' and date_session_id is not null;
alter table public.together_media_offers enable row level security;
drop policy if exists together_media_offers_own_read on public.together_media_offers;
create policy together_media_offers_own_read on public.together_media_offers for select to authenticated using(auth.uid()=user_id);
revoke all on public.together_media_offers from public,anon,authenticated;
grant select on public.together_media_offers to authenticated;
grant select,insert,update,delete on public.together_media_offers to service_role;

alter table public.together_generated_media add column if not exists media_offer_id uuid references public.together_media_offers(id) on delete set null;
create unique index if not exists together_generated_media_offer_idx on public.together_generated_media(media_offer_id) where media_offer_id is not null;

create table if not exists public.together_media_usage_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  continuity_id uuid references public.together_continuities(id) on delete set null,
  character_instance_id uuid references public.together_character_instances(id) on delete set null,
  conversation_id uuid references public.together_conversations(id) on delete set null,
  generated_media_id uuid references public.together_generated_media(id) on delete set null,
  media_offer_id uuid references public.together_media_offers(id) on delete set null,
  provider_job_id uuid references public.together_media_provider_jobs(id) on delete set null,
  subscription_tier text not null default 'free' check(subscription_tier in('free','kivelle_plus','kivelle_max')),
  provider text not null,
  model text not null,
  route_id text not null,
  source text not null,
  content_level text not null,
  quality_tier text not null,
  credit_action text,
  credit_cost integer not null default 0 check(credit_cost>=0),
  credit_funded boolean not null default false,
  included_subscription_benefit boolean not null default false,
  included_benefit_type text,
  estimated_provider_cost_usd numeric(12,6),
  actual_provider_cost_usd numeric(12,6),
  cost_is_estimate boolean not null default true,
  generation_ms integer,
  attempt_number integer not null default 1 check(attempt_number between 1 and 20),
  quality_retry boolean not null default false,
  success boolean,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_job_id,attempt_number)
);
create index if not exists together_media_usage_created_idx on public.together_media_usage_events(created_at desc);
create index if not exists together_media_usage_provider_idx on public.together_media_usage_events(provider,created_at desc);
create index if not exists together_media_usage_route_idx on public.together_media_usage_events(route_id,created_at desc);
create index if not exists together_media_usage_tier_idx on public.together_media_usage_events(subscription_tier,created_at desc);
create index if not exists together_media_usage_source_idx on public.together_media_usage_events(source,created_at desc);
create index if not exists together_media_usage_media_idx on public.together_media_usage_events(generated_media_id,attempt_number);
alter table public.together_media_usage_events enable row level security;
revoke all on public.together_media_usage_events from public,anon,authenticated;
grant select,insert,update,delete on public.together_media_usage_events to service_role;

create or replace function public.kivelle_accept_media_offer(p_user_id uuid,p_offer_id uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare offer public.together_media_offers; spend jsonb; total integer;
begin
  select * into offer from public.together_media_offers where id=p_offer_id and user_id=p_user_id for update;
  if offer.id is null then raise exception using errcode='P0002',message='MEDIA_OFFER_NOT_FOUND'; end if;
  if offer.status in('accepted','fulfilled') then
    select permanent_balance+subscription_balance into total from public.together_credit_accounts where user_id=p_user_id;
    return jsonb_build_object('state','accepted','idempotent',true,'creditTransactionId',offer.credit_transaction_id,'creditBalance',coalesce(total,0));
  end if;
  if offer.status<>'pending' then raise exception using errcode='P0001',message='MEDIA_OFFER_NOT_PENDING'; end if;
  if offer.expires_at is not null and offer.expires_at<=now() then
    update public.together_media_offers set status='expired',updated_at=now() where id=offer.id;
    return jsonb_build_object('state','expired');
  end if;
  if offer.credit_cost>0 then
    begin
      spend:=public.kivelle_spend_credits(p_user_id,offer.credit_cost,'media-offer:'||offer.id::text,'media_offer',offer.id::text,jsonb_build_object('action',offer.credit_action,'source',offer.source));
    exception when sqlstate 'P0001' then
      if sqlerrm='INSUFFICIENT_KIVELLE_CREDITS' then
        select permanent_balance+subscription_balance into total from public.together_credit_accounts where user_id=p_user_id;
        return jsonb_build_object('state','needs_credits','required',offer.credit_cost,'creditBalance',coalesce(total,0));
      end if;
      raise;
    end;
  else
    select permanent_balance+subscription_balance into total from public.together_credit_accounts where user_id=p_user_id;
    spend:=jsonb_build_object('transactionId',null,'total',coalesce(total,0));
  end if;
  update public.together_media_offers set status='accepted',acceptance_request_id=p_request_id,credit_transaction_id=nullif(spend->>'transactionId','')::uuid,accepted_at=now(),updated_at=now() where id=offer.id;
  return jsonb_build_object('state','accepted','idempotent',false,'creditTransactionId',spend->>'transactionId','creditBalance',coalesce((spend->>'total')::integer,total,0));
end $$;
revoke all on function public.kivelle_accept_media_offer(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelle_accept_media_offer(uuid,uuid,text) to service_role;

comment on table public.together_media_offers is 'Provider-free contextual photo opportunities. No generated media or provider request exists before acceptance, except bounded included benefits.';
comment on table public.together_media_usage_events is 'Operational media COGS ledger. Prompt content and provider credentials are intentionally excluded.';

do $$ begin
  alter publication supabase_realtime add table public.together_media_offers;
exception when duplicate_object then null;
end $$;

commit;
