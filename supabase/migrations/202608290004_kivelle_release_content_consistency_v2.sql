begin;

-- Eos shipped its first-meeting narration under `opener`, while the app's
-- canonical contract reads setup/opening_line and uses world_id directly.
update public.together_character_templates template
set first_meeting=coalesce(template.first_meeting,'{}'::jsonb)||jsonb_build_object(
      'world_id','10000000-0000-4000-8000-000000000012'::uuid,
      'title',coalesce(nullif(template.first_meeting->>'title',''),'Meet '||template.name),
      'setup',coalesce(nullif(template.first_meeting->>'setup',''),template.first_meeting->>'opener'),
      'companion_activity',coalesce(nullif(template.first_meeting->>'companion_activity',''),'spending time at '||location.name),
      'mood',coalesce(nullif(template.first_meeting->>'mood',''),'curious'),
      'opening_line',coalesce(
        nullif(template.first_meeting->>'opening_line',''),
        'Hi - I''m '||split_part(template.name,' ',1)||'. Have you been to '||location.name||' before?'
      )
    ),
    updated_at=now()
from public.together_locations location
where template.id::text like '24000000-0000-4000-8012-%'
  and location.id=(template.first_meeting->>'location_id')::uuid
  and location.world_id='10000000-0000-4000-8000-000000000012'::uuid;

-- Later authored homes must retain the same environment-only prompt contract
-- as the original virtual-home catalog.
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

-- The NEON KYO male expansion authored five canonical routine places per
-- companion but landed after the shared place-profile foundation migration.
with expansion as(
  select version.id character_version_id,template.name,
    (template.first_meeting->>'location_id')::uuid first_meeting_location_id,
    template.discovery_metadata->>'districtSlug' district_slug
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
    and template.current_published_version=version.version
  where template.id::text like '22000000-0000-4000-8009-%'
    and right(template.id::text,12)::bigint between 31 and 45
), candidates as(
  select expansion.character_version_id,expansion.name,expansion.first_meeting_location_id location_id,100 score,'first_meeting' reason
  from expansion
  union all
  select expansion.character_version_id,expansion.name,location.id,90,'home_district'
  from expansion
  join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000009'::uuid
   and location.slug=expansion.district_slug
  union all
  select expansion.character_version_id,expansion.name,schedule.location_id,80,'schedule'
  from expansion
  join public.together_schedule_templates schedule on schedule.character_version_id=expansion.character_version_id
  where schedule.location_id is not null
), distinct_candidates as(
  select character_version_id,name,location_id,max(score) score,
    (array_agg(reason order by score desc))[1] reason
  from candidates
  group by character_version_id,name,location_id
), ranked as(
  select distinct_candidates.*,
    row_number() over(partition by character_version_id order by score desc,location_id) rank
  from distinct_candidates
), seeds as(
  select ranked.*,location.name location_name,location.category,location.possible_activities,
    coalesce(location.canonical_lore#>>'{signatureDetails,0}',location.description) favorite_detail
  from ranked
  join public.together_locations location on location.id=ranked.location_id
  where ranked.rank<=5
)
insert into public.together_character_place_profiles(
  character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,
  opinion_tags,preferred_activities,favorite_details,disliked_details,metadata
)
select character_version_id,location_id,
  case reason when 'first_meeting' then .82 when 'home_district' then .72 else .88 end,
  case reason when 'first_meeting' then .62 when 'home_district' then .48 else .56 end,
  case reason when 'first_meeting' then .84 when 'home_district' then .74 else .86 end,
  name||' knows '||location_name||' through '||replace(reason,'_',' ')||' and has an established opinion about spending time there.',
  array_remove(array[category,reason],null),possible_activities[1:2],
  array[favorite_detail],array[]::text[],
  jsonb_build_object('source','neon_kyo_male_place_backfill_v1','reason',reason,'version',1)
from seeds
on conflict(character_version_id,location_id) do nothing;

do $$
declare invalid_count integer;
begin
  select count(*) into invalid_count
  from public.together_character_templates
  where published and can_be_selected
    and (coalesce(first_meeting->>'world_id','')=''
      or coalesce(first_meeting->>'location_id','')=''
      or coalesce(first_meeting->>'opening_line','')='');
  if invalid_count<>0 then
    raise exception '% selectable companions still have incomplete first meetings',invalid_count;
  end if;

  select count(*) into invalid_count
  from public.together_character_homes
  where canonical_visual_context->>'canonicalPrompt'<>prompt_text
    or canonical_visual_context->>'indoorOutdoor'<>'indoor'
    or canonical_visual_context->>'environmentReferencePolicy'<>'text_only'
    or prompt_text not ilike '%separate canonical character identity reference%';
  if invalid_count<>0 then
    raise exception '% homes still violate the canonical environment prompt contract',invalid_count;
  end if;

  select count(*) into invalid_count from(
    select version.id
    from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id
      and template.current_published_version=version.version
    left join public.together_character_place_profiles profile on profile.character_version_id=version.id
    where template.id::text like '22000000-0000-4000-8009-%'
      and right(template.id::text,12)::bigint between 31 and 45
    group by version.id having count(profile.id)<5
  ) incomplete;
  if invalid_count<>0 then
    raise exception '% NEON KYO expansion companions still lack five place perspectives',invalid_count;
  end if;
end $$;

commit;
