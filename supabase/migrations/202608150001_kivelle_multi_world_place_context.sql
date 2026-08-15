begin;

alter table public.together_worlds
  add column if not exists access_type text not null default 'free',
  add column if not exists entitlement_key text,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists sort_order integer not null default 0,
  add column if not exists featured boolean not null default false,
  add column if not exists visual_context jsonb not null default '{}'::jsonb,
  add column if not exists default_arrival_location_id uuid;

alter table public.together_worlds drop constraint if exists together_worlds_access_type_check;
alter table public.together_worlds add constraint together_worlds_access_type_check
  check(access_type in ('free','subscription','premium'));

alter table public.together_locations
  add column if not exists parent_location_id uuid references public.together_locations(id) on delete set null,
  add column if not exists location_type text not null default 'venue',
  add column if not exists sort_order integer not null default 0,
  add column if not exists depth smallint not null default 0,
  add column if not exists canonical_visual_context jsonb not null default '{}'::jsonb,
  add column if not exists access_metadata jsonb not null default '{}'::jsonb;

alter table public.together_locations drop constraint if exists together_locations_type_check;
alter table public.together_locations add constraint together_locations_type_check check(location_type in(
  'region','district','neighborhood','venue','residence','landmark','outdoor','room','zone','transit'
));
alter table public.together_locations drop constraint if exists together_locations_not_self_parent;
alter table public.together_locations add constraint together_locations_not_self_parent check(parent_location_id is null or parent_location_id <> id);
create index if not exists together_locations_world_parent_order_idx on public.together_locations(world_id,parent_location_id,sort_order,name);

create or replace function public.kivelle_validate_location_parent() returns trigger language plpgsql set search_path=public as $$
declare parent_world uuid; cursor_id uuid; hops integer := 0;
begin
  if new.parent_location_id is null then return new; end if;
  select world_id into parent_world from public.together_locations where id=new.parent_location_id;
  if parent_world is null or parent_world <> new.world_id then raise exception 'Location parent must belong to the same world'; end if;
  cursor_id := new.parent_location_id;
  while cursor_id is not null loop
    if cursor_id = new.id then raise exception 'Location hierarchy cannot contain a cycle'; end if;
    select parent_location_id into cursor_id from public.together_locations where id=cursor_id;
    hops := hops + 1;
    if hops > 16 then raise exception 'Location hierarchy exceeds maximum depth'; end if;
  end loop;
  return new;
end $$;
drop trigger if exists together_locations_validate_parent on public.together_locations;
create trigger together_locations_validate_parent before insert or update of parent_location_id,world_id on public.together_locations
  for each row execute function public.kivelle_validate_location_parent();

create or replace function public.kivelle_validate_world_location_pair() returns trigger language plpgsql set search_path=public as $$
declare location_world uuid;
begin
  if new.location_id is null then return new; end if;
  select world_id into location_world from public.together_locations where id=new.location_id;
  if location_world is null or new.world_id is null or location_world <> new.world_id then raise exception 'Location must belong to the referenced world'; end if;
  return new;
end $$;
drop trigger if exists together_date_templates_validate_world on public.together_date_templates;
create trigger together_date_templates_validate_world before insert or update of world_id,location_id on public.together_date_templates for each row execute function public.kivelle_validate_world_location_pair();
create or replace function public.kivelle_validate_event_world_location() returns trigger language plpgsql set search_path=public as $$
declare location_world uuid;
begin
  if new.default_location_id is null or new.world_id is null then return new; end if;
  select world_id into location_world from public.together_locations where id=new.default_location_id;
  if location_world is null or location_world <> new.world_id then raise exception 'Event location must belong to its world'; end if;
  return new;
end $$;
drop trigger if exists together_event_templates_validate_world on public.together_event_templates;
create trigger together_event_templates_validate_world before insert or update of world_id,default_location_id on public.together_event_templates for each row execute function public.kivelle_validate_event_world_location();

create table if not exists public.together_user_worlds(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  access_status text not null default 'available' check(access_status in('available','unlocked','locked')),
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  progression_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,world_id)
);
create index if not exists together_user_worlds_user_status_idx on public.together_user_worlds(user_id,access_status);
alter table public.together_user_worlds enable row level security;
drop policy if exists "Users read their world access" on public.together_user_worlds;
create policy "Users read their world access" on public.together_user_worlds for select using(auth.uid()=user_id);
grant select on public.together_user_worlds to authenticated;

