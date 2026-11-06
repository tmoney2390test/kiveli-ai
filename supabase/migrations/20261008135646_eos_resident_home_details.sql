begin;

-- The original fallback described every non-Neon/Verelle resident as living in
-- Juniper City. Eos homes need colony-specific private interiors, separate from
-- their district anchors and public work/leisure locations.
alter function public.kivelle_default_character_home_profile(uuid,uuid,uuid)
  rename to kivelle_pre_eos_character_home_profile;

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
  world_slug text;
  district_name text;
  character_slug text;
  character_name text;
  residence text;
  description_text text;
  prompt_text text;
begin
  profile:=public.kivelle_pre_eos_character_home_profile(
    p_character_version_id,p_world_id,p_district_anchor_location_id
  );
  select slug into world_slug from public.together_worlds where id=p_world_id;
  if world_slug is distinct from 'eos-meridian' then return profile; end if;

  select template.slug,template.name into character_slug,character_name
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=p_character_version_id;
  select name into district_name from public.together_locations where id=p_district_anchor_location_id;
  district_name:=coalesce(district_name,'the colony');

  residence:=case character_slug
    when 'liora-haddad' then 'compact Solace Biome habitat room'
    when 'hana-petrov' then 'private Solace Biome habitat room'
    else 'private colony habitat' end;
  description_text:=case character_slug
    when 'liora-haddad' then 'A compact room in Solace Biome holds Liora’s labeled cuttings, fruit preserves, and a small place to unwind after orchard shifts. Orchard Nine is her workplace, not her home.'
    when 'hana-petrov' then 'Hana’s room in Solace Biome has tidy sample notes, tiny painted landscapes, and a swim bag drying by the vent. The reservoir and Rain Room are separate public places.'
    else format('A lived-in private habitat in %s gives %s somewhere to rest away from the colony’s shared spaces and work sites. This is not a public laboratory, garden, reservoir, or workroom, and no visitor is present just because a conversation is open.',district_name,character_name) end;
  prompt_text:=format(
    'Photorealistic interior of %s, %s''s %s in %s on Eos Meridian. %s Show a modest, spatially coherent, lived-in colony residence with practical storage, warm task lighting, and a visible sleeping area. Keep the room private and distinct from the character''s public workplace or recreation site. Do not show an orchard, reservoir, swimming pool, public Rain Room, contemporary Earth apartment, hotel, or generic science-fiction set. No person is present unless separately requested.',
    profile->>'name',character_name,residence,district_name,description_text
  );
  profile:=jsonb_set(profile,'{residenceType}',to_jsonb(residence),true);
  profile:=jsonb_set(profile,'{description}',to_jsonb(description_text),true);
  profile:=jsonb_set(profile,'{promptText}',to_jsonb(prompt_text),true);
  profile:=jsonb_set(profile,'{visualContext}',jsonb_build_object(
    'canonicalPrompt',prompt_text,'indoorOutdoor','indoor','architecture',jsonb_build_array('compact modular colony interior','private sleeping area'),
    'materials',jsonb_build_array('matte habitat panels','durable woven textiles','well-used personal surfaces'),
    'lighting',jsonb_build_array('warm task light','soft colony light through a real window'),
    'recurringObjects',case character_slug
      when 'liora-haddad' then jsonb_build_array('labeled plant cuttings','fruit preserves')
      when 'hana-petrov' then jsonb_build_array('sample notes','small painted landscapes','swim bag')
      else jsonb_build_array('character-specific belongings','signs of a daily routine') end,
    'avoid',jsonb_build_array('public workplace','orchard','reservoir','swimming pool','Rain Room','contemporary Earth apartment'),
    'environmentReferencePolicy','text_only','promptVersion',3
  ),true);
  profile:=jsonb_set(profile,'{lore}',jsonb_build_object(
    'summary',description_text,
    'stableFacts',jsonb_build_array(character_name||' lives in a private home in '||district_name||'.','This home is separate from public work and recreation locations.'),
    'localEtiquette',jsonb_build_array('Treat entry as personal and permission-based.','Do not assume a visitor is present merely because they are chatting remotely.')
  ),true);
  return profile;
end $$;

with refreshed as (
  select home.id,public.kivelle_default_character_home_profile(
    home.character_version_id,home.world_id,home.district_anchor_location_id
  ) as profile
  from public.together_character_homes home
  join public.together_worlds world on world.id=home.world_id
  where home.source='auto' and world.slug='eos-meridian'
    and (home.description ilike '%Juniper City%' or home.prompt_text ilike '%Juniper City%')
)
update public.together_character_homes home
set residence_type=refreshed.profile->>'residenceType',
    description=refreshed.profile->>'description',
    prompt_text=refreshed.profile->>'promptText',
    canonical_visual_context=refreshed.profile->'visualContext',
    canonical_lore=refreshed.profile->'lore',
    prompt_version=3,
    updated_at=now()
from refreshed
where refreshed.id=home.id;

-- Later cast packs wrote better Eos-specific room copy but retained the old
-- generator's residence_type. Keep that authored copy intact.
update public.together_character_homes home
set residence_type='private colony habitat',updated_at=now()
from public.together_worlds world
where home.world_id=world.id and world.slug='eos-meridian'
  and home.source='auto' and home.residence_type ilike '%Juniper City%';

commit;
