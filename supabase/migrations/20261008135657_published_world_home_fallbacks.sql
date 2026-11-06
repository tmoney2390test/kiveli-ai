begin;

-- The old default generator fell through to a Juniper apartment in worlds
-- introduced later. Keep existing authored homes and later, world-specific
-- descriptions intact; only replace the fallback for future residents.
alter function public.kivelle_default_character_home_profile(uuid,uuid,uuid)
  rename to kivelle_eos_character_home_profile;

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
  character_name text;
  residence text;
  description_text text;
  prompt_text text;
  era_text text;
  materials jsonb;
begin
  profile:=public.kivelle_eos_character_home_profile(
    p_character_version_id,p_world_id,p_district_anchor_location_id
  );
  select slug into world_slug from public.together_worlds where id=p_world_id;
  if world_slug not in ('calders-run','gilded-coast','northvale','vespormoor','vharadren') then
    return profile;
  end if;
  select template.name into character_name
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=p_character_version_id;
  select name into district_name from public.together_locations where id=p_district_anchor_location_id;
  district_name:=coalesce(district_name,'the local district');

  case world_slug
    when 'calders-run' then
      residence:='private frontier room';
      era_text:='territorial Southwest frontier in 1888';
      materials:=jsonb_build_array('wood','worn cotton','iron fittings');
      description_text:=format('A private room in %s gives %s a bed, a washstand, and a place to leave the day’s dust and work behind. It is separate from the public saloon, rail yard, and other places where town business happens.',district_name,character_name);
    when 'gilded-coast' then
      residence:='private coastal quarters';
      era_text:='age-of-sail coast';
      materials:=jsonb_build_array('weathered timber','linen','stone or plaster');
      description_text:=format('A private room in %s gives %s somewhere to put down a coat and be away from the harbor’s crowds and work. It is distinct from the docks, taverns, ships, and public rooms where other parts of life happen.',district_name,character_name);
    when 'northvale' then
      residence:='private mountain-town home';
      era_text:='contemporary Colorado mountain town';
      materials:=jsonb_build_array('warm timber','everyday textiles','modern fixtures');
      description_text:=format('A lived-in home in %s gives %s a place for weather gear, ordinary belongings, and a quiet evening after the mountain day. The lodge, slopes, clinics, and other public places are elsewhere.',district_name,character_name);
    when 'vespormoor' then
      residence:='private modern Vespormoor home';
      era_text:='present-day gothic mountain town';
      materials:=jsonb_build_array('old stone or timber','modern furnishings','warm practical lamps');
      description_text:=format('A private home in %s mixes Vespormoor’s old buildings with %s’s ordinary present-day life. The room belongs to them; the university, lake, and town’s public buildings are elsewhere.',district_name,character_name);
    when 'vharadren' then
      residence:='private Vharadren quarters';
      era_text:='high-fantasy realm of Vharadren';
      materials:=jsonb_build_array('worked stone or timber','woven cloth','lamplight');
      description_text:=format('Private quarters in %s give %s a place to rest and keep personal belongings apart from court, camp, or work. This is not a throne room, market stall, barracks, or public hall, and no visitor enters by default.',district_name,character_name);
  end case;

  prompt_text:=format(
    'Photorealistic private interior for %s in %s, %s. %s The space is a %s in the %s. Use world-appropriate materials and practical furnishings. Keep the room lived-in and separate from public work and recreation locations. No public signage, modern city apartment, generic hotel, or visible brand logos. No person is present unless separately requested.',
    character_name,district_name,era_text,description_text,residence,era_text
  );
  profile:=jsonb_set(profile,'{residenceType}',to_jsonb(residence),true);
  profile:=jsonb_set(profile,'{description}',to_jsonb(description_text),true);
  profile:=jsonb_set(profile,'{promptText}',to_jsonb(prompt_text),true);
  profile:=jsonb_set(profile,'{visualContext}',jsonb_build_object(
    'canonicalPrompt',prompt_text,'indoorOutdoor','indoor','materials',materials,
    'lighting',jsonb_build_array('believable local light','warm practical light after dark'),
    'avoid',jsonb_build_array('public workplace','generic hotel','contemporary Earth apartment','visible brand logos'),
    'environmentReferencePolicy','text_only','promptVersion',4
  ),true);
  profile:=jsonb_set(profile,'{lore}',jsonb_build_object(
    'summary',description_text,
    'stableFacts',jsonb_build_array(character_name||' has a private home in '||district_name||'.','A workplace is not automatically this character’s home.'),
    'localEtiquette',jsonb_build_array('Entry is personal and permission-based.','A remote conversation does not place the user inside the home.')
  ),true);
  return profile;
end $$;

-- Later world packs gave these residents more specific copy and visual prompts,
-- but left the original fallback residence_type behind. Correct just that
-- column so a character's curated home is not flattened into a new template.
update public.together_character_homes home
set residence_type=case world.slug
      when 'calders-run' then 'private frontier room'
      when 'gilded-coast' then 'private coastal quarters'
      when 'northvale' then 'private mountain-town home'
      when 'vespormoor' then 'private modern Vespormoor home'
      when 'vharadren' then 'private Vharadren quarters'
    end,
    updated_at=now()
from public.together_worlds world
where home.world_id=world.id and home.source='auto'
  and world.slug in ('calders-run','gilded-coast','northvale','vespormoor','vharadren')
  and home.residence_type ilike '%Juniper City%';

-- Five Port Vervelle residents were given Porto Marina itself as their home.
-- That landmark is a public workplace/recreation site. Its parent Porto
-- Vecchio is the correct district anchor for their separate private rooms.
-- Updating presence fires the auto-home trigger, so preserve the existing
-- character-specific writing and image context across that repair.
create temporary table _port_vervelle_home_repair on commit drop as
select home.character_version_id,home.name,home.residence_type,home.description,
       home.prompt_text,home.canonical_visual_context,home.canonical_lore,
       home.reference_policy,home.prompt_version,location.parent_location_id as district_id
from public.together_character_homes home
join public.together_worlds world on world.id=home.world_id
join public.together_locations location on location.id=home.district_anchor_location_id
join public.together_locations district on district.id=location.parent_location_id
where world.slug='port-vervelle' and location.slug='porto-marina'
  and location.location_type='landmark' and district.location_type='district';

update public.together_character_world_presence presence
set home_location_id=repair.district_id,updated_at=now()
from _port_vervelle_home_repair repair
where presence.character_version_id=repair.character_version_id
  and presence.presence_type='resident'
  and presence.home_location_id is distinct from repair.district_id;

update public.together_character_homes home
set district_anchor_location_id=repair.district_id,
    name=repair.name,residence_type=repair.residence_type,
    description=repair.description,prompt_text=repair.prompt_text,
    canonical_visual_context=repair.canonical_visual_context,
    canonical_lore=repair.canonical_lore,
    reference_policy=repair.reference_policy,prompt_version=repair.prompt_version,
    updated_at=now()
from _port_vervelle_home_repair repair
where home.character_version_id=repair.character_version_id;

commit;
