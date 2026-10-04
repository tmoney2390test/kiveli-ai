begin;
select plan(9);

select is(
  public.kivelle_ensure_schedule_variants(
    '["Checking patient requests and preparing clinic doses","Making time for a familiar routine","Following the day''s routine at an easy pace"]'::jsonb,
    'Checking patient requests and preparing clinic doses',null,null,null
  ),
  '["Checking patient requests and preparing clinic doses"]'::jsonb,
  'recovery never pads a specific activity with generic variants'
);

select is(
  public.kivelle_clean_schedule_variant('Editing photographs while leaving room for the day to change naturally'),
  'Editing photographs',
  'vague suffixes are removed without losing the activity'
);

select is(public.kivelle_schedule_variant_is_filler('Having some quiet time at home'),false,
  'quiet time remains valid when it is the actual authored activity');

select is(public.kivelle_ensure_schedule_variants(
  '["Getting ready for the day at home","Spending some time at Home","Getting ready for the day at home"]'::jsonb,
  'Getting ready for the day at home',null,null,null),
  '["Getting ready for the day at home"]'::jsonb,
  'generic home-reset padding cannot replace the concrete activity');

select is((select count(*)::integer from public.together_schedule_templates schedule
  where (schedule.activity||' '||coalesce((schedule.metadata->'activityVariants')::text,'')||' '||coalesce(schedule.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep|while leaving room for the day to change naturally)'),
  0,'weekly schedules have no displayed recovery filler');

select is((select count(*)::integer from public.together_character_activity_templates activity
  where (activity.title||' '||coalesce((activity.metadata->'activityVariants')::text,'')||' '||coalesce(activity.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep|while leaving room for the day to change naturally)'),
  0,'activity templates have no displayed recovery filler');

select is((select count(*)::integer from public.together_character_schedule_events event
  where (event.title||' '||coalesce((event.metadata->'activityVariants')::text,'')||' '||coalesce(event.metadata->>'activityLabel',''))
    ~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep|while leaving room for the day to change naturally)'),
  0,'materialized schedules have no displayed recovery filler');

select is((select count(*)::integer from public.together_character_instances instance
  where instance.current_activity~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace|staying focused on today''s work|taking care of the day''s responsibilities|getting some uninterrupted rest at home|keeping things quiet and getting some sleep)'),
  0,'current character presence has no recovery filler');

select ok(not exists(select 1 from public.together_schedule_templates schedule
  where jsonb_typeof(schedule.metadata->'activityVariants')='array'
    and jsonb_array_length(schedule.metadata->'activityVariants')=0),
  'every authored schedule retains at least one real activity');

select * from finish();
rollback;
