-- Repair existing rows after the generator was corrected. Disable only the
-- presentation normalizers inside this transaction so a large backfill does
-- not repeatedly reprocess each row. Ownership validation remains enabled.
begin;

alter table public.together_schedule_templates disable trigger kivelle_normalize_schedule_template_language;

-- Vharadren already has a canon-aware builder for three detailed variants.
with context as (
  select schedule.id,schedule.activity,schedule.metadata,template.occupation,version.interests,
    location.name location_name,district.name district_name
  from public.together_schedule_templates schedule
  join public.together_character_versions version on version.id=schedule.character_version_id
  join public.together_character_templates template on template.id=version.character_template_id
  join public.together_character_world_presence presence on presence.character_version_id=version.id
  join public.together_worlds world on world.id=presence.world_id and world.slug='vharadren'
  left join public.together_locations location on location.id=schedule.location_id
  left join public.together_locations district on district.id=presence.home_location_id
  where (schedule.metadata->'activityVariants')::text~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'
), authored as (
  select context.id,public.kivelle_vharadren_schedule_variants(
    context.activity,context.metadata->>'activityKey',coalesce(context.metadata->>'diegeticDay','the day'),
    case when context.metadata->>'slot'~'^[0-9]+$' then (context.metadata->>'slot')::integer else 0 end,
    context.occupation,context.interests,context.location_name,context.district_name
  ) variants from context
)
update public.together_schedule_templates schedule
set metadata=jsonb_set(jsonb_set(schedule.metadata,'{activityVariants}',authored.variants,true),
  '{activityLabel}',to_jsonb(authored.variants->>0),true)
from authored where schedule.id=authored.id;

with repaired as (
  select schedule.id,schedule.activity,
    coalesce((select jsonb_agg(to_jsonb(trim(regexp_replace(item.value,
      '\s+while leaving room for the day to change naturally[.!]?$','','i'))) order by item.ordinality)
      from jsonb_array_elements_text(schedule.metadata->'activityVariants') with ordinality item(value,ordinality)
      where not public.kivelle_schedule_variant_is_filler(item.value)),
      jsonb_build_array(schedule.activity)) variants
  from public.together_schedule_templates schedule
  where (schedule.activity||' '||coalesce((schedule.metadata->'activityVariants')::text,'')||' '||coalesce(schedule.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|while leaving room for the day to change naturally)'
)
update public.together_schedule_templates schedule
set metadata=jsonb_set(jsonb_set(coalesce(schedule.metadata,'{}'::jsonb),'{activityVariants}',repaired.variants,true),
  '{activityLabel}',to_jsonb(case when public.kivelle_schedule_variant_is_filler(schedule.metadata->>'activityLabel')
    then repaired.variants->>0
    else public.kivelle_clean_schedule_variant(coalesce(schedule.metadata->>'activityLabel',schedule.activity)) end),true)
from repaired where schedule.id=repaired.id;

alter table public.together_schedule_templates enable trigger kivelle_normalize_schedule_template_language;

alter table public.together_character_activity_templates disable trigger kivelle_normalize_activity_template_language;
with repaired as (
  select activity.id,coalesce((select jsonb_agg(to_jsonb(trim(regexp_replace(item.value,
    '\s+while leaving room for the day to change naturally[.!]?$','','i'))) order by item.ordinality)
    from jsonb_array_elements_text(activity.metadata->'activityVariants') with ordinality item(value,ordinality)
    where not public.kivelle_schedule_variant_is_filler(item.value)),
    jsonb_build_array(activity.title)) variants
  from public.together_character_activity_templates activity
  where (activity.title||' '||coalesce((activity.metadata->'activityVariants')::text,'')||' '||coalesce(activity.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|while leaving room for the day to change naturally)'
)
update public.together_character_activity_templates activity
set metadata=jsonb_set(jsonb_set(coalesce(activity.metadata,'{}'::jsonb),'{activityVariants}',repaired.variants,true),
  '{activityLabel}',to_jsonb(case when public.kivelle_schedule_variant_is_filler(activity.metadata->>'activityLabel')
    then repaired.variants->>0
    else public.kivelle_clean_schedule_variant(coalesce(activity.metadata->>'activityLabel',activity.title)) end),true),
  updated_at=now()
from repaired where activity.id=repaired.id;
alter table public.together_character_activity_templates enable trigger kivelle_normalize_activity_template_language;

alter table public.together_character_schedule_events disable trigger kivelle_normalize_materialized_schedule_language;
with repaired as (
  select event.id,coalesce((select jsonb_agg(to_jsonb(trim(regexp_replace(item.value,
    '\s+while leaving room for the day to change naturally[.!]?$','','i'))) order by item.ordinality)
    from jsonb_array_elements_text(event.metadata->'activityVariants') with ordinality item(value,ordinality)
    where not public.kivelle_schedule_variant_is_filler(item.value)),
    public.kivelle_ensure_schedule_variants('[]'::jsonb,event.title,event.activity_key,event.metadata->>'routineKind',null)) variants
  from public.together_character_schedule_events event
  where (event.title||' '||coalesce((event.metadata->'activityVariants')::text,'')||' '||coalesce(event.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|while leaving room for the day to change naturally)'
)
update public.together_character_schedule_events event
set title=case when public.kivelle_schedule_variant_is_filler(event.title)
    then repaired.variants->>0 else public.kivelle_clean_schedule_variant(event.title,event.activity_key,null) end,
  metadata=jsonb_set(jsonb_set(coalesce(event.metadata,'{}'::jsonb),'{activityVariants}',repaired.variants,true),
    '{activityLabel}',to_jsonb(case when public.kivelle_schedule_variant_is_filler(event.metadata->>'activityLabel')
      then repaired.variants->>0
      else public.kivelle_clean_schedule_variant(coalesce(event.metadata->>'activityLabel',event.title),event.activity_key,null)
    end),true),
  updated_at=now()
from repaired where event.id=repaired.id;
alter table public.together_character_schedule_events enable trigger kivelle_normalize_materialized_schedule_language;

update public.together_character_instances instance
set current_activity=event.title,updated_at=now()
from public.together_character_schedule_events event
where event.id=instance.current_schedule_event_id
  and public.kivelle_schedule_variant_is_filler(instance.current_activity)
  and not public.kivelle_schedule_variant_is_filler(event.title);

commit;
