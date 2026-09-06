begin;
select plan(6);

select ok(public.kivelle_valid_character_performance('{"version":1,"source":"derived"}'), 'Legacy/imported characters may derive behavior from their live identity');
select ok(not public.kivelle_valid_character_performance(null), 'Missing profiles are invalid');
select ok(not public.kivelle_valid_character_performance('{"version":99,"source":"derived"}'), 'Unknown schema versions are rejected');
select ok(not public.kivelle_valid_character_performance('{"version":1,"source":"authored","states":{}}'), 'Incomplete authored profiles cannot silently become published character data');
select is((select count(*) from public.together_character_versions where not public.kivelle_valid_character_performance(character_bible->'performance')),0::bigint,'Every existing character version has a supported performance contract');

-- Updating through a legacy writer cannot remove the compatibility contract.
update public.together_character_versions set character_bible=character_bible-'performance'
where id=(select id from public.together_character_versions order by id limit 1);
select is((select count(*) from public.together_character_versions where not public.kivelle_valid_character_performance(character_bible->'performance')),0::bigint,'Future/legacy writes preserve the contract automatically');

select * from finish();
rollback;
