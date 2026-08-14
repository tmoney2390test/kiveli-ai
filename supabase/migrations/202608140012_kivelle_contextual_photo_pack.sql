-- A location-aware media pool: three distinct compositional opportunities for each City Life place.
insert into public.together_photo_opportunities(slug,title,trigger_event_category,location_tags,relationship_stages,content_level,shot_type,prompt_seed,metadata,active)
select
  'location-' || location.slug || '-' || shot.kind,
  location.name || ' · ' || shot.title,
  case when location.category in ('gallery','work') then 'work' when location.category in ('bar','lounge','music_venue','karaoke','comedy','barcade') then 'social' when location.category in ('park','garden','outdoors') then 'discovery' else 'ordinary' end,
  array[location.category,location.slug],
  array['acquaintance','friend','flirting','dating','exclusive','long_term'],
  case when location.category in ('restaurant','lounge','garden','cinema') then 'romance' else 'standard' end,
  shot.kind,
  format('%s at %s in Juniper City; %s composition, natural expression, grounded contemporary photography.', 'A fictional adult companion', location.name, shot.description),
  jsonb_build_object('location_id',location.id,'location_slug',location.slug,'composition',shot.kind,'continuity','Attach to the originating event, date, or Moment.'),
  true
from public.together_locations location
cross join (values
  ('scene','Scene','environmental scene showing the place'),
  ('candid','Candid','unposed candid in the middle of an activity'),
  ('portrait','Portrait','warm portrait with the location softly present')
) as shot(kind,title,description)
where location.world_id='10000000-0000-4000-8000-000000000001'::uuid
on conflict(slug) do update set title=excluded.title,trigger_event_category=excluded.trigger_event_category,location_tags=excluded.location_tags,relationship_stages=excluded.relationship_stages,content_level=excluded.content_level,shot_type=excluded.shot_type,prompt_seed=excluded.prompt_seed,metadata=excluded.metadata,active=true,updated_at=now();
