-- Run explicitly after visual approval. An incomplete world rolls back the
-- entire release. User-created homes, historical versions and Eos are excluded.
begin;
do $publish$
declare target record; total integer; ready integer;
begin
 for target in select * from (values ('calders-run',69),('gilded-coast',56),('juniper-city',58),('neon-kyo',65),('northvale',65),('port-vervelle',64),('vespormoor',67),('vharadren',72)) as worlds(slug,expected) loop
  select count(*),count(*) filter(where h.source='authored' and h.canonical_lore ? 'homeCatalogRevision'
    and cardinality(h.possible_activities)=6 and jsonb_array_length(h.personal_details)=3
    and a.id is not null and a.status='ready' and a.home_id=h.id and a.storage_path is not null
    and a.thumbnail_path is not null and a.width>0 and a.height>0) into total,ready
  from public.together_character_homes h
  join public.together_character_versions v on v.id=h.character_version_id
  join public.together_character_templates t on t.id=v.character_template_id
  join public.together_worlds w on w.id=h.world_id
  left join public.together_home_artwork a on a.id=h.approved_artwork_id
  where w.slug=target.slug and w.published and h.active and t.published and t.creator_id is null and v.version=t.current_published_version;
  if total<>target.expected or ready<>target.expected then raise exception 'Home release blocked for %: % current, % ready, % expected',target.slug,total,ready,target.expected; end if;
  update public.together_character_homes h set visits_enabled=true,updated_at=now()
  from public.together_character_versions v,public.together_character_templates t,public.together_worlds w
  where h.character_version_id=v.id and t.id=v.character_template_id and w.id=h.world_id
    and w.slug=target.slug and w.published and h.active and t.published and t.creator_id is null
    and v.version=t.current_published_version and not h.visits_enabled;
 end loop;
end $publish$;
commit;
