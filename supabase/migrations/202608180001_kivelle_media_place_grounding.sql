-- Tighten Glassline's canonical visual identity so both text-only and reference-assisted
-- media generation remain inside the gallery rather than drifting to nearby streets.
update public.together_locations
set canonical_visual_context = coalesce(canonical_visual_context, '{}'::jsonb) || jsonb_build_object(
  'canonicalPrompt', 'inside the main exhibition rooms of Glassline Gallery, a contemporary art gallery with high white walls, polished concrete floors, restrained track lighting, and a large central installation',
  'indoorOutdoor', 'indoor',
  'architecture', jsonb_build_array('high white exhibition walls', 'open central installation room', 'two quieter side galleries'),
  'materials', jsonb_build_array('white plaster', 'polished concrete', 'glass', 'light oak'),
  'lighting', jsonb_build_array('indirect gallery lighting', 'focused ceiling track lights', 'soft reflected daylight'),
  'recurringObjects', jsonb_build_array('contemporary installations', 'framed artwork', 'wall labels', 'sculpture plinths', 'minimal gallery benches'),
  'atmosphere', jsonb_build_array('minimal', 'observant', 'quiet during normal hours'),
  'visualAnchors', jsonb_build_array('large central installation room', 'high white walls', 'polished concrete floor', 'focused track lights'),
  'avoid', jsonb_build_array('street scene', 'sidewalk', 'outdoor plaza', 'building exterior', 'storefront exterior', 'traffic', 'vehicles', 'open sky as the setting')
), updated_at = now()
where world_id = '10000000-0000-4000-8000-000000000001'
  and slug = 'glassline-gallery';
