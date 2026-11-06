begin;

-- Preserve the explicit privacy rule in image/lore context, but keep the
-- description shown to readers about the room itself.
alter function public.kivelle_default_character_home_profile(uuid,uuid,uuid)
  rename to kivelle_pre_readable_character_home_profile;

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
  profile jsonb;
  description_text text;
begin
  profile:=public.kivelle_pre_readable_character_home_profile(
    p_character_version_id,p_world_id,p_district_anchor_location_id
  );
  if not exists (
    select 1 from public.together_worlds
    where id=p_world_id and slug='eos-meridian'
  ) then return profile; end if;

  description_text:=replace(
    replace(profile->>'description',
      'This is not a public laboratory, garden, reservoir, or workroom, and no visitor is present just because a conversation is open.',
      'The shared laboratories, gardens, reservoir, and workrooms are elsewhere.'),
    'A chat does not place anyone inside.',
    'The shared colony rooms are elsewhere.'
  );
  profile:=jsonb_set(profile,'{description}',to_jsonb(description_text),true);
  profile:=jsonb_set(profile,'{lore,summary}',to_jsonb(description_text),true);
  return profile;
end $$;

with revised as (
  select home.id,replace(
    replace(home.description,
      'This is not a public laboratory, garden, reservoir, or workroom, and no visitor is present just because a conversation is open.',
      'The shared laboratories, gardens, reservoir, and workrooms are elsewhere.'),
    'A chat does not place anyone inside.',
    'The shared colony rooms are elsewhere.'
  ) as description
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where world.slug='eos-meridian'
    and (home.description like '%conversation is open.%'
      or home.description like '%A chat does not place anyone inside.%')
)
update public.together_character_homes home
set description=revised.description,
    canonical_lore=jsonb_set(coalesce(home.canonical_lore,'{}'::jsonb),
      '{summary}',to_jsonb(revised.description),true),
    updated_at=now()
from revised where revised.id=home.id;

commit;
