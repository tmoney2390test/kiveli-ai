begin;

create table if not exists public.together_user_personas(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 50),
  display_name text not null check(char_length(display_name) between 1 and 50),
  pronouns text check(pronouns is null or char_length(pronouns)<=40),
  age integer check(age is null or age>=18),
  occupation text check(occupation is null or char_length(occupation)<=100),
  biography text check(biography is null or char_length(biography)<=1000),
  interests text[] not null default '{}',
  appearance_config jsonb not null default '{}'::jsonb,
  communication_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists together_user_personas_one_default_idx on public.together_user_personas(user_id) where is_default;
create index if not exists together_user_personas_user_idx on public.together_user_personas(user_id,created_at);

create table if not exists public.together_continuities(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  persona_id uuid not null references public.together_user_personas(id) on delete restrict,
  kind text not null check(kind in('main','alternate')),
  title text not null check(char_length(title) between 1 and 80),
  active_companion_instance_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists together_continuities_one_main_idx on public.together_continuities(user_id) where kind='main';
create index if not exists together_continuities_user_idx on public.together_continuities(user_id,updated_at desc);

insert into public.together_user_personas(user_id,name,display_name,biography,interests,is_default,metadata)
select profile.user_id,
  coalesce(nullif(btrim(profile.display_name),''),'Main'),
  coalesce(nullif(btrim(profile.display_name),''),'You'),
  nullif(btrim(coalesce(profile.about_me,'')),''),
  coalesce(profile.interests,'{}'),true,
  jsonb_build_object('migrationSource','together_profiles','contextVersion',1)
from public.together_profiles profile
where not exists(select 1 from public.together_user_personas persona where persona.user_id=profile.user_id and persona.is_default);

insert into public.together_continuities(user_id,persona_id,kind,title,metadata)
select persona.user_id,persona.id,'main','Main Life',jsonb_build_object('migrationSource','existing_kivelle_state','contextVersion',1)
from public.together_user_personas persona
where persona.is_default and not exists(select 1 from public.together_continuities continuity where continuity.user_id=persona.user_id and continuity.kind='main');

alter table public.together_profiles add column if not exists active_continuity_id uuid references public.together_continuities(id) on delete set null;
update public.together_profiles profile set active_continuity_id=continuity.id
from public.together_continuities continuity where continuity.user_id=profile.user_id and continuity.kind='main' and profile.active_continuity_id is null;

alter table public.together_character_instances add column if not exists continuity_id uuid references public.together_continuities(id) on delete cascade;
update public.together_character_instances instance set continuity_id=continuity.id
from public.together_continuities continuity where continuity.user_id=instance.user_id and continuity.kind='main' and instance.continuity_id is null;
alter table public.together_character_instances alter column continuity_id set not null;
alter table public.together_character_instances drop constraint if exists together_character_instances_user_id_character_template_id_key;
create unique index if not exists together_character_instances_continuity_template_idx on public.together_character_instances(continuity_id,character_template_id);
create index if not exists together_character_instances_user_continuity_idx on public.together_character_instances(user_id,continuity_id,updated_at desc);

alter table public.together_continuities drop constraint if exists together_continuities_active_companion_instance_id_fkey;
alter table public.together_continuities add constraint together_continuities_active_companion_instance_id_fkey foreign key(active_companion_instance_id) references public.together_character_instances(id) on delete set null;
update public.together_continuities continuity set active_companion_instance_id=profile.active_companion_instance_id
from public.together_profiles profile
where continuity.user_id=profile.user_id and continuity.kind='main' and continuity.active_companion_instance_id is null;

create or replace function public.kivelle_validate_continuity_owner() returns trigger language plpgsql set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.together_continuities where id=new.continuity_id;
  if owner_id is null or owner_id<>new.user_id then raise exception 'continuity ownership mismatch'; end if;
  return new;
end;
$$;
drop trigger if exists together_character_instance_continuity_owner on public.together_character_instances;
create trigger together_character_instance_continuity_owner before insert or update of continuity_id,user_id on public.together_character_instances for each row execute function public.kivelle_validate_continuity_owner();

create or replace function public.kivelle_validate_continuity_active_companion() returns trigger language plpgsql set search_path=public as $$
begin
  if new.active_companion_instance_id is not null and not exists(
    select 1 from public.together_character_instances instance
    where instance.id=new.active_companion_instance_id and instance.continuity_id=new.id and instance.user_id=new.user_id
  ) then raise exception 'active companion must belong to continuity'; end if;
  return new;
end;
$$;
drop trigger if exists together_continuity_active_companion_owner on public.together_continuities;
create constraint trigger together_continuity_active_companion_owner after insert or update of active_companion_instance_id on public.together_continuities deferrable initially deferred for each row execute function public.kivelle_validate_continuity_active_companion();

create or replace function public.kivelle_fill_state_continuity() returns trigger language plpgsql set search_path=public as $$
declare instance_continuity uuid; instance_owner uuid;
begin
  select continuity_id,user_id into instance_continuity,instance_owner from public.together_character_instances where id=new.character_instance_id;
  if instance_continuity is null or instance_owner<>new.user_id then raise exception 'character state ownership mismatch'; end if;
  if new.continuity_id is not null and new.continuity_id<>instance_continuity then raise exception 'character state continuity mismatch'; end if;
  new.continuity_id=instance_continuity;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'together_relationship_states','together_relationship_milestones','together_conversations','together_memories','together_open_threads',
    'together_life_events','together_date_sessions','together_moments','together_proactive_messages','together_story_arc_instances',
    'together_generated_media','together_shared_plans','together_conversation_events','together_conversation_actions'
  ] loop
    execute format('alter table public.%I add column if not exists continuity_id uuid references public.together_continuities(id) on delete cascade',table_name);
    execute format('update public.%I state set continuity_id=instance.continuity_id from public.together_character_instances instance where state.character_instance_id=instance.id and state.continuity_id is null',table_name);
    execute format('alter table public.%I alter column continuity_id set not null',table_name);
    execute format('create index if not exists %I on public.%I(continuity_id)',table_name||'_continuity_idx',table_name);
    execute format('drop trigger if exists %I on public.%I',table_name||'_fill_continuity',table_name);
    execute format('create trigger %I before insert or update of character_instance_id,continuity_id on public.%I for each row execute function public.kivelle_fill_state_continuity()',table_name||'_fill_continuity',table_name);
  end loop;
