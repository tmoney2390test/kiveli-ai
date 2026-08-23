begin;
select plan(5);

select has_rows($$select 1 from public.together_worlds where id='10000000-0000-4000-8000-000000000010'::uuid$$,'Vespormoor world exists');
select is((select slug from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'vespormoor','Vespormoor identity is canonical');
select ok((select published from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'Vespormoor is published');
select is((select hero_asset_key from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'vespormoor-hero','Vespormoor artwork is configured');
select is((select metadata->>'releaseStatus' from public.together_worlds where id='10000000-0000-4000-8000-000000000010'),'playable','Vespormoor release is fully playable');

select * from finish();
rollback;
