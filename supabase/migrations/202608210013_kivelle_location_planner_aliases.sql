-- Natural dialogue often shortens Northline Motor Lodge or calls it the Motor
-- House. Keep those authored variants attached to the canonical place so chat
-- planning still resolves to the real Juniper City location.
update public.together_locations
set metadata=jsonb_set(
  coalesce(metadata,'{}'::jsonb),
  '{aliases}',
  coalesce(metadata->'aliases','[]'::jsonb) || '["Motor Lodge","Northline Lodge","Motor House"]'::jsonb,
  true
),updated_at=now()
where slug='northline-motor-lodge';
