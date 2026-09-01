-- Correct a PostgreSQL regex-boundary mismatch in 202609010003 and restore
-- the specific work prose from each character's canonical life configuration.

create or replace function public.kivelle_naturalize_character_activity(
  p_value text,
  p_activity_key text default null,
  p_occupation text default null
) returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  cleaned text := trim(regexp_replace(regexp_replace(coalesce(p_value,''),'_+',' ','g'),'\s+',' ','g'));
  parts text[];
  place_name text;
begin
  if cleaned='' then return 'Enjoying some free time'; end if;
  if p_occupation is not null and regexp_replace(lower(cleaned),'[^a-z0-9]+',' ','g')=regexp_replace(lower(trim(p_occupation)),'[^a-z0-9]+',' ','g') then return 'At work'; end if;

  parts:=regexp_match(cleaned,'^Following (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;
  parts:=regexp_match(cleaned,'^(?:Taking|Following) (?:the )?(?:weekday routine|Friday variation|Saturday variation|Sunday variation|weekend routine) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;

  if cleaned~*'^(A slower Sunday routine|Taking a slower Sunday with room for a real conversation)$' then return 'Taking Sunday at an easy pace'; end if;
  if cleaned~*'^Taking a genuine weekend routine$' then return 'Taking the weekend at an easy pace'; end if;
  if cleaned~*'^Taking private time at home(?: with .+)?$' then return 'Having some quiet time at home'; end if;
  if cleaned~*'^Making an ordinary meal at home$' then return 'Making something to eat at home'; end if;
  if cleaned~*'^Picking up a few practical things$' then return 'Running a few errands'; end if;
  if cleaned~*'^Cooking or recovering at home$' then return 'Taking it easy at home'; end if;
  if cleaned~*'^Starting the day at home$' then return 'Getting ready for the day at home'; end if;
  if cleaned~*'^Offline for the night$' then return 'Winding down'; end if;
  if cleaned~*'^Having some unstructured time(?: at home)?$' then return 'Enjoying some free time'; end if;
  if cleaned~*'^Winding down at home after a full .+ day$' then return 'Winding down at home'; end if;
  if cleaned~*'^Focused on work$' then return 'Working'; end if;
  if cleaned~*'^In the middle of a project$' then return 'Working on a project'; end if;
  if cleaned~*'^Taking care of a few things$' then return 'Running a few errands'; end if;

  parts:=regexp_match(cleaned,'^Handling an errand around (.+)$','i');
  if parts is not null then return 'Running an errand near '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Friday evening around (.+)$','i');
  if parts is not null then return 'Spending Friday evening at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Saturday around (.+)$','i');
  if parts is not null then return 'Spending Saturday at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(Breakfast|Lunch|Dinner)(.*)$','i');
  if parts is not null then return 'Having '||lower(parts[1])||parts[2];end if;
  parts:=regexp_match(cleaned,'^Drinks(.*)$','i');
  if parts is not null then return 'Having drinks'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Coffee(.*)$','i');
  if parts is not null then return 'Having coffee'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Movie(.*)$','i');
  if parts is not null then return 'Watching a movie'||parts[1];end if;
  return upper(left(cleaned,1))||substr(cleaned,2);
end;
$$;

