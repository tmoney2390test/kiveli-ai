create table if not exists public.together_relationship_milestones(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  kind text not null check(kind in('keep_in_touch','friendship_deepened','romantic_spark','first_date_invitation','repair')),
  from_stage text not null check(from_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  to_stage text check(to_stage is null or to_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  status text not null default 'pending' check(status in('pending','accepted','deferred','declined','completed')),
  eligibility_key text not null,
  title text not null,
  body text not null,
  prompt text not null,
  choices jsonb not null default '[]'::jsonb check(jsonb_typeof(choices)='array'),
  chosen_action text,
  source_message_id uuid references public.together_messages(id) on delete set null,
  deferred_until timestamptz,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_instance_id,eligibility_key)
);

create unique index if not exists together_relationship_one_pending_idx on public.together_relationship_milestones(character_instance_id) where status='pending';
create index if not exists together_relationship_milestones_user_idx on public.together_relationship_milestones(user_id,status,created_at desc);

alter table public.together_relationship_milestones enable row level security;
drop policy if exists together_relationship_milestones_own_read on public.together_relationship_milestones;
create policy together_relationship_milestones_own_read on public.together_relationship_milestones for select to authenticated using(user_id=auth.uid());
grant select on table public.together_relationship_milestones to authenticated;

comment on table public.together_relationship_milestones is 'Server-owned narrative gates for relationship and date progression. Models may provide dialogue, but cannot resolve these gates.';
