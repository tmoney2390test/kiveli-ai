begin;
select plan(7);

select has_column('public','together_character_templates','spice_level','Characters have a canonical spice level');
select col_not_null('public','together_character_templates','spice_level','Every character has an authored or default spice level');
select col_type_is('public','together_character_templates','spice_level','smallint','Spice level uses a compact constrained integer');
select has_trigger('public','together_character_templates','together_character_templates_sync_spice','Creator connection configuration stays synchronized with the template');
select ok(not exists(select 1 from public.together_character_templates where spice_level not between 1 and 3),'All character spice levels remain between one and three');
select is((select spice_level from public.together_character_templates where slug='sofia'),1::smallint,'Sofia has authored mild chemistry');
select is((select spice_level from public.together_character_templates where slug='avery'),3::smallint,'Avery has authored bold chemistry');

select * from finish();
rollback;
