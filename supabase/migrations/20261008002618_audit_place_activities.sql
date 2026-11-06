-- Curated public activities for The Gilded Coast. Only unchanged canonical rows update.
with edits(slug, old_activities, new_activities, descriptions) as (
 values
  ('admiralty-quay', ARRAY['walking','conversation','exploring']::text[], ARRAY['Walk the public quay','Follow the ferry bells','Watch crews load cargo']::text[], '{"Follow the ferry bells":"Watch the landing crews signal each arriving ferry."}'::jsonb),
  ('arrival-steps', ARRAY['meeting arrivals','watching ships','conversation']::text[], ARRAY['meeting arrivals','watching ships','Read the arrival board']::text[], '{"Read the arrival board":"Check the chalk board for the next ferry and its passengers."}'::jsonb),
  ('customs-house', ARRAY['customs inquiry','paperwork','conversation']::text[], ARRAY['customs inquiry','paperwork','Check a cargo seal']::text[], '{"Check a cargo seal":"Ask a clerk to verify a public cargo seal at the counter."}'::jsonb),
  ('brass-compass', ARRAY['breakfast','drinks','listening to music','conversation']::text[], ARRAY['breakfast','drinks','listening to music','Take the back table']::text[], '{"Take the back table":"Settle in at the quiet table after the breakfast rush."}'::jsonb),
  ('ferry-hall', ARRAY['waiting for ferry','planning a crossing','conversation']::text[], ARRAY['waiting for ferry','planning a crossing','Check the tide clock']::text[], '{"Check the tide clock":"Compare the posted ferry time with the tide clock."}'::jsonb),
  ('sailors-exchange', ARRAY['finding a crew','trading gear','conversation']::text[], ARRAY['finding a crew','trading gear','Read the wage notices']::text[], '{"Read the wage notices":"Compare the crew openings and posted pay rates."}'::jsonb),
  ('harbor-court', ARRAY['attending a hearing','reading notices','conversation']::text[], ARRAY['attending a hearing','reading notices','Watch a public case']::text[], '{"Watch a public case":"Sit in the gallery for an open harbor hearing."}'::jsonb),
  ('gilt-row', ARRAY['walking','conversation','exploring']::text[], ARRAY['Walk the sea-facing terraces','Browse the shop windows','Look for old harbor maps']::text[], '{"Browse the shop windows":"See what the jewellers and map sellers have on display."}'::jsonb),
  ('pearl-salon', ARRAY['listening to music','conversation','dancing']::text[], ARRAY['listening to music','Join a salon debate','dancing']::text[], '{"Join a salon debate":"Take a side in the discussion after the music."}'::jsonb),
  ('salt-ledger-bank', ARRAY['banking','reviewing contracts','conversation']::text[], ARRAY['banking','reviewing contracts','Ask about a ship loan']::text[], '{"Ask about a ship loan":"Discuss published loan terms at the public desk."}'::jsonb),
  ('gilt-auction', ARRAY['viewing an auction','bidding','conversation']::text[], ARRAY['viewing an auction','bidding','Inspect a lot']::text[], '{"Inspect a lot":"Look over a map or cargo lot before the bidding starts."}'::jsonb),
  ('glass-garden', ARRAY['garden walk','tea','conversation']::text[], ARRAY['garden walk','tea','Sit by the water basin']::text[], '{"Sit by the water basin":"Find a table beside the garden’s mosaic basin."}'::jsonb),
  ('velvet-balcony', ARRAY['watching a play','music','conversation']::text[], ARRAY['watching a play','music','Talk at intermission']::text[], '{"Talk at intermission":"Step onto the balcony while the cast resets the stage."}'::jsonb),
  ('montrose-jewels', ARRAY['browsing jewellery','craft lesson','conversation']::text[], ARRAY['browsing jewellery','craft lesson','Inspect a repaired piece']::text[], '{"Inspect a repaired piece":"Ask to see how a damaged sea find was set without hiding its cracks."}'::jsonb),
  ('ropewalk', ARRAY['walking','conversation','exploring']::text[], ARRAY['Walk the repair sheds','Watch rope being laid','Stop at the workers’ kitchen']::text[], '{"Watch rope being laid":"Follow the public edge of the sheds while crews twist new line."}'::jsonb),
  ('shipwright-yard', ARRAY['watching shipbuilding','learning repairs','conversation']::text[], ARRAY['watching shipbuilding','learning repairs','Study a hull frame']::text[], '{"Study a hull frame":"Watch the builders fit ribs from behind the marked beam line."}'::jsonb),
  ('sail-loft', ARRAY['sewing sails','craft lesson','conversation']::text[], ARRAY['sewing sails','craft lesson','Examine a patched sail']::text[], '{"Examine a patched sail":"Ask a sailmaker about the old teaching piece in the loft."}'::jsonb),
  ('ropewalk-kitchen', ARRAY['eating together','cooking','conversation']::text[], ARRAY['eating together','cooking','Help serve supper']::text[], '{"Help serve supper":"Carry bowls to the long table when the shift changes."}'::jsonb),
  ('drydock-baths', ARRAY['bathing','relaxing','conversation']::text[], ARRAY['bathing','relaxing','Choose a quiet room']::text[], '{"Choose a quiet room":"Take a break in the separate quiet bathing room."}'::jsonb),
  ('rivet-school', ARRAY['learning seamanship','ropework','conversation']::text[], ARRAY['learning seamanship','ropework','Try a practice knot']::text[], '{"Try a practice knot":"Learn a knot on the practice rig with an instructor."}'::jsonb),
  ('lantern-foundry', ARRAY['watching metalwork','craft lesson','conversation']::text[], ARRAY['watching metalwork','craft lesson','Compare signal lamps']::text[], '{"Compare signal lamps":"Look at finished lamps from the cool side of the workshop."}'::jsonb),
  ('lantern-market', ARRAY['walking','conversation','exploring']::text[], ARRAY['Explore the evening lane','Follow the food stalls','Listen for the street musicians']::text[], '{"Follow the food stalls":"Walk the evening lane and choose what to eat."}'::jsonb),
  ('night-market', ARRAY['market tasting','shopping','conversation']::text[], ARRAY['market tasting','shopping','Browse the chart stall']::text[], '{"Browse the chart stall":"Look over the maps sold between the food and cloth stands."}'::jsonb),
  ('house-of-hours', ARRAY['tea','conversation','adult companionship']::text[], ARRAY['tea','Read the house rules','adult companionship']::text[], '{"Read the house rules":"Learn the worker-run house’s boundaries in the public tea room."}'::jsonb),
  ('mariners-table', ARRAY['dinner','cooking','conversation']::text[], ARRAY['dinner','cooking','Share the last stew']::text[], '{"Share the last stew":"Join the long table while the kitchen still has stew."}'::jsonb),
  ('blue-lantern-inn', ARRAY['lodging','breakfast','conversation']::text[], ARRAY['lodging','breakfast','Rest in the courtyard']::text[], '{"Rest in the courtyard":"Take a quiet break beside the inn’s courtyard well."}'::jsonb),
  ('spice-courtyard', ARRAY['street food','games','music','conversation']::text[], ARRAY['street food','games','music','Join a chess game']::text[], '{"Join a chess game":"Take an open board when the evening players gather."}'::jsonb),
  ('breakwater-point', ARRAY['walking','conversation','exploring']::text[], ARRAY['Walk the sea wall','Watch the fort drill','Climb the public lighthouse stair']::text[], '{"Walk the sea wall":"Keep to the public path above the outer surf."}'::jsonb),
  ('lightkeep', ARRAY['lighthouse climb','watching the sea','conversation']::text[], ARRAY['lighthouse climb','watching the sea','View the old lens']::text[], '{"View the old lens":"See the lighthouse lens from the public stair."}'::jsonb),
  ('storm-clinic', ARRAY['medical care','visiting','conversation']::text[], ARRAY['medical care','visiting','Bring dry blankets']::text[], '{"Bring dry blankets":"Ask staff if the rescue blanket shelf needs restocking."}'::jsonb),
  ('battery-yard', ARRAY['watching drills','history walk','conversation']::text[], ARRAY['watching drills','history walk','Watch the warning drill']::text[], '{"Watch the warning drill":"Observe the fort crew from the public side of the powder line."}'::jsonb),
  ('tide-observatory', ARRAY['weather watching','chart lesson','conversation']::text[], ARRAY['weather watching','chart lesson','Compare tide records']::text[], '{"Compare tide records":"Read today’s tide marks beside the storm-year record."}'::jsonb),
  ('breakwater-steps', ARRAY['seaside walk','watching ships','conversation']::text[], ARRAY['seaside walk','watching ships','Read the storm memorial']::text[], '{"Read the storm memorial":"Pause at the names cut into the upper stone."}'::jsonb),
  ('signal-house', ARRAY['signal-flag lesson','watching arrivals','conversation']::text[], ARRAY['signal-flag lesson','watching arrivals','Learn the warning flags']::text[], '{"Learn the warning flags":"Ask which flag warns ships away from the reef."}'::jsonb),
  ('outer-cays', ARRAY['walking','conversation','exploring']::text[], ARRAY['Visit an island landing','Find the public ferry','Ask about the return tide']::text[], '{"Find the public ferry":"Check which island landing has a return crossing today."}'::jsonb),
  ('reef-landing', ARRAY['arriving by ferry','fishing','conversation']::text[], ARRAY['arriving by ferry','fishing','Check the last return']::text[], '{"Check the last return":"Ask when the tide will allow the ferry back to Tidemark."}'::jsonb),
  ('tidepool-cove', ARRAY['tidepool walk','drawing','conversation']::text[], ARRAY['tidepool walk','drawing','Watch the crabs']::text[], '{"Watch the crabs":"Look for small crabs without disturbing the protected pools."}'::jsonb),
  ('windward-village', ARRAY['village visit','net mending','conversation']::text[], ARRAY['village visit','net mending','Visit the village square']::text[], '{"Visit the village square":"Stop at the public square between the net sheds and well."}'::jsonb),
  ('blackfin-anchorage', ARRAY['watching ships','boat repair','conversation']::text[], ARRAY['watching ships','boat repair','Walk the repair dock']::text[], '{"Walk the repair dock":"Watch hull repairs from the public section of the small dock."}'::jsonb)
)
update public.together_locations as l
set possible_activities = e.new_activities,
    canonical_lore = jsonb_set(coalesce(l.canonical_lore, '{}'::jsonb), '{activityDescriptions}', e.descriptions, true),
    updated_at = now()
