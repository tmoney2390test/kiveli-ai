begin;
select plan(9);

select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast templates exist');
select is((select count(*) from public.together_character_versions where id::text like '23000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast versions exist');
select is((select count(*) from public.together_character_private_profiles where character_version_id::text like '23000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast private profiles exist');
select is((select count(*) from public.together_schedule_templates where character_version_id::text like '23000000-0000-4000-80a1-00000009%'), 840::bigint,
  '20 Gilded Coast companions have full-week authored schedules');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%' and age<23), 0::bigint,
  'no Gilded Coast adult-cast companion is under 23');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%' and spice_level=3), 20::bigint,
  'every Gilded Coast adult-cast companion is spice 3');
select ok(not exists(
  select 1 from public.together_character_private_profiles
  where character_version_id::text like '23000000-0000-4000-80a1-00000009%'
    and (length(coalesce(hidden_sexual,''))<40 or length(coalesce(intimate_anatomy,''))<40)
), 'every Gilded Coast adult-cast private profile has authored intimacy');
select is((select count(distinct slug) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%'), 20::bigint,
  'Gilded Coast adult-cast slugs are unique');
select is((
  select count(*) from public.together_schedule_templates s
  join public.together_locations l on l.id=s.location_id
  where s.character_version_id::text like '23000000-0000-4000-80a1-00000009%'
    and s.start_minute=0 and l.slug<>'blue-lantern-inn'
), 0::bigint, 'Gilded Coast adult-cast sleep blocks use photographed lodging');

select * from finish();
rollback;
