begin;

-- Polish four grammatical constructions found by rendering the complete
-- Vharadren schedule catalog after 010. Future content generation already
-- emits the corrected forms; this updates rows deployed during the audit.
create or replace function pg_temp.polish_vharadren_variants(p_variants jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(
    case
      when value~'^Handling (.+) matters (.+) while (.+) is busiest$' then
        regexp_replace(value,'^Handling (.+) matters (.+) while (.+) is busiest$','Handling the day''s practical business \2 while \3 is busiest, with \1 in view')
      when value~'^Keeping the work of (.+) moving (.+) through midday$' then
        regexp_replace(value,'^Keeping the work of (.+) moving (.+) through midday$','Keeping the midday work moving \2 while serving as \1')
      when value~'^Preparing (.+) for (.+)''s late crowd$' then
        regexp_replace(value,'^Preparing (.+) for (.+)''s late crowd$','Getting ready for \2''s late crowd at \1')
      when value~'^Balancing the work of (.+) with (.+) until closing$' then
        regexp_replace(value,'^Balancing the work of (.+) with (.+) until closing$','Balancing duties as \1 with \2 until closing')
      else value
    end
  ) order by ordinality),'[]'::jsonb)
  from jsonb_array_elements_text(case when jsonb_typeof(p_variants)='array' then p_variants else '[]'::jsonb end)
    with ordinality items(value,ordinality)
$$;

update public.together_schedule_templates schedule
set metadata=jsonb_set(
  jsonb_set(schedule.metadata,'{activityVariants}',pg_temp.polish_vharadren_variants(schedule.metadata->'activityVariants'),true),
  '{activityLabel}',to_jsonb(pg_temp.polish_vharadren_variants(schedule.metadata->'activityVariants')->>0),true
)
from public.together_character_world_presence presence
where presence.character_version_id=schedule.character_version_id
  and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;

update public.together_character_activity_templates activity
set metadata=jsonb_set(
  jsonb_set(activity.metadata,'{activityVariants}',pg_temp.polish_vharadren_variants(activity.metadata->'activityVariants'),true),
  '{activityLabel}',to_jsonb(pg_temp.polish_vharadren_variants(activity.metadata->'activityVariants')->>0),true
),updated_at=now()
from public.together_character_world_presence presence
where presence.character_version_id=activity.character_version_id
  and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;

update public.together_character_schedule_events event
set title=case
    when event.title~'^Handling (.+) matters (.+) while (.+) is busiest$' then regexp_replace(event.title,'^Handling (.+) matters (.+) while (.+) is busiest$','Handling the day''s practical business \2 while \3 is busiest, with \1 in view')
    when event.title~'^Keeping the work of (.+) moving (.+) through midday$' then regexp_replace(event.title,'^Keeping the work of (.+) moving (.+) through midday$','Keeping the midday work moving \2 while serving as \1')
    when event.title~'^Preparing (.+) for (.+)''s late crowd$' then regexp_replace(event.title,'^Preparing (.+) for (.+)''s late crowd$','Getting ready for \2''s late crowd at \1')
    when event.title~'^Balancing the work of (.+) with (.+) until closing$' then regexp_replace(event.title,'^Balancing the work of (.+) with (.+) until closing$','Balancing duties as \1 with \2 until closing')
    else event.title end,
  metadata=jsonb_set(event.metadata,'{activityLabel}',to_jsonb(case
    when event.title~'^Handling (.+) matters (.+) while (.+) is busiest$' then regexp_replace(event.title,'^Handling (.+) matters (.+) while (.+) is busiest$','Handling the day''s practical business \2 while \3 is busiest, with \1 in view')
    when event.title~'^Keeping the work of (.+) moving (.+) through midday$' then regexp_replace(event.title,'^Keeping the work of (.+) moving (.+) through midday$','Keeping the midday work moving \2 while serving as \1')
    when event.title~'^Preparing (.+) for (.+)''s late crowd$' then regexp_replace(event.title,'^Preparing (.+) for (.+)''s late crowd$','Getting ready for \2''s late crowd at \1')
    when event.title~'^Balancing the work of (.+) with (.+) until closing$' then regexp_replace(event.title,'^Balancing the work of (.+) with (.+) until closing$','Balancing duties as \1 with \2 until closing')
    else event.title end),true),
  updated_at=now()
from public.together_character_instances instance
join public.together_character_world_presence presence on presence.character_version_id=instance.character_version_id
where instance.id=event.character_instance_id
  and presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;

-- Fail deployment if the live catalog ever regresses to the recovery copy or
-- loses the authored breadth established by this pass.
do $$
declare row_count integer; broken_count integer; distinct_count integer;
begin
  select count(*),count(*) filter(where jsonb_typeof(schedule.metadata->'activityVariants')<>'array' or jsonb_array_length(schedule.metadata->'activityVariants')<>3)
  into row_count,broken_count
  from public.together_schedule_templates schedule
  join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
  where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(distinct variant.value) into distinct_count
  from public.together_schedule_templates schedule
  join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
  cross join lateral jsonb_array_elements_text(schedule.metadata->'activityVariants') variant(value)
  where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid;
  if row_count<>2058 then raise exception 'Vharadren schedule audit expected 2058 rows, found %',row_count;end if;
  if broken_count<>0 then raise exception 'Vharadren schedule audit found % malformed variant sets',broken_count;end if;
  if distinct_count<=300 then raise exception 'Vharadren schedule audit found only % distinct variants',distinct_count;end if;
  if exists(
    select 1 from public.together_schedule_templates schedule
    join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
    where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
      and schedule.metadata::text~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'
  ) then raise exception 'Vharadren schedule audit found generic recovery copy';end if;
end;
$$;

commit;
