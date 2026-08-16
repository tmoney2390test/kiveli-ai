begin;

-- Chloe was seeded against Maya's residence and photography studio. Give her
-- canonical City Life spaces so presence, schedule simulation, and Home agree.
insert into public.together_locations(
  id, world_id, name, slug, description, category, visual_asset_key, hours,
  possible_activities, metadata, location_type, sort_order, canonical_visual_context
) values
(
  '11000000-0000-4000-8000-000000000026',
  '10000000-0000-4000-8000-000000000001',
  E'Chloe\'s Loft',
  'chloe-loft',
  E'Chloe\'s bright city loft: bold art, a crowded record shelf, design books, and the kind of living room that regularly turns into a late-night hangout.',
  'home',
  'chloe-loft',
  null,
  array['rest','cook','listen to music','watch movies','host friends'],
  '{"private":true,"owner_template_slug":"chloe","tags":["home","design","music"]}'::jsonb,
  'residence',
  26,
  '{"canonicalPrompt":"a stylish contemporary city loft belonging to a young designer, with bold modern art, warm lamps, design books, records, textured furniture, and large evening windows","indoorOutdoor":"indoor","materials":["warm wood","painted plaster","brushed metal","textured fabric"],"lighting":["warm floor lamps","soft city window light"],"furniture":["low modular sofa","record shelf","large work table"],"visualAnchors":["bold abstract prints","stacked design books","vinyl records","large city-facing windows"],"avoid":["photography darkroom","camera contact sheets","generic hotel room"]}'::jsonb
),
(
  '11000000-0000-4000-8000-000000000027',
  '10000000-0000-4000-8000-000000000001',
  E'Chloe\'s Design Studio',
  'chloe-design-studio',
  E'A working design studio with material samples, pinned concepts, prototypes, and a long communal table that is almost never completely clear.',
  'work',
  'chloe-design-studio',
  jsonb_build_object('open','08:00','close','19:00'),
  array['design sprint','client review','prototyping','research'],
  '{"owner_template_slug":"chloe","tags":["work","design","creative"]}'::jsonb,
  'venue',
  27,
  '{"canonicalPrompt":"a contemporary professional design studio with pinned concept boards, material samples, prototypes, monitors, and a long communal work table","indoorOutdoor":"indoor","materials":["pale wood","matte metal","paper","fabric samples"],"lighting":["large daylight windows","warm task lamps"],"visualAnchors":["concept boards","prototype shelf","material swatches","long shared table"],"avoid":["photography cyclorama","camera equipment as the main focus","corporate cubicle farm"]}'::jsonb
)
on conflict(id) do update set
  name=excluded.name,
  slug=excluded.slug,
  description=excluded.description,
  category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,
  hours=excluded.hours,
  possible_activities=excluded.possible_activities,
  metadata=excluded.metadata,
  location_type=excluded.location_type,
  sort_order=excluded.sort_order,
  canonical_visual_context=excluded.canonical_visual_context,
  updated_at=now();

update public.together_character_world_presence presence
set home_location_id='11000000-0000-4000-8000-000000000026', updated_at=now()
from public.together_character_versions version
where presence.character_version_id=version.id
  and presence.world_id='10000000-0000-4000-8000-000000000001'
  and version.character_template_id='12000000-0000-4000-8000-000000000002';

update public.together_schedule_templates
set location_id='11000000-0000-4000-8000-000000000026'
where character_version_id='13000000-0000-4000-8000-000000000002'
  and activity='offline for the night'
  and location_id='11000000-0000-4000-8000-000000000002';

update public.together_schedule_templates
set location_id='11000000-0000-4000-8000-000000000027'
where character_version_id='13000000-0000-4000-8000-000000000002'
  and activity='working through a design sprint'
  and location_id='11000000-0000-4000-8000-000000000006';

-- Repair already-created Chloe instances only when they are in the exact legacy
-- seeded activity/location pair. Deliberate visits to Maya remain untouched.
update public.together_character_instances
set current_location_id='11000000-0000-4000-8000-000000000026', updated_at=now()
where character_version_id='13000000-0000-4000-8000-000000000002'
  and current_location_id='11000000-0000-4000-8000-000000000002'
  and current_activity='offline for the night';

update public.together_character_instances
set current_location_id='11000000-0000-4000-8000-000000000027', updated_at=now()
where character_version_id='13000000-0000-4000-8000-000000000002'
  and current_location_id='11000000-0000-4000-8000-000000000006'
  and current_activity='working through a design sprint';

commit;
