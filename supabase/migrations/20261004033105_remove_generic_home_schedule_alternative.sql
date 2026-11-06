-- Northvale's old home-reset padding replaced "getting ready" on some days.
-- Keep the actual activity and repair already-materialized titles.
begin;

create or replace function public.kivelle_schedule_variant_is_filler(p_value text)
returns boolean language sql immutable set search_path='' as $$
  select trim(coalesce(p_value,'')) ~* '^(making time for a familiar routine|following the day''s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep|spending some time at home)[.!]?$';
$$;
revoke all on function public.kivelle_schedule_variant_is_filler(text) from public, anon, authenticated;

alter table public.together_schedule_templates disable trigger kivelle_normalize_schedule_template_language;
update public.together_schedule_templates schedule
set metadata=jsonb_set(schedule.metadata,'{activityVariants}',
  public.kivelle_ensure_schedule_variants(schedule.metadata->'activityVariants',schedule.activity,
    schedule.metadata->>'activityKey',schedule.metadata->>'routineKind',null),true)
where (schedule.metadata->'activityVariants')::text ilike '%Spending some time at Home%';
alter table public.together_schedule_templates enable trigger kivelle_normalize_schedule_template_language;

alter table public.together_character_activity_templates disable trigger kivelle_normalize_activity_template_language;
update public.together_character_activity_templates activity
set metadata=jsonb_set(activity.metadata,'{activityVariants}',
  public.kivelle_ensure_schedule_variants(activity.metadata->'activityVariants',activity.title,
    activity.activity_key,activity.metadata->>'routineKind',null),true),
  updated_at=now()
where (activity.metadata->'activityVariants')::text ilike '%Spending some time at Home%';
alter table public.together_character_activity_templates enable trigger kivelle_normalize_activity_template_language;

alter table public.together_character_schedule_events disable trigger kivelle_normalize_materialized_schedule_language;
with repaired as (
  select event.id,public.kivelle_ensure_schedule_variants(event.metadata->'activityVariants',
    event.title,event.activity_key,event.metadata->>'routineKind',null) variants
  from public.together_character_schedule_events event
  where event.title ilike 'Spending some time at Home'
    or (event.metadata->'activityVariants')::text ilike '%Spending some time at Home%'
)
update public.together_character_schedule_events event
set title=case when public.kivelle_schedule_variant_is_filler(event.title)
    then repaired.variants->>0 else event.title end,
  metadata=jsonb_set(jsonb_set(coalesce(event.metadata,'{}'::jsonb),'{activityVariants}',repaired.variants,true),
    '{activityLabel}',to_jsonb(case when public.kivelle_schedule_variant_is_filler(event.metadata->>'activityLabel')
      then repaired.variants->>0 else coalesce(event.metadata->>'activityLabel',event.title) end),true),
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
