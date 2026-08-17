begin;

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
) values (
  '11000000-0000-4000-8000-000000000028',
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000023',
  'Juniper Civic Arena',
  'juniper-civic-arena',
  'Juniper City''s multi-purpose sports arena, hosting basketball, hockey, indoor soccer, boxing, and the loud shared rituals around game night.',
  'entertainment',
  'juniper-civic-arena',
  '{"open":"10:00","close":"23:59"}'::jsonb,
  array['basketball game','hockey game','indoor soccer','boxing night'],
  '{
    "tags":["sports","arena","entertainment","live events","crowds","competitive"],
    "social_energy":"high",
    "privacy":"low",
    "date_types":["sporting event","game night"],
    "interactionPacks":["sports"],
    "event_programs":[
      {"activityKey":"basketball_game","title":"Juniper Flight Basketball","daysOfWeek":[5,6],"startTime":"19:30","durationMinutes":150,"scheduleNote":"Tipoff is at 7:30 PM on Friday and Saturday game nights."},
      {"activityKey":"hockey_game","title":"Juniper Forge Hockey","daysOfWeek":[2,4],"startTime":"19:00","durationMinutes":165,"scheduleNote":"Puck drop is at 7:00 PM on Tuesday and Thursday game nights."},
      {"activityKey":"indoor_soccer","title":"Juniper Indoor Soccer","daysOfWeek":[0],"startTime":"16:00","durationMinutes":120,"scheduleNote":"Sunday matches begin at 4:00 PM."},
      {"activityKey":"boxing_night","title":"Juniper Fight Night","daysOfWeek":[6],"startTime":"20:00","durationMinutes":180,"scheduleNote":"Saturday fight cards begin at 8:00 PM."}
    ]
  }'::jsonb,
  'venue',
  28,
  1,
  '{
    "canonicalPrompt":"Juniper Civic Arena, a contemporary glass, brick, and steel multi-purpose sports arena in Alder District, Juniper City",
    "indoorOutdoor":"mixed",
    "architecture":["broad glass entrance hall","brick and dark steel exterior","large oval arena bowl"],
    "materials":["brick","black steel","glass","polished concrete"],
    "lighting":["warm plaza lights","bright event concourse","focused arena lighting"],
    "recurringObjects":["ticket scanners","section signs","concession counters","retractable court and rink infrastructure"],
    "visualAnchors":["curved roofline","two abstract event screens","tree-lined entrance plaza","central glass atrium"],
    "atmosphere":["anticipatory","high-energy","civic game-night ritual"],
    "avoid":["real team logos","real athlete likenesses","futuristic stadium","outdoor baseball field","empty generic convention hall"]
  }'::jsonb,
  '{
    "summary":"The city''s main indoor arena changes personality with the schedule: basketball and hockey draw the regular crowds, while soccer and fight nights reshape the floor and the mood.",
    "atmosphere":["loud on event nights","anticipatory in the plaza","competitive without being a sports bar"],
    "sensoryDetails":["crowd noise rolling through the glass atrium","warm pretzels and arena food near the concourse","cold rink air on hockey nights","shoe squeaks carrying during basketball warmups"],
    "signatureDetails":["curved roofline","central glass atrium","north concourse overlook","event floor that converts between court, rink, and ring"],
    "layout":["broad entrance plaza","two-level public concourse","steep indoor seating bowl","club level along the east side","reconfigurable event floor"],
    "crowdRhythm":{"morning":"Staff and youth programs use the building without a full event crowd.","afternoon":"Crews convert the floor and early fans begin arriving.","evening":"The plaza, concourses, and seating bowl fill around the scheduled event.","late_night":"Crowds spill back into Alder District after the final buzzer or bout."},
    "conversationHooks":["which side to root for","whether the upper bowl or lower corner has the better view","the arena food everyone defends despite knowing better","how quickly the floor changes between sports"],
    "stableFacts":["The arena hosts basketball, hockey, indoor soccer, and boxing.","Event start times come from the arena program and should not be invented.","The floor and lighting configuration change by sport.","Juniper Flight and Juniper Forge are fictional local teams."],
    "localEtiquette":["Wait for a break in play before moving through a crowded row.","Do not claim a score or winner unless a canonical event or shared scene establishes it."],
    "nearbyLocationSlugs":["alder-district","pixel-and-pint","northside-bar","marquee-cinema"]
  }'::jsonb
)
on conflict(id) do update set
  world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,
  possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  updated_at=now();

update public.together_locations
set canonical_lore=jsonb_set(
  canonical_lore,
  '{nearbyLocationSlugs}',
  coalesce(canonical_lore->'nearbyLocationSlugs','[]'::jsonb)||'"juniper-civic-arena"'::jsonb,
  true
),updated_at=now()
where world_id='10000000-0000-4000-8000-000000000001'
  and slug='alder-district'
  and not (coalesce(canonical_lore->'nearbyLocationSlugs','[]'::jsonb) ? 'juniper-civic-arena');

commit;
