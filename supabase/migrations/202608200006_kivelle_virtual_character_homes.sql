begin;

-- A character home is private narrative/visual grounding, not a public map venue.
-- The optional district anchor keeps it in a world without requiring a dedicated
-- together_locations row or a location reference image.
create table if not exists public.together_character_homes(
  id uuid primary key default gen_random_uuid(),
  character_version_id uuid not null unique references public.together_character_versions(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete restrict,
  district_anchor_location_id uuid references public.together_locations(id) on delete set null,
  name text not null check(length(btrim(name)) between 3 and 120),
  residence_type text not null check(length(btrim(residence_type)) between 3 and 120),
  description text not null check(length(btrim(description)) >= 120),
  prompt_text text not null check(length(btrim(prompt_text)) >= 300),
  canonical_visual_context jsonb not null default '{}'::jsonb,
  canonical_lore jsonb not null default '{}'::jsonb,
  reference_policy text not null default 'text_only' check(reference_policy in('text_only','optional','required')),
  source text not null default 'auto' check(source in('auto','authored','creator')),
  prompt_version integer not null default 1 check(prompt_version between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists together_character_homes_world_idx
  on public.together_character_homes(world_id,active);

comment on table public.together_character_homes is
  'Private character-owned home descriptions and text-only visual grounding. Rows are not browsable together_locations and do not require location reference images.';
comment on column public.together_character_homes.district_anchor_location_id is
  'Optional public district/neighborhood anchor only; never the private home itself.';
comment on column public.together_character_homes.prompt_text is
  'Complete canonical environment prompt. Character identity remains separately grounded by the character portrait reference.';
comment on column public.together_character_homes.reference_policy is
  'text_only means the environment is generated from canonical text; it does not disable the separate character identity reference.';
comment on column public.together_character_world_presence.home_location_id is
  'Optional public world/district simulation anchor. Private home interiors live in together_character_homes and need no together_locations row.';

create or replace function public.kivelle_validate_character_home_anchor()
returns trigger
language plpgsql
set search_path=public
as $$
declare anchor_world uuid;
begin
  if new.district_anchor_location_id is null then return new; end if;
  select world_id into anchor_world
  from public.together_locations
  where id=new.district_anchor_location_id;
  if anchor_world is null or anchor_world<>new.world_id then
    raise exception 'Character home district anchor must belong to its world';
  end if;
  return new;
end $$;

drop trigger if exists together_character_homes_validate_anchor on public.together_character_homes;
create trigger together_character_homes_validate_anchor
before insert or update of world_id,district_anchor_location_id
on public.together_character_homes
for each row execute function public.kivelle_validate_character_home_anchor();

-- Deterministic fallback authoring keeps every current and future resident usable.
-- Hand-authored or Creator-authored rows can later replace an auto profile without
-- changing any location IDs or media references.
create or replace function public.kivelle_default_character_home_profile(
  p_character_version_id uuid,
  p_world_id uuid,
  p_district_anchor_location_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path=public
as $$
declare
  template_row public.together_character_templates%rowtype;
  version_row public.together_character_versions%rowtype;
  world_row public.together_worlds%rowtype;
  district_row public.together_locations%rowtype;
  home_name text;
  district_name text;
  district_slug text;
  residence text;
  interest_text text;
  description_text text;
  canonical_prompt text;
  architecture text[];
  materials text[];
  lighting text[];
  furniture text[];
  recurring_objects text[];
  atmosphere text[];
  visual_anchors text[];
  avoid text[];
begin
  select * into version_row from public.together_character_versions where id=p_character_version_id;
  if version_row.id is null then raise exception 'Character version not found'; end if;
  select * into template_row from public.together_character_templates where id=version_row.character_template_id;
  select * into world_row from public.together_worlds where id=p_world_id;
  if template_row.id is null or world_row.id is null then raise exception 'Character or world not found'; end if;
  if p_district_anchor_location_id is not null then
    select * into district_row from public.together_locations where id=p_district_anchor_location_id and world_id=p_world_id;
  end if;

  home_name:=template_row.name||'''s Home';
  district_name:=coalesce(nullif(district_row.name,''),'a lived-in neighborhood');
  district_slug:=coalesce(nullif(district_row.slug,''),'unlisted-neighborhood');
  interest_text:=coalesce(nullif(array_to_string(version_row.interests[1:5],', '),''),'ordinary private rituals');

  if world_row.slug='neon-kyo' then
    residence:=case district_slug
      when 'hikari-core' then 'compact upper-floor smart apartment'
      when 'shinjira' then 'sound-insulated apartment above the late-night streets'
      when 'aoyama-9' then 'precise glass-and-timber tower apartment'
      when 'akiba-undergrid' then 'adaptable workshop loft'
      when 'tsuki-blocks' then 'compact lived-in neighborhood apartment'
      when 'old-kyo-the-shade' then 'carefully restored machiya apartment'
      else 'private vertical-city apartment' end;
    architecture:=array['compact vertical-city interior','clear human-scale room divisions','one real window into the surrounding district'];
    materials:=array['warm recycled timber','smoked glass','matte dark metal','soft woven textiles'];
    lighting:=array['soft practical lamps','controlled indirect light','subdued city glow beyond the window'];
    atmosphere:=array['private refuge from a monitored city','lived-in rather than optimized','quietly futuristic but emotionally human'];
    avoid:=array['generic cyberpunk bunker','all-neon room','dystopian grime','cold corporate showroom','capsule hotel','public venue signage','visible brand logos','location reference image dependency'];
  elsif world_row.slug='port-vervelle' then
    residence:=case district_slug
      when 'marina-grande' then 'weathered harbor apartment'
      when 'bellavista' then 'sun-washed hillside apartment'
      when 'mercato-vecchio' then 'restored old-town flat'
      when 'via-celeste' then 'gracious apartment above a quiet avenue'
      when 'porto-nuovo' then 'practical modern waterfront flat'
      when 'capo-vervelle' then 'wind-shaped cliffside apartment'
      else 'private coastal apartment' end;
    architecture:=array['Mediterranean coastal interior','deep window reveals','simple rooms shaped by sea light'];
    materials:=array['pale lime plaster','aged local wood','limestone or terracotta','washed linen'];
    lighting:=array['soft reflected coastal daylight','warm practical lamps after sunset','moving harbor or hillside light'];
    atmosphere:=array['salt-air calm','personal and unhurried','elegant without looking staged'];
    avoid:=array['generic luxury resort','vacation rental staging','Greek-island cliché','tropical décor','empty showroom','public venue signage','visible brand logos','location reference image dependency'];
  else
    residence:=case
      when template_row.occupation~*'(artist|designer|photograph|writer|music|illustrat|architect)' then 'lived-in creative city apartment'
      when template_row.occupation~*'(chef|baker|restaurant|florist)' then 'warm apartment organized around a working kitchen'
      when template_row.occupation~*'(athlete|trainer|ranger|firefighter)' then 'practical light-filled apartment with room for gear'
      else 'comfortable Juniper City apartment' end;
    architecture:=array['contemporary Juniper City interior','human-scale rooms','a real city window with neighborhood context'];
    materials:=array['painted plaster','warm timber','honest metal details','layered everyday textiles'];
    lighting:=array['believable window light','warm table and floor lamps','soft city light after dark'];
    atmosphere:=array['lived-in urban privacy','creative city warmth','specific personal history rather than décor staging'];
    avoid:=array['generic influencer apartment','luxury showroom','hotel room','empty minimalist box','public venue signage','visible brand logos','location reference image dependency'];
  end if;

  furniture:=case
    when template_row.occupation~*'(chef|baker|restaurant|bartender)' then array['well-used kitchen work surface','open shelves with practical cookware','small table for late meals','comfortable chair near the window']
    when template_row.occupation~*'(artist|designer|photograph|architect|illustrat)' then array['honest worktable with an active project','flat files or material shelves','comfortable mismatched seating','task lamp with visible wear']
    when template_row.occupation~*'(music|radio|producer|game|tech|engineer)' then array['compact equipment desk','carefully managed cables','low shelving for tools and media','soft chair away from the screens']
    when template_row.occupation~*'(athlete|trainer|ranger|firefighter|captain)' then array['durable uncluttered furniture','organized storage for daily gear','recovery corner with water and towels','sturdy table near natural light']
    else array['comfortable everyday seating','small dining or work table','open shelf of frequently used things','bedroom or sleeping area implied beyond the main room'] end;
  recurring_objects:=array_append(coalesce(version_row.interests[1:4],array[]::text[]),'working traces of '||lower(template_row.occupation));
  visual_anchors:=array[
    'one unmistakably personal work or hobby corner',
    'small evidence of an unfinished daily routine',
    'a view or light cue specific to '||district_name,
    'objects chosen by '||template_row.name||', never generic set dressing'
  ];

  description_text:=format(
    '%s''s home is a %s in %s, %s. It is a private, inhabited interior shaped by life as %s: useful surfaces stay useful, favorite objects accumulate naturally, and the room carries quiet traces of %s. The space feels consistent with %s while remaining unmistakably personal, with a believable main living area, an implied sleeping area, and ordinary evidence that someone has just stepped out of frame.',
    template_row.name,residence,district_name,world_row.name,lower(template_row.occupation),interest_text,world_row.name
  );
  canonical_prompt:=format(
    'Photorealistic interior of %s, %s''s private %s in %s, %s. %s Architecture: %s. Materials: %s. Lighting: %s. Furniture: %s. Character-specific objects: %s. The home must look inhabited, spatially coherent, modestly imperfect, and accumulated over time rather than decorated in one shopping trip. Show useful environmental context and a natural camera angle. The room is empty unless the scene explicitly requests %s; if present, use the separate canonical character identity reference for the person and use this text only for the environment. Never copy wardrobe, pose, lighting, or background from an identity portrait. Avoid: %s.',
    home_name,template_row.name,residence,district_name,world_row.name,description_text,
    array_to_string(architecture,', '),array_to_string(materials,', '),array_to_string(lighting,', '),
    array_to_string(furniture,', '),array_to_string(recurring_objects,', '),template_row.name,array_to_string(avoid,', ')
  );

  return jsonb_build_object(
    'name',home_name,
    'residenceType',residence,
    'description',description_text,
    'promptText',canonical_prompt,
    'visualContext',jsonb_build_object(
      'canonicalPrompt',canonical_prompt,'indoorOutdoor','indoor','architecture',to_jsonb(architecture),
      'materials',to_jsonb(materials),'lighting',to_jsonb(lighting),'furniture',to_jsonb(furniture),
      'recurringObjects',to_jsonb(recurring_objects),'atmosphere',to_jsonb(atmosphere),
      'visualAnchors',to_jsonb(visual_anchors),'avoid',to_jsonb(avoid),
      'environmentReferencePolicy','text_only','promptVersion',1
    ),
    'lore',jsonb_build_object(
      'summary',description_text,'atmosphere',to_jsonb(atmosphere),
      'sensoryDetails',to_jsonb(array['the subdued sound of '||district_name||' beyond the walls','the ordinary texture of a recently occupied room','lighting that changes naturally with local time']),
      'signatureDetails',to_jsonb(visual_anchors),'layout',to_jsonb(array['one coherent main living area','an implied private sleeping area','storage and work zones that match daily life']),
      'stableFacts',jsonb_build_array('This is '||template_row.name||'''s private home.','It is not a public venue or browsable map location.','The environment is canonically grounded by text and requires no location reference image.'),
      'localEtiquette',jsonb_build_array('Treat entry as personal and permission-based.','Do not invent roommates, pets, luxury, or major architecture unless another canonical fact establishes them.')
    )
  );
end $$;

-- Backfill every published current resident version, including social characters.
with resident_versions as(
  select distinct on(version.id)
    version.id as character_version_id,presence.world_id,
    case
      when home.location_type in('district','neighborhood') then home.id
      when parent.location_type in('district','neighborhood') then parent.id
      else null
    end as district_anchor_location_id
  from public.together_character_versions version
  join public.together_character_templates template
    on template.id=version.character_template_id and template.published=true
   and template.current_published_version=version.version
  join public.together_character_world_presence presence
    on presence.character_version_id=version.id and presence.presence_type='resident'
  join public.together_worlds world on world.id=presence.world_id and world.published=true
  left join public.together_locations home on home.id=presence.home_location_id
  left join public.together_locations parent on parent.id=home.parent_location_id
  order by version.id,presence.updated_at desc
), authored as(
  select resident.*,public.kivelle_default_character_home_profile(
    resident.character_version_id,resident.world_id,resident.district_anchor_location_id
  ) as profile
  from resident_versions resident
)
insert into public.together_character_homes(
  character_version_id,world_id,district_anchor_location_id,name,residence_type,
  description,prompt_text,canonical_visual_context,canonical_lore,reference_policy,source
)
select
  character_version_id,world_id,district_anchor_location_id,profile->>'name',profile->>'residenceType',
  profile->>'description',profile->>'promptText',profile->'visualContext',profile->'lore','text_only','auto'
from authored
on conflict(character_version_id) do update set
  world_id=excluded.world_id,district_anchor_location_id=excluded.district_anchor_location_id,
  name=excluded.name,residence_type=excluded.residence_type,description=excluded.description,
  prompt_text=excluded.prompt_text,canonical_visual_context=excluded.canonical_visual_context,
  canonical_lore=excluded.canonical_lore,reference_policy='text_only',prompt_version=1,
  active=true,updated_at=now()
where public.together_character_homes.source='auto';

create or replace function public.kivelle_ensure_character_home()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  anchor_id uuid;
  home_row public.together_locations%rowtype;
  parent_row public.together_locations%rowtype;
  profile jsonb;
begin
  if new.presence_type<>'resident' then return new; end if;
  if new.home_location_id is not null then
    select * into home_row from public.together_locations where id=new.home_location_id;
    if home_row.location_type in('district','neighborhood') then anchor_id:=home_row.id;
    elsif home_row.parent_location_id is not null then
      select * into parent_row from public.together_locations where id=home_row.parent_location_id;
      if parent_row.location_type in('district','neighborhood') then anchor_id:=parent_row.id; end if;
    end if;
  end if;
  profile:=public.kivelle_default_character_home_profile(new.character_version_id,new.world_id,anchor_id);
  insert into public.together_character_homes(
    character_version_id,world_id,district_anchor_location_id,name,residence_type,
    description,prompt_text,canonical_visual_context,canonical_lore,reference_policy,source
  ) values(
    new.character_version_id,new.world_id,anchor_id,profile->>'name',profile->>'residenceType',
    profile->>'description',profile->>'promptText',profile->'visualContext',profile->'lore','text_only','auto'
  )
  on conflict(character_version_id) do update set
    world_id=excluded.world_id,district_anchor_location_id=excluded.district_anchor_location_id,
    name=excluded.name,residence_type=excluded.residence_type,description=excluded.description,
    prompt_text=excluded.prompt_text,canonical_visual_context=excluded.canonical_visual_context,
    canonical_lore=excluded.canonical_lore,reference_policy='text_only',active=true,updated_at=now()
  where public.together_character_homes.source='auto';
  return new;
end $$;

drop trigger if exists together_character_presence_ensure_home on public.together_character_world_presence;
create trigger together_character_presence_ensure_home
after insert or update of world_id,presence_type,home_location_id
on public.together_character_world_presence
for each row execute function public.kivelle_ensure_character_home();

alter table public.together_character_homes enable row level security;
drop policy if exists "Published character homes are readable" on public.together_character_homes;
create policy "Published character homes are readable"
on public.together_character_homes for select
using(
  active and exists(
    select 1
    from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id
    join public.together_worlds world on world.id=together_character_homes.world_id
    where version.id=together_character_homes.character_version_id
      and template.published=true and world.published=true
  )
);
grant select on public.together_character_homes to authenticated,anon;

create or replace view public.together_character_home_catalog
with (security_invoker=true)
as
select
  template.slug as character_slug,template.name as character_name,template.occupation,
  world.slug as world_slug,world.name as world_name,
  district.slug as district_slug,district.name as district_name,
  home.name as home_name,home.residence_type,home.description,home.prompt_text,
  home.canonical_visual_context,home.canonical_lore,home.reference_policy,
  home.source,home.prompt_version,home.updated_at
from public.together_character_homes home
join public.together_character_versions version on version.id=home.character_version_id
join public.together_character_templates template on template.id=version.character_template_id
join public.together_worlds world on world.id=home.world_id
left join public.together_locations district on district.id=home.district_anchor_location_id
where home.active=true and template.published=true and world.published=true;

comment on view public.together_character_home_catalog is
  'Review/export surface for every current and future character home description and full text-only image prompt.';
grant select on public.together_character_home_catalog to authenticated,anon;

commit;
