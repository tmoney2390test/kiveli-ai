-- Restored verbatim from the production migration record. This migration was
-- applied by another Codex deployment before its source reached this branch.

create table if not exists public.together_photo_offers(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  assistant_message_id uuid references public.together_messages(id) on delete set null,
  photo_opportunity_slug text references public.together_photo_opportunities(slug) on delete set null,
  media_id uuid references public.together_generated_media(id) on delete set null,
  status text not null default 'offered' check(status in ('offered','accepted','declined','expired')),
  offer_text text not null,
  request_text text not null,
  credit_cost integer not null default 10 check(credit_cost >= 0),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  declined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists together_photo_offers_conversation_idx
  on public.together_photo_offers(user_id,conversation_id,status,created_at desc);

create index if not exists together_photo_offers_character_idx
  on public.together_photo_offers(user_id,character_instance_id,created_at desc);

create unique index if not exists together_photo_offers_one_open_idx
  on public.together_photo_offers(user_id,conversation_id)
  where status='offered';

alter table public.together_photo_offers enable row level security;

drop policy if exists "Users read their photo offers" on public.together_photo_offers;
drop policy if exists "Users create their photo offers" on public.together_photo_offers;
drop policy if exists "Users update their photo offers" on public.together_photo_offers;

create policy "Users read their photo offers"
  on public.together_photo_offers for select
  using(auth.uid()=user_id);

comment on table public.together_photo_offers is
  'Persisted, consent-first companion photo proposals. Clients may read their offers; only trusted server routes may mutate consent or generation state.';
