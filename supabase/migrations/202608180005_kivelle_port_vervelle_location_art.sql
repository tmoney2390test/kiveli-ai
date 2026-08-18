-- Register the first authored Port Vervelle location-art batch without coupling
-- database content to Expo's packaged file paths. The stable slug is the asset key.
with port_vervelle as (
  select id
  from public.together_worlds
  where slug = 'port-vervelle'
), photographed(slug) as (
  values
    ('atelier-amelie'),
    ('bellavista'),
    ('bellavista-apartments'),
    ('bellavista-fitness-club'),
    ('blue-lantern'),
    ('cafe-marelle'),
    ('casa-del-mare'),
    ('farmacia-vervelle'),
    ('fiore-and-fig'),
    ('forno-bellini'),
    ('harbor-steps'),
    ('la-sirena'),
    ('libreria-vervelle'),
    ('lido-vervelle'),
    ('luna-terrace'),
    ('maison-rouge'),
    ('marina-solana'),
    ('osteria-rosa'),
    ('palazzo-civico'),
    ('piazza-aurelia'),
    ('porto-marina'),
    ('porto-vecchio'),
    ('solana-beach-rentals'),
    ('spiaggia-solana'),
    ('velours'),
    ('vervelle-fish-market'),
    ('vervelle-sailing-house'),
    ('villa-mirabelle')
)
update public.together_locations as location
set
  visual_asset_key = location.slug,
  metadata = coalesce(location.metadata, '{}'::jsonb) || jsonb_build_object('photoStatus', 'ready'),
  updated_at = now()
from port_vervelle, photographed
where location.world_id = port_vervelle.id
  and location.slug = photographed.slug;

update public.together_worlds
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'photoStatus', 'partial',
    'mappedLocationPhotoCount', 28
  ),
  updated_at = now()
where slug = 'port-vervelle';