create table if not exists public.together_character_world_presence(
  id uuid primary key default gen_random_uuid(),
  character_version_id uuid not null references public.together_character_versions(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  presence_type text not null default 'unavailable' check(presence_type in('resident','visitor','unavailable')),
  home_location_id uuid references public.together_locations(id) on delete set null,
  familiarity numeric(5,4) not null default 0 check(familiarity between 0 and 1),
  visited_count integer not null default 0 check(visited_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_version_id,world_id)
);
create index if not exists together_character_world_presence_world_idx on public.together_character_world_presence(world_id,presence_type);
create or replace function public.kivelle_validate_presence_home() returns trigger language plpgsql set search_path=public as $$
declare home_world uuid;
begin
  if new.home_location_id is null then return new; end if;
  select world_id into home_world from public.together_locations where id=new.home_location_id;
  if home_world is null or home_world <> new.world_id then raise exception 'Character home must belong to the presence world'; end if;
  return new;
end $$;
drop trigger if exists together_character_world_presence_validate_home on public.together_character_world_presence;
create trigger together_character_world_presence_validate_home before insert or update of world_id,home_location_id on public.together_character_world_presence for each row execute function public.kivelle_validate_presence_home();
alter table public.together_character_world_presence enable row level security;
drop policy if exists "Published character world presence is readable" on public.together_character_world_presence;
create policy "Published character world presence is readable" on public.together_character_world_presence for select using(true);
grant select on public.together_character_world_presence to authenticated,anon;

alter table public.together_generated_media add column if not exists world_id uuid references public.together_worlds(id) on delete set null;
alter table public.together_shared_plans add column if not exists world_id uuid references public.together_worlds(id) on delete restrict;
create index if not exists together_generated_media_world_created_idx on public.together_generated_media(user_id,world_id,created_at desc);
create index if not exists together_shared_plans_world_time_idx on public.together_shared_plans(user_id,world_id,starts_at);

create or replace function public.kivelle_derive_place_world() returns trigger language plpgsql set search_path=public as $$
declare resolved_world uuid;
begin
  if new.location_id is null then return new; end if;
  select world_id into resolved_world from public.together_locations where id=new.location_id;
  if resolved_world is null then raise exception 'Unknown location'; end if;
  if new.world_id is not null and new.world_id <> resolved_world then raise exception 'World does not match location'; end if;
  new.world_id := resolved_world;
  return new;
end $$;
drop trigger if exists together_generated_media_derive_world on public.together_generated_media;
create trigger together_generated_media_derive_world before insert or update of location_id,world_id on public.together_generated_media for each row execute function public.kivelle_derive_place_world();
drop trigger if exists together_shared_plans_derive_world on public.together_shared_plans;
create trigger together_shared_plans_derive_world before insert or update of location_id,world_id on public.together_shared_plans for each row execute function public.kivelle_derive_place_world();

update public.together_generated_media media set world_id=location.world_id from public.together_locations location where media.location_id=location.id and media.world_id is distinct from location.world_id;
update public.together_shared_plans plan set world_id=location.world_id from public.together_locations location where plan.location_id=location.id and plan.world_id is distinct from location.world_id;

alter table public.together_story_arc_templates
  add column if not exists world_scope text not null default 'portable',
  add column if not exists specific_world_id uuid references public.together_worlds(id) on delete cascade;
alter table public.together_story_arc_templates drop constraint if exists together_story_arc_templates_world_scope_check;
alter table public.together_story_arc_templates add constraint together_story_arc_templates_world_scope_check
  check((world_scope='portable' and specific_world_id is null) or (world_scope='specific' and specific_world_id is not null));
update public.together_story_arc_templates set world_scope='specific',specific_world_id='10000000-0000-4000-8000-000000000001'
where slug in('gallery-opportunity','missing-camera','big-client','photography-competition');

create table if not exists public.together_location_reference_assets(
  id uuid primary key default gen_random_uuid(), world_id uuid not null references public.together_worlds(id) on delete cascade,
  location_id uuid not null references public.together_locations(id) on delete cascade, storage_path text not null,
  reference_type text not null check(reference_type in('exterior','interior','anchor','atmosphere')),
  sort_order integer not null default 0, active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(location_id,storage_path)
);
create table if not exists public.together_world_reference_assets(
  id uuid primary key default gen_random_uuid(), world_id uuid not null references public.together_worlds(id) on delete cascade,
  storage_path text not null, reference_type text not null default 'atmosphere', sort_order integer not null default 0,
  active boolean not null default true, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(world_id,storage_path)
);
alter table public.together_location_reference_assets enable row level security;
alter table public.together_world_reference_assets enable row level security;
drop policy if exists "Active location references are readable" on public.together_location_reference_assets;
drop policy if exists "Active world references are readable" on public.together_world_reference_assets;
create policy "Active location references are readable" on public.together_location_reference_assets for select using(active);
create policy "Active world references are readable" on public.together_world_reference_assets for select using(active);
grant select on public.together_location_reference_assets,public.together_world_reference_assets to authenticated,anon;

update public.together_worlds set
  access_type='free', entitlement_key=null, timezone='America/New_York', sort_order=0, featured=true,
  visual_context='{"setting":"contemporary fictional American city with a walkable creative core","architecture":["brick mixed-use buildings","modern glass towers","renovated industrial spaces"],"visualStyle":["grounded contemporary realism","warm urban night lighting"],"recurringElements":["Juniper transit signage","tree-lined sidewalks","subtle city wayfinding"],"avoid":["futuristic megacity","European medieval streets","tropical resort scenery"]}'::jsonb
where id='10000000-0000-4000-8000-000000000001';

update public.together_locations set location_type=case
  when category in('home','apartment') then 'residence'
  when category in('park','garden','riverwalk') then 'outdoor'
  when category in('district','shopping') and slug='alder-district' then 'district'
  else 'venue' end;
update public.together_locations set parent_location_id='11000000-0000-4000-8000-000000000023',depth=1
where world_id='10000000-0000-4000-8000-000000000001' and slug in('velvet-hour','paper-trail','glassline-gallery') and id<>'11000000-0000-4000-8000-000000000023';

update public.together_locations set canonical_visual_context='{"canonicalPrompt":"an intimate upscale cocktail lounge with warm amber lighting and dark walnut interiors","indoorOutdoor":"indoor","materials":["walnut","brass","dark leather"],"lighting":["small brass table lamps","warm pendant lighting"],"visualAnchors":["black upright piano","deep walnut booths","amber bar shelving"],"avoid":["sports bar televisions","bright fluorescent lighting","large nightclub dance floor"]}'::jsonb where slug='velvet-hour' and world_id='10000000-0000-4000-8000-000000000001';

update public.together_worlds set default_arrival_location_id='11000000-0000-4000-8000-000000000001' where id='10000000-0000-4000-8000-000000000001';
alter table public.together_worlds drop constraint if exists together_worlds_default_arrival_location_fkey;
alter table public.together_worlds add constraint together_worlds_default_arrival_location_fkey foreign key(default_arrival_location_id) references public.together_locations(id) on delete set null;
create or replace function public.kivelle_validate_world_arrival() returns trigger language plpgsql set search_path=public as $$
declare arrival_world uuid;
begin
  if new.default_arrival_location_id is null then return new; end if;
  select world_id into arrival_world from public.together_locations where id=new.default_arrival_location_id;
  if arrival_world is null or arrival_world <> new.id then raise exception 'Default arrival must belong to its world'; end if;
  return new;
end $$;
drop trigger if exists together_worlds_validate_arrival on public.together_worlds;
create trigger together_worlds_validate_arrival before insert or update of default_arrival_location_id on public.together_worlds for each row execute function public.kivelle_validate_world_arrival();

insert into public.together_character_world_presence(character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata)
select version.id,'10000000-0000-4000-8000-000000000001','resident',
  case when version.character_template_id='12000000-0000-4000-8000-000000000001' then '11000000-0000-4000-8000-000000000002'::uuid else '11000000-0000-4000-8000-000000000001'::uuid end,
  1,1,'{"seed":"juniper-starter"}'::jsonb
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
where template.published=true
on conflict(character_version_id,world_id) do update set presence_type=excluded.presence_type,home_location_id=excluded.home_location_id,updated_at=now();

insert into public.together_user_worlds(user_id,world_id,access_status,first_visited_at,last_visited_at,metadata)
select profile.user_id,world.id,'unlocked',coalesce(profile.created_at,now()),now(),'{"source":"starter-world-backfill"}'::jsonb
from public.together_profiles profile cross join public.together_worlds world where world.access_type='free'
on conflict(user_id,world_id) do nothing;

comment on table public.together_user_worlds is 'Per-user access and visit history. Browsing a world never changes character position.';
comment on table public.together_character_world_presence is 'World-specific resident/visitor eligibility and home without cloning character identity.';
comment on column public.together_generated_media.metadata is 'Includes immutable metadata.placeContext contextVersion snapshots for historical continuity.';

commit;
