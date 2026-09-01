begin;
select plan(6);

select is(public.kivelle_remove_schedule_cliche('Checking the market without rushing what comes next'),'Checking the market','Schedule cliche is removed from arbitrary activity text');
select is(public.kivelle_remove_schedule_cliche_metadata('{"activityVariants":["Seeing friends without rushing what comes next"]}'::jsonb)->'activityVariants'->>0,'Seeing friends','Schedule cliche is removed from metadata variants');
select is((select count(*)::integer from public.together_schedule_templates where activity ilike '%without rushing what comes next%' or metadata::text ilike '%without rushing what comes next%'),0,'Schedule templates contain no repeated cliche');
select is((select count(*)::integer from public.together_character_activity_templates where title ilike '%without rushing what comes next%' or metadata::text ilike '%without rushing what comes next%'),0,'Activity templates contain no repeated cliche');
select is((select count(*)::integer from public.together_character_schedule_events where title ilike '%without rushing what comes next%' or metadata::text ilike '%without rushing what comes next%'),0,'Materialized schedule events contain no repeated cliche');
select is((select count(*)::integer from public.together_character_instances where current_activity ilike '%without rushing what comes next%'),0,'Current character activity contains no repeated cliche');

select * from finish();
rollback;
