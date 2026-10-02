begin;
select plan(8);

select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-%'), 160::bigint,
  '160 adult-cast templates exist');
select is((select count(*) from public.together_character_versions where id::text like '23000000-0000-4000-80a1-%'), 160::bigint,
  '160 adult-cast versions exist');
select is((select count(*) from public.together_character_private_profiles where character_version_id::text like '23000000-0000-4000-80a1-%'), 160::bigint,
  '160 adult-cast private profiles exist');
select is((select count(*) from public.together_schedule_templates where character_version_id::text like '23000000-0000-4000-80a1-%'), 6720::bigint,
  '160 companions have full-week authored schedules');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-%' and age<23), 0::bigint,
  'no adult-cast companion is under 23');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-%' and spice_level=3), 160::bigint,
  'every adult-cast companion is spice 3');
select ok(not exists(
  select 1 from public.together_character_private_profiles
  where character_version_id::text like '23000000-0000-4000-80a1-%'
    and (length(coalesce(hidden_sexual,''))<40 or length(coalesce(intimate_anatomy,''))<40)
), 'every adult-cast private profile has authored intimacy');
select is((select count(distinct slug) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-%'), 160::bigint,
  'adult-cast slugs are unique');

select * from finish();
rollback;
