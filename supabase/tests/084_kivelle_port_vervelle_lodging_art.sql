begin;

select plan(8);

select is(
  (select count(*)::integer from public.together_locations as location join public.together_worlds as world on world.id=location.world_id where world.slug='port-vervelle' and location.slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste')),
  5,
  'all five Port Vervelle hotels exist'
);

select is(
  (select count(*)::integer from public.together_locations as location join public.together_worlds as world on world.id=location.world_id where world.slug='port-vervelle' and location.slug in('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste') and location.visual_asset_key=location.slug and location.metadata->>'photoStatus'='ready' and location.metadata->>'packagedAsset'='true'),
  5,
  'all five hotels use packaged canonical art'
);

select is((select visual_asset_key from public.together_locations where slug='celeste-spa'),'celeste-spa','Celeste Spa uses its canonical art');
select is((select metadata->>'photoStatus' from public.together_locations where slug='celeste-spa'),'ready','Celeste Spa art is ready');
select is((select metadata->>'mappedLocationPhotoCount' from public.together_worlds where slug='port-vervelle'),'43','Port Vervelle reports the real packaged location count');
select is((select visual_asset_key from public.together_locations where slug='locanda-vela'),'locanda-vela','Locanda Vela art is mapped');
select is((select visual_asset_key from public.together_locations where slug='hotel-coralline'),'hotel-coralline','Hotel Coralline art is mapped');
select is((select visual_asset_key from public.together_locations where slug='hotel-celeste'),'hotel-celeste','Hotel Celeste art is mapped');

select * from finish();
rollback;
