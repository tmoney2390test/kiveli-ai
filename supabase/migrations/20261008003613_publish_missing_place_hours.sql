-- Public visiting windows for venues that previously inherited an ambiguous
-- "always open" server default while the client said "hours not published".
-- A place's public hours do not grant access to staff or private areas.
with windows(world_slug, place_slug, opens, closes) as (
  values
    ('gilded-coast','arrival-steps','00:00','24:00'),
    ('gilded-coast','blue-lantern-inn','00:00','24:00'),
    ('gilded-coast','spice-courtyard','12:00','01:00'),
    ('gilded-coast','storm-clinic','00:00','24:00'),
    ('gilded-coast','breakwater-steps','00:00','24:00'),
    ('gilded-coast','reef-landing','05:00','21:00'),
    ('gilded-coast','coconut-beach','06:00','20:00'),
    ('gilded-coast','tidepool-cove','06:00','19:00'),
    ('gilded-coast','blackfin-anchorage','06:00','20:00'),
    ('gilded-coast','sable-reef','07:00','18:00'),
    ('neon-kyo','below-kyo','18:00','04:00'),
    ('vespormoor','grand-hall','10:00','17:00')
)
update public.together_locations l
set hours = jsonb_build_object('open', windows.opens, 'close', windows.closes),
    updated_at = now()
from windows
join public.together_worlds w on w.slug = windows.world_slug
where l.world_id = w.id
  and l.slug = windows.place_slug
  and l.owner_user_id is null
  and l.archived_at is null
  and l.hours is null;
