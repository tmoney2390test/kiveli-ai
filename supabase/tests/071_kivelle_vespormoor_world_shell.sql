begin;
select plan(6);

select has_rows($$select 1 from public.together_worlds where id='10000000-0000-4000-8000-000000000010'::uuid$$,'Vespormoor world exists');
select is((select slug from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'vespormoor','Vespormoor slug is canonical');
select is((select name from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'Vespormoor','Vespormoor name is canonical');
select is((select hero_asset_key from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'vespormoor-hero','Vespormoor hero art is configured');
select is((select metadata->>'contentStatus' from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'complete_world_v1','Vespormoor has complete playable content');
select is((select metadata->>'centralWarning' from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'Nothing beneath the water shall be awakened.','Vespormoor lake warning is canonical');

select * from finish();
rollback;
