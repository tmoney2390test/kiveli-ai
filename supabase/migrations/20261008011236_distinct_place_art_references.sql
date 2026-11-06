-- Mark place art ready only after every canonical location has a distinct,
-- active image reference named for its own slug. Do not touch custom places.
do $place_art$
declare
  expected record;
  actual_count integer;
  reference_count integer;
  image_count integer;
  wrong_slug_count integer;
begin
  for expected in
    select * from (values
      ('gilded-coast',42),
      ('juniper-city',53),
      ('port-vervelle',51)
    ) as rows(world_slug, place_count)
  loop
    select count(distinct l.id),
           count(distinct l.id) filter (where a.id is not null),
           count(distinct a.sha256),
           count(distinct l.id) filter (where a.id is not null and a.metadata->>'sourcePath' not like '%/'||l.slug||'.%')
      into actual_count, reference_count, image_count, wrong_slug_count
    from public.together_locations l
    join public.together_worlds w on w.id=l.world_id
    left join public.together_media_reference_assets a
      on a.location_id=l.id and a.asset_role='location_canonical' and a.active
    where w.slug=expected.world_slug and l.owner_user_id is null and l.archived_at is null;
    if actual_count<>expected.place_count or reference_count<>expected.place_count
       or image_count<>expected.place_count or wrong_slug_count<>0 then
      raise exception 'Place art audit failed for %: places %, references %, distinct %, wrong slug %',
        expected.world_slug,actual_count,reference_count,image_count,wrong_slug_count;
    end if;
  end loop;

  update public.together_locations l
  set metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
      'photoStatus','ready','assetStatus','reference_ready'),
      updated_at=now()
  from public.together_worlds w
  where l.world_id=w.id and w.slug in ('gilded-coast','juniper-city','port-vervelle')
    and l.owner_user_id is null and l.archived_at is null;

  update public.together_worlds w
  set metadata=coalesce(w.metadata,'{}'::jsonb)||jsonb_build_object(
      'locationPhotoStatus','reference_ready',
      'mappedLocationPhotoCount',art_counts.place_count,
      'distinctLocationPhotoCount',art_counts.place_count),
      updated_at=now()
  from (values ('gilded-coast',42),('juniper-city',53),('port-vervelle',51))
    as art_counts(world_slug,place_count)
  where w.slug=art_counts.world_slug;
end $place_art$;