end $$;

create table if not exists public.together_continuity_world_state(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  visit_count integer not null default 0 check(visit_count>=0),
  progression_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(continuity_id,world_id)
);

alter table public.together_character_templates drop constraint if exists together_character_templates_name_key;
alter table public.together_character_templates
  add column if not exists public_handle text,
  add column if not exists lifecycle_status text not null default 'ready',
  add column if not exists visibility text not null default 'private',
  add column if not exists relationship_goal text not null default 'either',
  add column if not exists connection_config jsonb not null default '{}'::jsonb;
update public.together_character_templates set public_handle=slug where public_handle is null;
update public.together_character_templates set visibility='public',lifecycle_status='published' where creator_id is null and published;
alter table public.together_character_templates alter column public_handle set not null;
alter table public.together_character_templates drop constraint if exists together_character_templates_lifecycle_status_check;
alter table public.together_character_templates add constraint together_character_templates_lifecycle_status_check check(lifecycle_status in('draft','ready','published','archived'));
alter table public.together_character_templates drop constraint if exists together_character_templates_visibility_check;
alter table public.together_character_templates add constraint together_character_templates_visibility_check check(visibility in('private','unlisted','public'));
alter table public.together_character_templates drop constraint if exists together_character_templates_relationship_goal_check;
alter table public.together_character_templates add constraint together_character_templates_relationship_goal_check check(relationship_goal in('friendship','romance','either'));
create unique index if not exists together_character_templates_public_handle_idx on public.together_character_templates(public_handle);
create index if not exists together_character_templates_creator_status_idx on public.together_character_templates(creator_id,lifecycle_status,updated_at desc);

alter table public.together_character_versions
  add column if not exists pronouns text,
  add column if not exists relationship_config jsonb not null default '{}'::jsonb,
  add column if not exists life_config jsonb not null default '{}'::jsonb,
  add column if not exists appearance_candidates jsonb not null default '[]'::jsonb;

alter table public.together_user_personas enable row level security;
alter table public.together_continuities enable row level security;
alter table public.together_continuity_world_state enable row level security;
drop policy if exists together_personas_own_read on public.together_user_personas;
create policy together_personas_own_read on public.together_user_personas for select to authenticated using(user_id=auth.uid());
drop policy if exists together_continuities_own_read on public.together_continuities;
create policy together_continuities_own_read on public.together_continuities for select to authenticated using(user_id=auth.uid());
drop policy if exists together_continuity_world_state_own_read on public.together_continuity_world_state;
create policy together_continuity_world_state_own_read on public.together_continuity_world_state for select to authenticated using(user_id=auth.uid());

drop policy if exists together_templates_read on public.together_character_templates;
create policy together_templates_read on public.together_character_templates for select using((published and visibility in('public','unlisted')) or creator_id=auth.uid());
drop policy if exists together_versions_read on public.together_character_versions;
create policy together_versions_read on public.together_character_versions for select using(published_at is not null or exists(select 1 from public.together_character_templates template where template.id=character_template_id and template.creator_id=auth.uid()));

grant select on public.together_user_personas,public.together_continuities,public.together_continuity_world_state to authenticated;

comment on table public.together_user_personas is 'Canonical in-world user identities. Account identity, billing, privacy and authentication remain on account-level records.';
comment on table public.together_continuities is 'Isolation boundary for one internally consistent Kivelle Life.';
comment on column public.together_character_instances.continuity_id is 'Canonical relationship-reality boundary. The same CharacterTemplate may have one instance per continuity.';
comment on column public.together_character_templates.public_handle is 'Globally stable route handle; display names are intentionally non-unique.';

commit;
