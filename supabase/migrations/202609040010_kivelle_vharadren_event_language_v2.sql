begin;

-- Vharadren shipped with a complete authored weekly schedule, but its rows
-- predated the three-variant presentation contract. The global recovery
-- trigger therefore supplied the same generic routine copy to every resident.
-- Build presentation language from canon already stored on each resident:
-- diegetic weekday, district, exact place, occupation, and interests.
create or replace function public.kivelle_vharadren_schedule_variants(
  p_activity text,
  p_activity_key text,
  p_day text,
  p_slot integer,
  p_occupation text,
  p_interests text[],
  p_location text,
  p_district text
) returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  day_name text:=coalesce(nullif(trim(p_day),''),'the day');
  district_name text:=coalesce(nullif(trim(p_district),''),'the district');
  place_name text:=nullif(trim(p_location),'');
  occupation_name text:=coalesce(nullif(trim(p_occupation),''),'their work');
  occupation_clause text;
  interest_count integer:=coalesce(cardinality(p_interests),0);
  primary_interest text;
  secondary_interest text;
  at_place text;
  variants text[];
begin
  occupation_clause:=lower(left(occupation_name,1))||substr(occupation_name,2);
  if interest_count>0 then
    primary_interest:=p_interests[mod(greatest(0,coalesce(p_slot,0))+char_length(day_name),interest_count)+1];
    secondary_interest:=p_interests[mod(greatest(0,coalesce(p_slot,0))+char_length(day_name)+2,interest_count)+1];
  else
    primary_interest:='private correspondence';
    secondary_interest:='the district''s latest news';
  end if;
  at_place:=case when place_name is null then ' in private quarters' else ' at '||place_name end;

  variants:=case coalesce(p_activity_key,'')
    when 'home_morning' then array[
      'Taking a private '||day_name||' morning before '||district_name||'''s bells gather pace',
      'Starting the day with '||primary_interest||' and a quiet first meal',
      'Preparing for the day''s work as '||occupation_clause||' before stepping back into '||district_name
    ]
    when 'early_anchor' then array[
      'Beginning '||day_name||'''s work as '||occupation_clause||' before the streets fill'||at_place,
      'Taking the first difficult decisions of the day'||at_place,
      'Reviewing '||primary_interest||' by first bell before the day''s obligations take hold'
    ]
    when 'day_anchor' then array[
      'Taking up '||day_name||'''s work as '||occupation_clause||at_place,
      'Handling the day''s practical business'||at_place||' while '||district_name||' is busiest, with '||primary_interest||' in view',
      'Working through the day''s hardest obligations'||at_place||' with '||secondary_interest||' still in view'
    ]
    when 'midday_anchor' then array[
      'Keeping the midday work moving'||at_place||' while serving as '||occupation_clause,
      'Taking a practical meal'||at_place||' while reviewing '||primary_interest,
      'Using '||district_name||'''s busiest hours to follow up on '||secondary_interest||at_place
    ]
    when 'afternoon_interest' then array[
      'Making room for '||primary_interest||at_place,
      'Meeting a trusted contact over '||secondary_interest||at_place,
      'Following a lead connected to '||primary_interest||at_place
    ]
    when 'evening_social' then array[
      'Reading the room'||at_place||', where old loyalties travel faster than wine',
      'Crossing paths with familiar faces'||at_place||' over '||primary_interest,
      'Letting '||day_name||'''s evening unfold'||at_place||' without losing sight of '||secondary_interest
    ]
    when 'home_evening' then array[
      'Leaving '||day_name||'''s demands outside and settling into private quarters',
      'Keeping late hours with '||primary_interest||' while '||district_name||' quiets',
      'Reviewing '||secondary_interest||' by low firelight before turning in'
    ]
    when 'late_worker_morning' then array[
      'Keeping the morning private before reporting to '||coalesce(place_name,'the late shift in '||district_name),
      'Making time for '||primary_interest||' before the late shift begins',
      'Taking a quiet meal and reviewing '||secondary_interest||' ahead of work'
    ]
    when 'day_preparation' then array[
      case when place_name is null then 'Preparing the night''s work in '||district_name||' for '||day_name else 'Getting ready for '||day_name||'''s late crowd at '||place_name end,
      'Checking supplies, promises, and loose ends'||at_place,
      'Handling the quiet work'||at_place||' before the doors open'
    ]
    when 'pre_shift_social' then array[
      'Taking a meal'||at_place||' while trading news about '||primary_interest,
      'Catching a trusted face'||at_place||' before the late shift',
      'Making room for '||secondary_interest||' while '||district_name||'''s night crowd gathers'
    ]
    when 'night_anchor' then array[
      'Working '||day_name||'''s late hours'||at_place,
      'Keeping '||coalesce(place_name,district_name)||' moving as '||district_name||'''s night crowd gathers',
      'Balancing duties as '||occupation_clause||' with '||primary_interest||' until closing'
    ]
    when 'home_late' then array[
      'Returning to private quarters after '||day_name||'''s late hours',
      'Letting the noise of '||district_name||' fall away behind a closed door',
      'Checking tomorrow''s obligations before finally resting'
    ]
    else array[
      coalesce(nullif(trim(p_activity),''),'Following '||day_name||'''s obligations')||case when place_name is null or position(lower(place_name) in lower(coalesce(p_activity,'')))>0 then '' else ' at '||place_name end,
      'Making time for '||primary_interest||at_place,
      'Following up on '||secondary_interest||' while moving through '||district_name
    ]
  end;

  return to_jsonb(variants);
end;
$$;

