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

-- Roster expansions land after location-depth v2. Give every newly published
-- resident the same bounded five-place perspective foundation as the launch
-- cast, including Vespormoor and Port Vervelle's expanded roster.
with current_companions as(
  select template.slug as character_slug,template.name as character_name,template.first_meeting,
    version.id as character_version_id,version.interests,presence.world_id,world.slug as world_slug
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id and version.version=template.current_published_version
  join public.together_character_world_presence presence
    on presence.character_version_id=version.id and presence.presence_type='resident'
  join public.together_worlds world
    on world.id=presence.world_id and world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor')
  where template.published and template.can_be_selected and template.lifecycle_status<>'archived'
), candidate_rows as(
  select companion.character_version_id,location.id as location_id,120+count(*)::integer as score,'schedule'::text as reason
  from current_companions companion
  join public.together_schedule_templates schedule on schedule.character_version_id=companion.character_version_id
  join public.together_locations location on location.id=schedule.location_id and location.world_id=companion.world_id
  group by companion.character_version_id,location.id
  union all
  select companion.character_version_id,location.id,110,'first_meeting'
  from current_companions companion
  join public.together_locations location
    on location.id=(companion.first_meeting->>'location_id')::uuid and location.world_id=companion.world_id
  union all
  select companion.character_version_id,location.id,70,'interest_match'
  from current_companions companion
  join public.together_locations location
    on location.world_id=companion.world_id and location.location_type<>'district'
      and location.metadata->>'private' is distinct from 'true'
  where exists(
    select 1 from unnest(companion.interests) interest
    where concat_ws(' ',location.name,location.category,location.description,array_to_string(location.possible_activities,' ')) ilike '%'||interest||'%'
  )
  union all
  select companion.character_version_id,location.id,
    10+(abs(hashtext(companion.character_slug||':'||location.slug))%10),'world_fallback'
  from current_companions companion
  join public.together_locations location
    on location.world_id=companion.world_id and location.location_type<>'district'
      and location.category not in('home','work') and location.metadata->>'private' is distinct from 'true'
), candidates as(
  select character_version_id,location_id,max(score) as score,(array_agg(reason order by score desc))[1] as reason
  from candidate_rows group by character_version_id,location_id
), ranked as(
  select candidates.*,
    row_number() over(partition by candidates.character_version_id order by candidates.score desc,candidates.location_id) as rank
  from candidates
), seeds as(
  select companion.character_version_id,companion.character_name,companion.world_slug,
    ranked.reason,location.id as location_id,location.name,location.category,location.possible_activities,
    coalesce(location.canonical_lore#>>'{atmosphere,0}','familiar') as atmosphere_word,
    coalesce(location.canonical_lore#>>'{signatureDetails,0}',location.description) as favorite_detail
  from ranked
  join current_companions companion using(character_version_id)
  join public.together_locations location on location.id=ranked.location_id
  where ranked.rank<=5
)
insert into public.together_character_place_profiles(
  character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,
  opinion_tags,preferred_activities,favorite_details,disliked_details,metadata
)
select character_version_id,location_id,
  case reason when 'schedule' then .9 when 'first_meeting' then .82 when 'interest_match' then .64 else .42 end,
  case reason when 'schedule' then .58 when 'first_meeting' then .62 when 'interest_match' then .66 else .44 end,
  case reason when 'schedule' then .88 when 'first_meeting' then .82 when 'interest_match' then .72 else .58 end,
  character_name||' experiences '||name||' as '||atmosphere_word||'; '||
    coalesce(possible_activities[1],lower(category))||' is the part of the place that most naturally fits '||
    case when reason='schedule' then 'their established routine.'
      when reason='first_meeting' then 'the way they first connect with someone here.'
      when reason='interest_match' then 'their interests and independent life.'
      else 'the side of '||world_slug||' they are most likely to notice.' end,
  array_remove(array[category,atmosphere_word,reason],null),possible_activities[1:2],
  array[favorite_detail],array[]::text[],
  jsonb_build_object('source','release_consistency_place_foundation','reason',reason,'version',2)
from seeds
on conflict(character_version_id,location_id) do nothing;

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
