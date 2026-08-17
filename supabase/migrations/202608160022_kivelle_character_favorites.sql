begin;

-- Favorites are an account-level catalog preference. They intentionally do not
-- belong to a continuity: choosing a different Kivelle Life should not make a
-- person's saved character list disappear.
create table if not exists public.together_character_favorites(
  user_id uuid not null references auth.users(id) on delete cascade,
  character_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,character_template_id)
);

create index if not exists together_character_favorites_user_created_idx
  on public.together_character_favorites(user_id,created_at desc);

alter table public.together_character_favorites enable row level security;
drop policy if exists together_character_favorites_own_read on public.together_character_favorites;
create policy together_character_favorites_own_read
  on public.together_character_favorites
  for select to authenticated
  using(user_id=auth.uid());

-- Writes remain server-owned so clients cannot favorite unpublished/private
-- characters they do not own. together-companion validates catalog access.
grant select on public.together_character_favorites to authenticated;

comment on table public.together_character_favorites is
  'Account-owned saved character templates. Relationship state remains continuity-scoped.';

commit;