with context as(
  select schedule.id,schedule.activity,schedule.metadata,template.occupation,version.interests,location.name location_name,district.name district_name,
    coalesce(schedule.metadata->>'diegeticDay','the day') day_name,
    coalesce((schedule.metadata->>'slot')::integer,0) slot_number
  from public.together_schedule_templates schedule
  join public.together_character_versions version on version.id=schedule.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
  join public.together_worlds world on world.id=presence.world_id and world.slug='vharadren'
  left join public.together_locations location on location.id=schedule.location_id
  left join public.together_locations district on district.id=presence.home_location_id
)
update public.together_schedule_templates schedule
set metadata=schedule.metadata||jsonb_build_object(
  'activityLabel',variants.value->>0,
  'activityVariants',variants.value,
  'displayLocation',coalesce(context.location_name,'Private quarters in '||context.district_name),
  'eventLanguageVersion','vharadren_event_language_v2'
)
from context
cross join lateral(
  select public.kivelle_vharadren_schedule_variants(
    context.activity,context.metadata->>'activityKey',context.day_name,context.slot_number,
    context.occupation,context.interests,context.location_name,context.district_name
  ) value
) variants
where schedule.id=context.id;

with context as(
  select activity.id,activity.title,activity.activity_key,template.occupation,version.interests,location.name location_name,district.name district_name
  from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
  join public.together_worlds world on world.id=presence.world_id and world.slug='vharadren'
  left join public.together_locations district on district.id=presence.home_location_id
  left join public.together_locations location on location.world_id=world.id and location.slug=activity.location_slugs[1]
)
update public.together_character_activity_templates activity
set metadata=activity.metadata||jsonb_build_object(
  'activityLabel',variants.value->>0,
  'activityVariants',variants.value,
  'displayLocation',coalesce(context.location_name,'Private quarters in '||context.district_name),
  'eventLanguageVersion','vharadren_event_language_v2'
),updated_at=now()
from context
cross join lateral(
  select public.kivelle_vharadren_schedule_variants(
    context.title,context.activity_key,'the week',0,context.occupation,context.interests,
    context.location_name,context.district_name
  ) value
) variants
where activity.id=context.id;

-- Re-label already materialized blocks. The stable md5 choice keeps a block's
-- wording unchanged across refreshes while spreading the three variants.
with context as(
  select event.id,event.activity_key,event.title existing_title,event.metadata existing_metadata,
    template.occupation,version.interests,location.name location_name,district.name district_name,
    coalesce(source.metadata->>'diegeticDay','the day') day_name,
    coalesce((source.metadata->>'slot')::integer,0) slot_number,
    coalesce(source.metadata->'activityVariants',
      public.kivelle_vharadren_schedule_variants(event.title,event.activity_key,'the day',0,template.occupation,version.interests,location.name,district.name)
    ) variants
  from public.together_character_schedule_events event
  join public.together_character_instances instance on instance.id=event.character_instance_id
  join public.together_character_versions version on version.id=instance.character_version_id
  join public.together_character_templates template on template.id=instance.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
  join public.together_worlds world on world.id=presence.world_id and world.slug='vharadren'
  left join public.together_schedule_templates source
    on event.metadata->>'legacyTemplateId'=source.id::text
  left join public.together_locations location on location.id=event.location_id
  left join public.together_locations district on district.id=presence.home_location_id
), selected as(
  select context.*,
    context.variants->>(get_byte(decode(substr(md5(context.id::text),1,2),'hex'),0)%3) chosen_title
  from context
)
update public.together_character_schedule_events event
set title=selected.chosen_title,
  metadata=event.metadata||jsonb_build_object(
    'activityLabel',selected.chosen_title,
    'displayLocation',coalesce(selected.location_name,'Private quarters in '||selected.district_name),
    'eventLanguageVersion','vharadren_event_language_v2'
  ),
  generation_version='life_engine_v4_vharadren_language_v2',updated_at=now()
from selected where event.id=selected.id;

-- Repair current presence only when it still contains recovery copy. Active
-- plans and authored life-event presence are deliberately left untouched.
with context as(
  select instance.id,event.title event_title,template.occupation,version.interests,district.name district_name
  from public.together_character_instances instance
  join public.together_character_versions version on version.id=instance.character_version_id
  join public.together_character_templates template on template.id=instance.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
  join public.together_worlds world on world.id=presence.world_id and world.slug='vharadren'
  left join public.together_locations district on district.id=presence.home_location_id
  left join public.together_character_schedule_events event on event.id=instance.current_schedule_event_id
  where instance.current_activity~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'
)
update public.together_character_instances instance
set current_activity=coalesce(context.event_title,
    public.kivelle_vharadren_schedule_variants(instance.current_activity,'home_evening','the day',0,context.occupation,context.interests,null,context.district_name)->>0),
  life_engine_version='life_engine_v4_vharadren_language_v2',updated_at=now()
from context where instance.id=context.id;

-- Existing recurring world events were well-authored; mark and expose their
-- place context so presentation code never has to synthesize generic copy.
update public.together_event_templates event
set metadata=event.metadata||jsonb_build_object(
  'displayLocation',location.name,
  'eventLanguageVersion','vharadren_event_language_v2',
  'worldEvent',true
),updated_at=now()
from public.together_locations location
where event.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.id=event.default_location_id;

update public.together_world_event_templates event
set metadata=event.metadata||jsonb_build_object(
  'displayLocation',location.name,
  'eventLanguageVersion','vharadren_event_language_v2'
),updated_at=now()
from public.together_locations location
where event.world_id='10000000-0000-4000-8000-000000000013'::uuid
  and location.id=event.location_id;

comment on function public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text) is
  'Builds deterministic Vharadren schedule presentation variants from authored weekday, role, interest, place, and district context.';
revoke all on function public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text) to service_role;

commit;