from edits as e
join public.together_worlds as w on w.slug = 'gilded-coast'
where l.world_id = w.id
  and l.slug = e.slug
  and l.owner_user_id is null
  and l.archived_at is null
  and l.possible_activities = e.old_activities;

-- Remove the remaining bare "conversation" activity from the other published worlds.
with edits(world_slug, slug, new_activity, description) as (
 values
  ('calders-run', 'copper-mare-saloon', 'Ask about tonight''s supper', 'See what the kitchen is serving before the music starts.'),
  ('eos-meridian', 'blue-shift', 'Sit after a shift', 'Take a quiet table with the workers coming off duty.'),
  ('juniper-city', 'juniper-cafe', 'Wait for the open mic', 'Find a seat before the neighborhood performers start.'),
  ('juniper-city', 'velvet-hour', 'Listen to the set', 'Settle in with a drink while the musicians play.'),
  ('neon-kyo', 'gallery-null', 'Question an exhibit label', 'Read the artist credit and ask what the work leaves out.'),
  ('neon-kyo', 'quiet-hours', 'Find a quiet table', 'Take a table away from the busiest part of the bar.'),
  ('neon-kyo', 'scarlet-garden', 'Walk the rooftop garden', 'Step through the glowing foliage above the street.'),
  ('neon-kyo', 'soba-miyako', 'Watch the noodle counter', 'Take a counter seat and watch the bowls being prepared.'),
  ('neon-kyo', 'the-balcony', 'Lean on the rooftop rail', 'Take in the view with the neighbors who use this roof.'),
  ('neon-kyo', 'whisper-bridge', 'Ask an honest question', 'Stop above the canal and follow the bridge''s local custom.'),
  ('port-vervelle', 'blue-lantern', 'Hear a sailor''s story', 'Stay for a song or a story from the harbor regulars.'),
  ('port-vervelle', 'harbor-steps', 'Watch the fishing boats', 'Sit on the stone steps as the boats return to port.')
)
update public.together_locations as l
set possible_activities = array_replace(l.possible_activities, 'conversation', e.new_activity),
    canonical_lore = jsonb_set(
      coalesce(l.canonical_lore, '{}'::jsonb),
      '{activityDescriptions}',
      (coalesce(l.canonical_lore->'activityDescriptions', '{}'::jsonb) - 'conversation') || jsonb_build_object(e.new_activity, e.description),
      true
    ),
    updated_at = now()
from edits as e
join public.together_worlds as w on w.slug = e.world_slug
where l.world_id = w.id
  and l.slug = e.slug
  and l.owner_user_id is null
  and l.archived_at is null
  and 'conversation' = any(l.possible_activities);
