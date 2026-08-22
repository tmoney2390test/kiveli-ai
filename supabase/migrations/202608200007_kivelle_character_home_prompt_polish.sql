begin;

-- Preserve the first complete generator as a base and layer exact authored
-- district vocabulary over it. This keeps future migrations and Creator rows
-- deterministic while allowing world packs to refine their local housing types.
alter function public.kivelle_default_character_home_profile(uuid,uuid,uuid)
  rename to kivelle_base_character_home_profile;

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
  district_slug text;
  previous_residence text;
  refined_residence text;
  refined_description text;
  refined_prompt text;
begin
  profile:=public.kivelle_base_character_home_profile(
    p_character_version_id,p_world_id,p_district_anchor_location_id
  );
  select slug into world_slug from public.together_worlds where id=p_world_id;
  if p_district_anchor_location_id is not null then
    select slug into district_slug from public.together_locations where id=p_district_anchor_location_id;
  end if;
  previous_residence:=profile->>'residenceType';
  refined_residence:=case
    when world_slug='neon-kyo' and district_slug='aoyama-nine' then 'precise glass-and-timber tower apartment'
    when world_slug='port-vervelle' and district_slug='marina-solana' then 'breezy marina apartment'
    when world_slug='port-vervelle' and district_slug='piazza-aurelia' then 'gracious apartment above the civic square'
    when world_slug='port-vervelle' and district_slug='porto-vecchio' then 'restored harbor-quarter flat'
    when previous_residence='private coastal apartment' then 'coastal apartment'
    else previous_residence
  end;
  refined_description:=replace(profile->>'description',previous_residence,refined_residence);
  refined_prompt:=replace(profile->>'promptText',previous_residence,refined_residence);
  refined_prompt:=replace(refined_prompt,'private private ','private ');
  profile:=jsonb_set(profile,'{residenceType}',to_jsonb(refined_residence),true);
  profile:=jsonb_set(profile,'{description}',to_jsonb(refined_description),true);
  profile:=jsonb_set(profile,'{promptText}',to_jsonb(refined_prompt),true);
  profile:=jsonb_set(profile,'{visualContext,canonicalPrompt}',to_jsonb(refined_prompt),true);
  return profile;
end $$;

with refreshed as(
  select
    home.id,
    public.kivelle_default_character_home_profile(
      home.character_version_id,home.world_id,home.district_anchor_location_id
    ) as profile
  from public.together_character_homes home
  where home.source='auto'
)
update public.together_character_homes home
set
  residence_type=refreshed.profile->>'residenceType',
  description=refreshed.profile->>'description',
  prompt_text=refreshed.profile->>'promptText',
  canonical_visual_context=refreshed.profile->'visualContext',
  canonical_lore=refreshed.profile->'lore',
  prompt_version=2,
  updated_at=now()
from refreshed
where refreshed.id=home.id;

commit;