create or replace function public.kivelle_character_work_variants(p_life_config jsonb,p_occupation text,p_activity_key text)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare candidates jsonb;block jsonb;title text:=coalesce(nullif(trim(p_occupation),''),nullif(trim(p_life_config#>>'{occupation,title}'),''),'professional');
begin
  candidates:=p_life_config#>'{occupation,activityVariants}';
  if jsonb_typeof(candidates)='array' and jsonb_array_length(candidates)>0 then return candidates;end if;
  if jsonb_typeof(p_life_config#>'{occupation,scheduleBlocks}')='array' then
    for block in select value from jsonb_array_elements(p_life_config#>'{occupation,scheduleBlocks}') loop
      if (block->>'activityKey'=p_activity_key or p_activity_key like '%_'||(block->>'key') or p_activity_key like '%'||(block->>'key')||'%')
        and jsonb_typeof(block->'activityVariants')='array' and jsonb_array_length(block->'activityVariants')>0 then return block->'activityVariants';end if;
    end loop;
    select value->'activityVariants' into candidates from jsonb_array_elements(p_life_config#>'{occupation,scheduleBlocks}')
      where jsonb_typeof(value->'activityVariants')='array' and jsonb_array_length(value->'activityVariants')>0 limit 1;
    if candidates is not null then return candidates;end if;
  end if;
  return jsonb_build_array('Working as '||case when title~*'^[aeiou]' then 'an ' else 'a ' end||lower(title));
end;
$$;

create or replace function public.kivelle_recovered_work_label(p_activity_key text,p_work_variants jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when p_activity_key in('post_work_reset','post_shift_home') then 'Unwinding at home after work'
    when p_activity_key in('pre_work_routine','pre_shift_home') or p_activity_key like 'occupation_prep_%' then 'Getting ready for work'
    when p_activity_key='work_break' then 'Taking a break at work'
    else public.kivelle_naturalize_character_activity(p_work_variants->>0,null,null)
  end
$$;

create or replace function public.kivelle_recovered_work_variants(p_activity_key text,p_work_variants jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case
    when p_activity_key in('post_work_reset','post_shift_home') then jsonb_build_array('Unwinding at home after work')
    when p_activity_key in('pre_work_routine','pre_shift_home') or p_activity_key like 'occupation_prep_%' then jsonb_build_array('Getting ready for work')
    when p_activity_key='work_break' then jsonb_build_array('Taking a break at work')
    else (select coalesce(jsonb_agg(to_jsonb(public.kivelle_naturalize_character_activity(item.value,null,null)) order by item.ordinality),'[]'::jsonb) from jsonb_array_elements_text(p_work_variants) with ordinality item(value,ordinality))
  end
$$;

with recovered as(
  select schedule.id,coalesce(schedule.metadata->>'activityKey',schedule.activity) activity_key,
    public.kivelle_character_work_variants(version.life_config,template.occupation,coalesce(schedule.metadata->>'activityKey',schedule.activity)) work_variants
  from public.together_schedule_templates schedule
  join public.together_character_versions version on version.id=schedule.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where schedule.activity='At work' or schedule.metadata->'activityVariants' @> '["At work"]'::jsonb
)
update public.together_schedule_templates schedule set
  activity=public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants),
  metadata=jsonb_set(jsonb_set(schedule.metadata,'{activityLabel}',to_jsonb(public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants)),true),'{activityVariants}',public.kivelle_recovered_work_variants(recovered.activity_key,recovered.work_variants),true)
from recovered where recovered.id=schedule.id;

with recovered as(
  select activity.id,activity.activity_key,public.kivelle_character_work_variants(version.life_config,template.occupation,activity.activity_key) work_variants
  from public.together_character_activity_templates activity
  join public.together_character_versions version on version.id=activity.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  where activity.title='At work' or activity.metadata->'activityVariants' @> '["At work"]'::jsonb
)
update public.together_character_activity_templates activity set
  title=public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants),
  metadata=jsonb_set(jsonb_set(activity.metadata,'{activityLabel}',to_jsonb(public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants)),true),'{activityVariants}',public.kivelle_recovered_work_variants(recovered.activity_key,recovered.work_variants),true),updated_at=now()
from recovered where recovered.id=activity.id;

with recovered as(
  select schedule.id,schedule.activity_key,public.kivelle_character_work_variants(version.life_config,template.occupation,schedule.activity_key) work_variants
  from public.together_character_schedule_events schedule
  join public.together_character_instances instance on instance.id=schedule.character_instance_id
  join public.together_character_versions version on version.id=instance.character_version_id
  join public.together_character_templates template on template.id=instance.character_template_id
  where schedule.title='At work' or schedule.metadata->'activityVariants' @> '["At work"]'::jsonb
)
update public.together_character_schedule_events schedule set
  title=public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants),
  metadata=jsonb_set(jsonb_set(schedule.metadata,'{activityLabel}',to_jsonb(public.kivelle_recovered_work_label(recovered.activity_key,recovered.work_variants)),true),'{activityVariants}',public.kivelle_recovered_work_variants(recovered.activity_key,recovered.work_variants),true),updated_at=now()
from recovered where recovered.id=schedule.id;

update public.together_character_instances instance set
  current_activity=public.kivelle_recovered_work_label('occupation_primary',public.kivelle_character_work_variants(version.life_config,template.occupation,'occupation_primary')),updated_at=now()
from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id
where version.id=instance.character_version_id and instance.current_activity='At work';

update public.together_life_events event set title=schedule.title,narrative_summary=case when event.narrative_summary='At work.' or event.narrative_summary='At work' then schedule.title||'.' else event.narrative_summary end
from public.together_character_schedule_events schedule
where schedule.id=(event.metadata->>'scheduleEventId')::uuid and (event.title='At work' or event.narrative_summary in('At work','At work.'));
