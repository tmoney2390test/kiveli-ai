-- Kivelle living-world integrity: each relationship has a real start date and
-- each profile may explicitly choose its primary companion.
alter table public.together_character_instances
  add column if not exists met_at timestamptz;

update public.together_character_instances
set met_at = coalesce(contact_added_at, introduced_at, created_at, now())
where met_at is null;

alter table public.together_character_instances
  alter column met_at set default now();

alter table public.together_character_instances
  alter column met_at set not null;

alter table public.together_profiles
  add column if not exists active_companion_instance_id uuid references public.together_character_instances(id) on delete set null;

update public.together_profiles profile
set active_companion_instance_id = (
  select instance.id
  from public.together_character_instances instance
  where instance.user_id = profile.user_id
  order by (instance.contact_added_at is not null) desc, instance.met_at asc, instance.created_at asc
  limit 1
)
where profile.active_companion_instance_id is null;

create index if not exists together_instances_user_met_at_idx
  on public.together_character_instances(user_id, met_at asc);

comment on column public.together_character_instances.met_at is
  'Calendar start of this user-specific relationship. Used for qualitative Day N presentation, never conversation count.';
comment on column public.together_profiles.active_companion_instance_id is
  'The relationship selected for primary companion surfaces. Must belong to the same user and is validated server-side.';
