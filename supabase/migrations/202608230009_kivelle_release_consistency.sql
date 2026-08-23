begin;

-- Roster expansions author homes after the original virtual-home backfill. Keep
-- every authored and generated home on the same complete media prompt contract.
update public.together_character_homes
set prompt_text=prompt_text||' Use a separate canonical character identity reference for any fictional adult companion shown in the room.',
    updated_at=now()
where prompt_text not ilike '%separate canonical character identity reference%';

update public.together_character_homes
set canonical_visual_context=coalesce(canonical_visual_context,'{}'::jsonb)||jsonb_build_object(
      'canonicalPrompt',prompt_text,
      'indoorOutdoor','indoor',
      'environmentReferencePolicy','text_only'
    ),
    reference_policy='text_only',
    updated_at=now();

-- Homes in a shared Port Vervelle district use one stable architectural
-- archetype even when a later roster supplies more individual detail.
update public.together_character_homes home
set residence_type=case district.slug
      when 'marina-solana' then 'breezy marina apartment'
      when 'piazza-aurelia' then 'gracious apartment above the civic square'
      when 'porto-vecchio' then 'restored harbor-quarter flat'
      else home.residence_type
    end,
    updated_at=now()
from public.together_locations district
where district.id=home.district_anchor_location_id
  and home.world_id='10000000-0000-4000-8000-000000000008'::uuid
  and district.slug in('marina-solana','piazza-aurelia','porto-vecchio');

-- Launch routines promoted into Life Engine V2 predate the richer calendar
-- presentation fields. Supply deterministic labels without changing behavior.
update public.together_character_activity_templates
set metadata=metadata||jsonb_build_object(
      'activityLabel',coalesce(nullif(metadata->>'activityLabel',''),title),
      'upcomingHint',coalesce(nullif(metadata->>'upcomingHint',''),'May be '||lower(title)||' later')
    ),
    updated_at=now()
where metadata->>'source'='neon_kyo_life_v2'
  and (coalesce(metadata->>'activityLabel','')='' or coalesce(metadata->>'upcomingHint','')='');

-- Validation functions used in constraints must be total booleans. Missing
-- required keys are invalid, not SQL NULL.
create or replace function public.kivelle_valid_curiosity_profile(profile jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when profile is null or jsonb_typeof(profile) is distinct from 'object' then false
    when jsonb_typeof(profile->'domains') is distinct from 'array' then false
    when jsonb_typeof(profile->'preferredMoves') is distinct from 'object' then false
    when jsonb_typeof(profile->'avoids') is distinct from 'array' then false
    else jsonb_array_length(profile->'domains')>=2
      and profile->>'style' in('observant_selective','direct_specific','teasing_playful','warm_reflective','analytical_precise')
      and profile->>'disclosureBeforeQuestion' in('rare','sometimes','usually')
      and profile->'preferredMoves'<>'{}'::jsonb
      and jsonb_array_length(profile->'avoids')>=1
  end;
$$;

commit;
