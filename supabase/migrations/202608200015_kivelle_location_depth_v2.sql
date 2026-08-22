begin;

create table if not exists public.together_location_lore_layers(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.together_locations(id) on delete cascade,
  layer_key text not null,
  disclosure_scope text not null check(disclosure_scope in('character','relationship','story')),
  min_relationship_stage text check(min_relationship_stage is null or min_relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  required_character_slugs text[] not null default '{}',
  required_story_keys text[] not null default '{}',
  lore jsonb not null default '{}'::jsonb check(jsonb_typeof(lore)='object'),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id,layer_key)
);

create index if not exists together_location_lore_layers_location_idx
  on public.together_location_lore_layers(location_id,active,disclosure_scope);

alter table public.together_location_lore_layers enable row level security;
revoke all on public.together_location_lore_layers from public,anon,authenticated;
grant select,insert,update,delete on public.together_location_lore_layers to service_role;

comment on table public.together_location_lore_layers is
  'Server-only location knowledge. Eligibility is resolved from companion identity, relationship stage, or active story state and the rows are never included in public place payloads.';

create or replace function pg_temp.kivelle_json_array_or(p_existing jsonb,p_fallback jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p_existing)='array' and jsonb_array_length(p_existing)>0 then p_existing else p_fallback end
$$;

create or replace function pg_temp.kivelle_json_object_or(p_existing jsonb,p_fallback jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p_existing)='object' and p_existing<>'{}'::jsonb then p_existing else p_fallback end
$$;

create temporary table kivelle_location_district_depth(
  world_slug text not null,
  district_slug text not null,
  atmosphere text[] not null,
  sensory text[] not null,
  public_history text[] not null,
  recurring_people jsonb not null,
  weather text[] not null,
  story_seeds text[] not null,
  primary key(world_slug,district_slug)
) on commit drop;

insert into kivelle_location_district_depth values
  ('juniper-city','citywide',array['contemporary','creative','lived-in'],array['traffic softened by tree-lined blocks','storefront music mixing with ordinary city noise','the changing light on brick, glass, and water'],array['Juniper City grew around creative work, neighborhood institutions, and public spaces that still reward walking instead of rushing.'],'[{"label":"weekday regulars","role":"neighbors, workers, and creative professionals","rhythm":"They recognize routines and notice when someone changes them."}]',array['Rain pulls people into cafes, shops, and covered entrances.','Clear evenings make rooftops, parks, and the river feel like extensions of the neighborhood.'],array['A familiar routine changes after an unexpected encounter.','A small creative opportunity becomes more personal than planned.']),
  ('juniper-city','alder-district',array['walkable','creative-commercial','social without feeling anonymous'],array['storefront music crossing on the sidewalk','delivery bikes along shaded side streets','evening restaurant light warming brick facades'],array['Alder became Juniper City''s gallery-and-bookshop district by adapting older commercial blocks instead of replacing them.'],'[{"label":"gallery and shop regulars","role":"artists, booksellers, designers, and nearby residents","rhythm":"Afternoons overlap with errands; evenings shift toward openings, dinner, and drinks."}]',array['Rain makes the gallery-bookshop stretch especially busy.','Warm evenings keep sidewalk tables and the route toward Velvet Hour active.'],array['A storefront change becomes the neighborhood''s favorite argument.','An opening-night introduction creates an unexpected connection.']),

  ('port-vervelle','porto-vecchio',array['salt-worn','communal','awake before the rest of town'],array['diesel, salt, and coffee near the working boats','rigging tapping against masts','fish crates and footsteps across damp stone'],array['Porto Vecchio is the town''s oldest working edge; arrivals, fishing, and family businesses still organize its day.'],'[{"label":"harbor regulars","role":"crews, fish sellers, café workers, and early risers","rhythm":"They know one another''s boats, orders, and excuses before breakfast."}]',array['Wind changes departures and the mood of the docks quickly.','Summer sun brightens the water while storms compress everyone into the harbor businesses.'],array['A delayed boat brings two routines into contact.','Harbor gossip contains one detail nobody agrees on.']),
  ('port-vervelle','piazza-aurelia',array['civic','sociable','layered with familiar rituals'],array['fountain water beneath conversation','bakery air crossing warm stone','chairs and shutters moving as businesses open'],array['Piazza Aurelia has long served as Port Vervelle''s civic and social center, holding markets, weddings, arguments, and festivals in the same few streets.'],'[{"label":"piazza regulars","role":"shopkeepers, municipal workers, families, and performers","rhythm":"Errands become conversations and public events rearrange everybody''s route."}]',array['Midday heat pushes conversations beneath awnings and arcades.','Rain makes the polished paving darker and brings neighbors into the same sheltered doorways.'],array['A routine civic errand becomes unexpectedly personal.','Festival preparations expose a disagreement the town has postponed.']),
  ('port-vervelle','marina-solana',array['sunlit by day','social after dark','flirtatious without losing its local character'],array['sunscreen, sea air, and grilled food','music traveling between terraces','sand and salt carried onto tiled floors'],array['Marina Solana expanded around the town beach, but local clubs, rentals, and late-night venues kept it from becoming a sealed resort strip.'],'[{"label":"beach and nightlife regulars","role":"lifeguards, servers, musicians, swimmers, and night workers","rhythm":"Day crews hand the district to dinner crowds, performers, and dancers."}]',array['Heat makes the beach busiest late in the day.','Coastal wind can empty cabanas, reshape music plans, and produce dramatic clear sunsets.'],array['A day at the beach extends into an unplanned night.','Someone familiar appears in a setting where they act completely different.']),
  ('port-vervelle','bellavista',array['residential','artistic','quietly observant'],array['climbing flowers against warm walls','footsteps on steep stone lanes','open windows carrying music and conversation'],array['Bellavista grew upward as homes, studios, and gardens filled the hillside above the harbor.'],'[{"label":"hillside neighbors","role":"residents, artists, trainers, and long-term tenants","rhythm":"They notice visitors, deliveries, and changed routines without needing to ask."}]',array['Afternoon sun reaches balconies longer than the lanes below.','Rain makes the steep streets slow and intensely quiet.'],array['A borrowed view becomes a private tradition.','A neighbor''s observation reveals more than intended.']),
  ('port-vervelle','mercato-vecchio',array['practical','busy early','deeply local'],array['produce, soap, bread, and scooter exhaust','metal shutters opening in sequence','vendors calling across narrow aisles'],array['Mercato Vecchio remains the town''s everyday commercial district, shaped more by repeat errands than visitors.'],'[{"label":"market regulars","role":"vendors, clinicians, tradespeople, and household shoppers","rhythm":"Morning is social and compressed; afternoons become practical and direct."}]',array['Heat accelerates morning shopping and quiets the streets after lunch.','Storm warnings send people through supplies and repairs in predictable waves.'],array['A basic errand uncovers a character''s private priority.','Two people keep crossing paths until coincidence stops being convincing.']),
  ('port-vervelle','capo-vervelle',array['secluded','wind-shaped','romantic without feeling staged'],array['wild herbs and salt above the cliffs','wind through olive trees','distant engines and waves below'],array['Capo Vervelle has always marked the transition from compact town life to vineyards, olive land, cliffs, and exposed sea routes.'],'[{"label":"capo regulars","role":"growers, hotel staff, walkers, and boat crews","rhythm":"Visits are deliberate and weather determines who stays."}]',array['Wind and visibility control the cliffs, cove, lighthouse, and sail routes.','Golden evenings can turn quickly cool after sunset.'],array['A weather change forces an intimate decision.','A quiet escape brings a postponed subject into the open.']),

  ('neon-kyo','hikari-core',array['aspirational','crowded','continuously analyzed'],array['reactive ads adjusting above the crowd','rain hiss beneath transit noise','clean retail fragrance against warm food counters'],array['Hikari Core was designed as Neon Kyo''s public promise: frictionless movement, luxury access, and measurable belonging.'],'[{"label":"rated commuters","role":"office workers, shoppers, promoters, and security staff","rhythm":"The crowd moves quickly while systems remember more than people do."}]',array['Rain intensifies reflections and moves surveillance coverage beneath awnings.','Humidity keeps indoor crossings and elevated routes crowded.'],array['A harmless rating change affects a human interaction.','Someone uses the crowd to become briefly untraceable.']),
  ('neon-kyo','shinjira',array['late-night','permissive on the surface','carefully controlled underneath'],array['bass through concrete and steel','perfume, rain, and late food in narrow entries','red light broken by anonymous doors'],array['Shinjira grew vertically around entertainment licensing, private clubs, and the city''s appetite for deniable behavior.'],'[{"label":"night-shift regulars","role":"performers, bartenders, promoters, security, and discreet clients","rhythm":"Names matter less after midnight, but patterns still do."}]',array['Rain makes doorways busier and hidden entrances harder to distinguish.','Hot nights push club queues onto terraces and rooftops.'],array['An unlisted room tests how much privacy can be purchased.','A familiar face is seen crossing a boundary they publicly defend.']),
  ('neon-kyo','aoyama-nine',array['immaculate','expensive','private by transaction rather than trust'],array['quiet elevators and conditioned air','water and glass high above traffic','subtle biometric chimes at controlled thresholds'],array['Aoyama-9 was built for the owners of Neon Kyo''s systems, offering altitude, discretion, and curated beauty as services.'],'[{"label":"credentialed regulars","role":"executives, clinicians, artists, household staff, and private security","rhythm":"Access looks effortless because verification happens before anyone reaches the door."}]',array['Storms turn the skyline into moving gray walls around the towers.','Clear evenings produce unusually exposed views across the monitored city.'],array['A flawless service record hides an intensely human favor.','A private invitation creates an obligation nobody states aloud.']),
  ('neon-kyo','akiba-undergrid',array['experimental','crowded with unfinished ideas','technically illegal at the edges'],array['solder, hot circuitry, and vending-machine broth','cooling fans behind patched walls','game audio leaking into workshop corridors'],array['The Undergrid formed where service infrastructure, unofficial labs, and subculture businesses occupied the levels commercial maps treated as secondary.'],'[{"label":"undergrid builders","role":"engineers, hackers, modders, gamers, and independent artists","rhythm":"They trade competence and favors more readily than credentials."}]',array['Heavy rain drives surface crowds underground and strains older power systems.','Heat accumulates in workshops and changes which rooms can stay occupied.'],array['A prototype works once and creates a problem.','A repair request reveals who has been quietly helping whom.']),
  ('neon-kyo','tsuki-blocks',array['dense','domestic','advertised to constantly'],array['laundry systems, food deliveries, and elevator tones','neighbors moving through shared corridors','warm apartment light behind smart glass'],array['The Tsuki Blocks were built to make efficient urban life attainable, but their shared amenities and thin privacy created stronger neighborhood cultures than planners expected.'],'[{"label":"tower neighbors","role":"residents, delivery workers, caretakers, and late-shift commuters","rhythm":"Small repeated encounters carry more weight than public introductions."}]',array['Rain keeps rooftop and courtyard activity inside shared amenity floors.','Humid nights fill balconies and convenience levels after dark.'],array['A shared amenity becomes the site of an honest conversation.','A delivery or elevator delay turns into a recurring connection.']),
  ('neon-kyo','old-kyo-the-shade',array['historic','quietly resistant','unreliably visible to systems'],array['canal water beneath old timber walkways','paper lanterns and rain on stone','tea, incense, and old wood inside compact rooms'],array['Old Kyo survived redevelopment through preservation fights, inherited property, and infrastructure that newer surveillance systems never fully understood.'],'[{"label":"shade regulars","role":"residents, craftspeople, shrine workers, musicians, and people avoiding attention","rhythm":"Recognition is personal here; strangers are noticed even when cameras fail."}]',array['Mist and rain create genuine surveillance blind spots along water and old roofs.','Clear nights make the quiet streets feel more exposed than storms do.'],array['A camera failure permits a choice that cannot be taken back.','A local recognizes someone who expected anonymity.']),

  ('vespormoor','old-vesper',array['historic','candlelit','social beneath practiced reserve'],array['rain on cobblestones and old glass','coffee, smoke, and wax in narrow rooms','gas-style lamps reflected in dark paving'],array['Old Vesper contains the rebuilt heart of the town, including businesses that survived or returned after the Burning Winter of 1846.'],'[{"label":"old-town regulars","role":"shopkeepers, scholars, clergy, and families with long memories","rhythm":"They distinguish newcomers, returnees, and people pretending to be either."}]',array['Rain brings the district''s warm interiors into sharper relief.','Fog shortens familiar streets and changes which courtyards are easy to find.'],array['An old business record contradicts a family story.','A familiar route opens onto a courtyard that should not be there.']),
  ('vespormoor','vesper-heights',array['secluded','formal','watched through family networks'],array['wet leaves along stone drives','horses and distant gates','warm estate windows above the lake fog'],array['Vesper Heights grew around the land controlled by the valley''s oldest families and the estates built after Lucien and Isolde Vesper arrived.'],'[{"label":"estate circles","role":"family staff, caretakers, riders, gardeners, and invited guests","rhythm":"Introductions and absences are noticed long before they become public."}]',array['Fog isolates estates from one another even when the town below is clear.','Snow and rain can close the steeper private roads.'],array['An estate invitation carries a hidden condition.','A supposedly empty house shows evidence of a routine.']),
  ('vespormoor','lakeward',array['romantic','fog-bound','uneasy beneath its calm'],array['black water against pilings','boat ropes and distant bells','cold mist entering warm dining rooms'],array['Lakeward grew around fishing, boat repair, old cottages, and the public paths that made Lake Vesper part of everyday town life.'],'[{"label":"lake regulars","role":"boat workers, restaurant staff, students, walkers, and families from old cottages","rhythm":"They read water and weather closely and avoid certain questions after dark."}]',array['Fog changes distances across the lake and can arrive without wind.','Low water exposes older stonework along selected parts of the shore.'],array['Something seen across the water has no agreed explanation.','A confession at the shore changes what a familiar place means.']),
  ('vespormoor','vespormoor-university',array['scholarly','gothic','institutionally secretive'],array['paper, stone dust, and old heating pipes','footsteps beneath high vaults','bells carrying between courtyards and towers'],array['Vespormoor University expanded through the Vesper estate and became both a respected institution and a custodian of records the town does not discuss publicly.'],'[{"label":"university regulars","role":"students, faculty, archivists, medical staff, and estate workers","rhythm":"Academic access and family access overlap without ever becoming identical."}]',array['Rain drives movement into cloisters, tunnels, and covered bridges.','Snow can isolate upper towers while lower halls remain active.'],array['A restricted citation points to a room missing from modern plans.','A formal event puts rivals at the same table.']),
  ('vespormoor','thornwood',array['isolated','ancient','indifferent to town boundaries'],array['wet bark, moss, and cold stone','water moving beyond the visible trail','sudden quiet where wildlife should be'],array['Thornwood predates the town''s recorded settlement and contains routes, ruins, and ritual sites incorporated into later Covenant protections.'],'[{"label":"forest regulars","role":"rangers, hikers, hunters, retreat staff, and Veiled residents traveling quietly","rhythm":"They share practical warnings while disagreeing about their causes."}]',array['Fog and storms can alter navigation faster than distance suggests.','Snow preserves tracks but closes the exposed routes.'],array['A marked trail returns somewhere different.','A practical rescue uncovers an older boundary.']),
  ('vespormoor','raven-ward',array['young','dangerous by reputation','socially porous after midnight'],array['bass in converted brick halls','rain, hot metal, and diner coffee','red light across warehouse glass'],array['Raven Ward formed as workshops and performance spaces occupied the district rebuilt least formally after industrial decline.'],'[{"label":"after-midnight regulars","role":"performers, tattooists, market sellers, students, drivers, and supernatural clients","rhythm":"Social circles cross here that remain carefully separate by daylight."}]',array['Rain strengthens the district''s indoor crowds and market cover.','Cold nights push every social circle toward the diner by closing time.'],array['A night-market purchase creates a debt.','Two social circles collide in a place built for anonymity.']);

with recursive location_context as(
  select location.*,world.slug as world_slug,
    case when location.location_type='district' then location.slug
         when parent.location_type='district' then parent.slug
         when district.id is not null then district.slug
         else 'citywide' end as district_slug,
    case when location.location_type='district' then location.name
         when parent.location_type='district' then parent.name
         when district.id is not null then district.name
         else world.name end as district_name
  from public.together_locations location
  join public.together_worlds world on world.id=location.world_id
  left join public.together_locations parent on parent.id=location.parent_location_id
  left join public.together_locations district on district.world_id=location.world_id
    and district.location_type='district'
    and district.name=location.metadata->>'district'
  where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor')
), profiled as(
  select context.*,profile.atmosphere as district_atmosphere,profile.sensory as district_sensory,
    profile.public_history,profile.recurring_people,profile.weather,profile.story_seeds,
    case
      when lower(context.category)~'cafe|bakery|diner|restaurant|food|tavern|pub' then 'hospitality'
      when lower(context.category)~'bar|lounge|night|club|music|cabaret|karaoke' then 'nightlife'
      when lower(context.category)~'market|shopping|book|gallery|studio|apothecary|pharmacy|tattoo' then 'shop'
      when context.location_type in('outdoor','landmark') or lower(context.category)~'park|garden|beach|pier|dock|waterfall|overlook|trail|plaza|shrine|chapel|ruin' then 'outdoor'
      when context.location_type='residence' or lower(context.category)~'hotel|estate|dorm|cabins|home' then 'residence'
      when lower(context.category)~'transit|marina|station' then 'transit'
      else 'venue' end as place_family
  from location_context context
  join kivelle_location_district_depth profile using(world_slug,district_slug)
), authored as(
  select profiled.*,
    case place_family
      when 'hospitality' then array['food and drink service close to the main room','a mix of quick tables and places meant for lingering','a threshold where arriving guests can read the room']
      when 'nightlife' then array['an arrival point shaped by music, security, or a host','a social main room with distinct quieter edges','service and backstage spaces outside ordinary guest flow']
      when 'shop' then array['a public-facing display or service area','a working counter where regulars are recognized','quieter edges for browsing, consultation, or close attention']
      when 'outdoor' then array['a clear arrival or trail approach','a central view or gathering area','quieter edges where weather and distance change the mood']
      when 'residence' then array['a controlled arrival threshold','shared or guest-facing rooms','private areas that require invitation or explicit scene access']
      when 'transit' then array['an arrival and departure edge','a practical service or waiting area','routes that change with traffic and weather']
      else array['a recognizable public entrance','a primary activity area','smaller edges suited to conversation or observation'] end as generated_layout,
    case place_family
      when 'hospitality' then array['Let staff finish service before turning an order into a long conversation.','Busy tables should not be treated as private.']
      when 'nightlife' then array['Respect door, recording, age, and membership rules.','Privacy depends on the specific room, not the venue''s reputation.']
      when 'shop' then array['Ask before handling restricted, fragile, fitted, or working materials.','Keep service areas clear during busy periods.']
      when 'outdoor' then array['Weather and closing conditions override an assumed plan.','Shared paths and overlooks remain public unless a scene establishes otherwise.']
      when 'residence' then array['Entry requires an invitation or canonical shared scene.','Never imply the user is inside from remote conversation alone.']
      when 'transit' then array['Do not obstruct working arrivals or departures.','Schedules and weather take precedence over an invented departure.']
      else array['Follow posted access rules and the current activity''s pace.','Do not invent private access from familiarity alone.'] end as generated_etiquette,
    case place_family
      when 'hospitality' then jsonb_build_object('label','service regulars','role','staff, repeat customers, and nearby workers','rhythm','Rush periods and lingering periods produce different kinds of conversation.')
      when 'nightlife' then jsonb_build_object('label','night regulars','role','staff, performers, promoters, and repeat guests','rhythm','They recognize social patterns even when they protect names.')
      when 'shop' then jsonb_build_object('label','working regulars','role','staff, specialists, clients, and habitual browsers','rhythm','Competence and repeat visits matter more than spectacle.')
      when 'outdoor' then jsonb_build_object('label','route regulars','role','walkers, workers, photographers, and nearby residents','rhythm','Weather and daypart change who treats the place as theirs.')
      when 'residence' then jsonb_build_object('label','known visitors','role','residents, staff, neighbors, and invited guests','rhythm','Unfamiliar arrivals are noticed quickly.')
      else jsonb_build_object('label','place regulars','role','workers, neighbors, and repeat visitors','rhythm','Their routines give the place continuity across different scenes.') end as generated_people,
    case place_family
      when 'hospitality' then 75 when 'nightlife' then 120 when 'shop' then 55 when 'outdoor' then 90 when 'residence' then 150 when 'transit' then 45 else 75 end as duration_minutes,
    case place_family when 'nightlife' then 'high' when 'outdoor' then 'medium' when 'residence' then 'low' else 'medium' end as default_social_energy,
    case place_family when 'residence' then 'high' when 'nightlife' then 'low' when 'outdoor' then 'medium' when 'shop' then 'medium' else 'medium' end as default_privacy
  from profiled
), final_lore as(
  select authored.*,
    coalesce((select jsonb_object_agg(activity,
      case authored.place_family
        when 'nightlife' then initcap(activity)||' is most natural after the room has settled into its evening rhythm.'
        when 'hospitality' then initcap(activity)||' changes with service pace; allow more time outside the busiest rush.'
        when 'outdoor' then initcap(activity)||' depends on weather, light, and how crowded the route is.'
        when 'residence' then initcap(activity)||' requires invitation and established co-presence.'
        else initcap(activity)||' works best when it fits the place''s current crowd and operating rhythm.' end)
      from unnest(authored.possible_activities) activity),'{}'::jsonb) as generated_activity_notes,
    coalesce((select jsonb_agg(sibling.slug order by sibling.sort_order,sibling.name) from(
      select candidate.slug,candidate.sort_order,candidate.name
      from public.together_locations candidate
      where candidate.world_id=authored.world_id and candidate.id<>authored.id
        and candidate.metadata->>'private' is distinct from 'true'
        and(
          (authored.location_type='district' and candidate.parent_location_id=authored.id)
          or(authored.location_type<>'district' and candidate.parent_location_id is not distinct from authored.parent_location_id and candidate.location_type<>'district')
        )
      order by candidate.sort_order,candidate.name limit 6
    )sibling),'[]'::jsonb) as generated_nearby
  from authored
)
update public.together_locations location
set canonical_lore=(coalesce(location.canonical_lore,'{}'::jsonb)||jsonb_build_object(
    'version',2,
    'authored',true,
    'summary',coalesce(nullif(location.canonical_lore->>'summary',''),final_lore.description),
    'atmosphere',pg_temp.kivelle_json_array_or(location.canonical_lore->'atmosphere',to_jsonb(final_lore.district_atmosphere||case final_lore.place_family when 'nightlife' then array['energized after dark'] when 'outdoor' then array['shaped by weather and light'] when 'residence' then array['access-controlled and personal'] else array['grounded in repeat routines'] end)),
    'sensoryDetails',pg_temp.kivelle_json_array_or(location.canonical_lore->'sensoryDetails',to_jsonb(final_lore.district_sensory||array[final_lore.name||' carries the specific textures of '||lower(final_lore.description)])),
    'signatureDetails',pg_temp.kivelle_json_array_or(location.canonical_lore->'signatureDetails',to_jsonb(array[
      final_lore.name||' is most closely associated with '||coalesce(final_lore.possible_activities[1],lower(final_lore.category))||'.',
      case when array_length(final_lore.possible_activities,1)>1 then initcap(final_lore.possible_activities[2])||' changes how the place feels outside its main rush.' else final_lore.description end,
      'Its identity remains tied to '||final_lore.district_name||' rather than feeling interchangeable with the rest of '||case final_lore.world_slug when 'juniper-city' then 'Juniper City' when 'port-vervelle' then 'Port Vervelle' when 'neon-kyo' then 'Neon Kyo' else 'Vespormoor' end||'.'
    ])),
    'layout',pg_temp.kivelle_json_array_or(location.canonical_lore->'layout',to_jsonb(final_lore.generated_layout)),
    'crowdRhythm',pg_temp.kivelle_json_object_or(location.canonical_lore->'crowdRhythm',jsonb_build_object(
      'morning',case final_lore.place_family when 'nightlife' then final_lore.name||' is mostly quiet, cleaning, or resetting.' when 'hospitality' then 'Workers and early regulars establish the day before casual visitors arrive.' when 'outdoor' then 'The light is cooler and the route belongs to workers and habitual early visitors.' else 'Staff, residents, and routine visitors set the place''s practical rhythm.' end,
      'afternoon',case final_lore.place_family when 'nightlife' then 'Preparation begins while the public room remains restrained.' when 'hospitality' then 'Service steadies into a mix of quick visits and longer conversations.' when 'outdoor' then 'Visibility and foot traffic are highest, with quieter edges still available.' else 'The place operates at its clearest working rhythm.' end,
      'evening',case final_lore.place_family when 'nightlife' then 'Arrivals, music, and social attention make the room more performative.' when 'hospitality' then 'Tables and conversations slow as the visit becomes more deliberate.' when 'outdoor' then 'Changing light makes people linger and shifts attention toward views and conversation.' else 'Workday traffic gives way to appointments, social visits, and people with more time.' end,
      'late_night',case final_lore.place_family when 'nightlife' then 'Regulars, staff, and the least hurried guests define the room.' when 'residence' then 'The setting is private, quieter, and only available through established access.' when 'outdoor' then 'The place is sparse; safety, access, and weather matter more.' else 'Only late operations, residents, or explicitly established scenes remain.' end,
      'overnight',case final_lore.place_family when 'nightlife' then 'Closing routines and the final regulars replace the main crowd.' when 'residence' then 'This is private residential time.' else 'The place is closed, empty, or limited to essential workers unless authored hours say otherwise.' end
    )),
    'conversationHooks',pg_temp.kivelle_json_array_or(location.canonical_lore->'conversationHooks',to_jsonb(array[
      'How '||coalesce(final_lore.possible_activities[1],lower(final_lore.category))||' changes between the quiet and busy parts of the day.',
      'What regulars notice first about '||final_lore.name||'.',
      'Whether '||coalesce(final_lore.possible_activities[2],final_lore.possible_activities[1],lower(final_lore.category))||' is better planned or left spontaneous.'
    ])),
    'stableFacts',pg_temp.kivelle_json_array_or(location.canonical_lore->'stableFacts',to_jsonb(array_remove(array[
      final_lore.name||' is in '||final_lore.district_name||'.',
      final_lore.description,
      case when final_lore.hours is not null then 'Operating hours are '||final_lore.hours::text||' and should not be invented differently.' end
    ],null))),
    'localEtiquette',pg_temp.kivelle_json_array_or(location.canonical_lore->'localEtiquette',to_jsonb(final_lore.generated_etiquette)),
    'nearbyLocationSlugs',pg_temp.kivelle_json_array_or(location.canonical_lore->'nearbyLocationSlugs',final_lore.generated_nearby),
    'publicHistory',pg_temp.kivelle_json_array_or(location.canonical_lore->'publicHistory',to_jsonb(final_lore.public_history)),
    'recurringPeople',pg_temp.kivelle_json_array_or(location.canonical_lore->'recurringPeople',final_lore.recurring_people||jsonb_build_array(final_lore.generated_people)),
    'activityNotes',pg_temp.kivelle_json_object_or(location.canonical_lore->'activityNotes',final_lore.generated_activity_notes),
    'accessNotes',pg_temp.kivelle_json_array_or(location.canonical_lore->'accessNotes',to_jsonb(array_remove(array[
      case when final_lore.hours is not null then 'Check the authored operating hours before planning a visit.' else 'Access follows current weather, event, or scene conditions.' end,
      case final_lore.place_family when 'residence' then 'Private access requires an invitation or canonical shared scene.' when 'nightlife' then 'Age, membership, recording, and door rules remain in force when present.' when 'outdoor' then 'Weather and local closing conditions may limit access.' else 'Do not assume access to staff-only or private areas.' end
    ],null))),
    'weatherNotes',pg_temp.kivelle_json_array_or(location.canonical_lore->'weatherNotes',to_jsonb(final_lore.weather)),
    'storySeeds',pg_temp.kivelle_json_array_or(location.canonical_lore->'storySeeds',to_jsonb(final_lore.story_seeds||array['A routine '||coalesce(final_lore.possible_activities[1],lower(final_lore.category))||' visit at '||final_lore.name||' reveals a character-specific decision.']))
  )),
  canonical_visual_context=(coalesce(location.canonical_visual_context,'{}'::jsonb)||jsonb_build_object(
    'viewpoints',pg_temp.kivelle_json_array_or(location.canonical_visual_context->'viewpoints',to_jsonb(case final_lore.place_family when 'outdoor' then array['arrival approach with the place identifiable','human-height view from the primary gathering area','quieter edge showing geography and weather'] when 'residence' then array['invited guest perspective from the shared room','human-height interior view anchored by recurring objects','window or threshold view connecting the home to its district'] else array['arrival view with signage or architectural identity','human-height view from the primary activity area','quieter secondary angle showing layout and recurring objects'] end)),
    'daypartLighting',pg_temp.kivelle_json_object_or(location.canonical_visual_context->'daypartLighting',jsonb_build_object('morning','cooler natural light with practical opening activity','afternoon','clear environmental light that shows materials and layout','evening','warmer practical light balanced against the world outside','late_night','reduced practical light with believable occupied areas, never an empty showroom')),
    'weatherVariants',pg_temp.kivelle_json_object_or(location.canonical_visual_context->'weatherVariants',case final_lore.world_slug when 'port-vervelle' then '{"clear":"warm coastal sun and crisp sea color","wind":"moving awnings, clothing, plants, and textured water","rain":"darkened stone, sheltered tables, and softer harbor visibility"}'::jsonb when 'neon-kyo' then '{"clear":"dense city depth with restrained signage","rain":"wet reflections, umbrellas, drainage, and crowded cover","storm":"reduced skyline visibility and more pronounced interior refuge"}'::jsonb when 'vespormoor' then '{"fog":"shortened sightlines and warm light diffused through mist","rain":"wet stone, dark wood, and active shelter","snow":"muted exterior color, visible tracks, and practical winter access"}'::jsonb else '{"clear":"natural city contrast and active public space","rain":"wet pavement, sheltered thresholds, and warmer interiors","overcast":"soft even light that preserves architectural identity"}'::jsonb end)
  )),
  metadata=(coalesce(location.metadata,'{}'::jsonb)||jsonb_build_object(
    'loreVersion',2,'loreAuthored',true,
    'social_energy',coalesce(location.metadata->>'social_energy',final_lore.default_social_energy),
    'privacy',coalesce(location.metadata->>'privacy',final_lore.default_privacy),
    'typical_duration_minutes',coalesce((location.metadata->>'typical_duration_minutes')::integer,final_lore.duration_minutes),
    'weather_sensitive',final_lore.place_family in('outdoor','transit'),
    'directoryDetailMode','lazy'
  )),
  updated_at=now()
from final_lore
where location.id=final_lore.id;

with layers(world_slug,location_slug,layer_key,disclosure_scope,min_relationship_stage,required_character_slugs,required_story_keys,lore) as(values
  ('neon-kyo','hikari-crossing','rating-observation-network','story',null,array[]::text[],array['the-rating-changed'],jsonb_build_object('facts',jsonb_build_array('A maintenance mesh beneath the public advertising system retains short-lived pedestrian association patterns after ordinary Civic records expire.'),'storyHooks',jsonb_build_array('Someone with access used the crossing to reconstruct a meeting that appeared anonymous.'))),
  ('neon-kyo','ghost-line','forged-access-ledger','relationship','dating',array[]::text[],array[]::text[],jsonb_build_object('facts',jsonb_build_array('Several Ghost Line sellers share a private ledger of forged identities that failed for reasons the city never published.'),'storyHooks',jsonb_build_array('A familiar alias appears in the failed ledger.'))),
  ('neon-kyo','room-thirteen','recording-blackout-cost','character',null,array['mei-tanaka','yuna-park','ren-ito']::text[],array[]::text[],jsonb_build_object('facts',jsonb_build_array('Room 13''s recording blackout is maintained through favors owed across security, hospitality, and municipal inspection systems.'))),
  ('neon-kyo','old-kyo-the-shade','blind-zone-map','story',null,array[]::text[],array['someone-is-watching','disappear-into-the-shade'],jsonb_build_object('facts',jsonb_build_array('The Shade''s camera failures form a changing pattern maintained by people, not simply old infrastructure.'),'storyHooks',jsonb_build_array('A route through the blind zones has recently changed.'))),
  ('vespormoor','vesper-house','occupied-again','story',null,array[]::text[],array['an-old-family-returns','the-lights-beneath-the-water'],jsonb_build_object('facts',jsonb_build_array('The recent lights in Vesper House follow the domestic rhythm of an occupied home rather than random trespass.'),'storyHooks',jsonb_build_array('Someone is keeping old hours inside the supposedly empty estate.'))),
  ('vespormoor','the-sunken-chapel','lake-warning-origin','story',null,array[]::text[],array['the-lights-beneath-the-water'],jsonb_build_object('facts',jsonb_build_array('The oldest surviving version of the lake warning was carved into the Sunken Chapel before the structure went below the waterline.'))),
  ('vespormoor','the-undercroft','sealed-vesper-route','relationship','exclusive',array[]::text[],array[]::text[],jsonb_build_object('facts',jsonb_build_array('A sealed Undercroft route aligns with the private road to Vesper House on pre-Burning Winter plans.'))),
  ('vespormoor','the-standing-stones','covenant-boundary','story',null,array[]::text[],array['covenant-boundary'],jsonb_build_object('facts',jsonb_build_array('The Standing Stones mark one of the Covenant''s original protective boundaries, though several alignments no longer hold.'))),
  ('vespormoor','the-red-market','covenant-debts','relationship','dating',array[]::text[],array[]::text[],jsonb_build_object('facts',jsonb_build_array('Some Red Market transactions are settled through Covenant favors rather than money, and those debts can pass through families.')))
)
insert into public.together_location_lore_layers(location_id,layer_key,disclosure_scope,min_relationship_stage,required_character_slugs,required_story_keys,lore,metadata)
select location.id,layers.layer_key,layers.disclosure_scope,layers.min_relationship_stage,layers.required_character_slugs,layers.required_story_keys,layers.lore,jsonb_build_object('source','location_depth_v2','world',layers.world_slug)
from layers
join public.together_worlds world on world.slug=layers.world_slug
join public.together_locations location on location.world_id=world.id and location.slug=layers.location_slug
on conflict(location_id,layer_key) do update set disclosure_scope=excluded.disclosure_scope,min_relationship_stage=excluded.min_relationship_stage,required_character_slugs=excluded.required_character_slugs,required_story_keys=excluded.required_story_keys,lore=excluded.lore,metadata=excluded.metadata,active=true,updated_at=now();

with current_companions as(
  select template.id as template_id,template.slug as character_slug,template.name as character_name,template.occupation,template.first_meeting,
    version.id as character_version_id,version.interests,presence.world_id,world.slug as world_slug
  from public.together_character_templates template
  join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
  join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident'
  join public.together_worlds world on world.id=presence.world_id and world.slug in('juniper-city','port-vervelle','neon-kyo')
  where template.published and template.can_be_selected and template.lifecycle_status<>'archived'
), candidate_rows as(
  select companion.character_version_id,location.id as location_id,120+count(*)::integer as score,'schedule'::text as reason
  from current_companions companion
  join public.together_schedule_templates schedule on schedule.character_version_id=companion.character_version_id
  join public.together_locations location on location.id=schedule.location_id and location.world_id=companion.world_id
  group by companion.character_version_id,location.id
  union all
  select companion.character_version_id,location.id,110,'first_meeting'
  from current_companions companion join public.together_locations location on location.id=(companion.first_meeting->>'location_id')::uuid and location.world_id=companion.world_id
  union all
  select companion.character_version_id,location.id,70,'interest_match'
  from current_companions companion
  join public.together_locations location on location.world_id=companion.world_id and location.location_type<>'district' and location.metadata->>'private' is distinct from 'true'
  where exists(select 1 from unnest(companion.interests) interest where concat_ws(' ',location.name,location.category,location.description,array_to_string(location.possible_activities,' ')) ilike '%'||interest||'%')
  union all
  select companion.character_version_id,location.id,10+(abs(hashtext(companion.character_slug||':'||location.slug))%10),'world_fallback'
  from current_companions companion
  join public.together_locations location on location.world_id=companion.world_id and location.location_type<>'district' and location.category not in('home','work') and location.metadata->>'private' is distinct from 'true'
), candidates as(
  select character_version_id,location_id,max(score) as score,(array_agg(reason order by score desc))[1] as reason
  from candidate_rows group by character_version_id,location_id
), ranked as(
  select candidates.*,row_number() over(partition by candidates.character_version_id order by candidates.score desc,candidates.location_id) as rank
  from candidates
), seeds as(
  select companion.*,ranked.reason,ranked.score,location.*,
    coalesce(location.canonical_lore#>>'{atmosphere,0}','familiar') as atmosphere_word,
    coalesce(location.canonical_lore#>>'{signatureDetails,0}',location.description) as favorite_detail
  from ranked
  join current_companions companion using(character_version_id)
  join public.together_locations location on location.id=ranked.location_id
  where ranked.rank<=5
)
insert into public.together_character_place_profiles(character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,opinion_tags,preferred_activities,favorite_details,disliked_details,metadata)
select character_version_id,id,
  case reason when 'schedule' then .9 when 'first_meeting' then .82 when 'interest_match' then .64 else .42 end,
  case reason when 'schedule' then .58 when 'first_meeting' then .62 when 'interest_match' then .66 else .44 end,
  case reason when 'schedule' then .88 when 'first_meeting' then .82 when 'interest_match' then .72 else .58 end,
  character_name||' experiences '||name||' as '||atmosphere_word||'; '||coalesce(possible_activities[1],lower(category))||' is the part of the place that most naturally fits '||case when reason='schedule' then 'their established routine.' when reason='first_meeting' then 'the way they first connect with someone here.' when reason='interest_match' then 'their interests and independent life.' else 'the side of '||world_slug||' they are most likely to notice.' end,
  array_remove(array[category,atmosphere_word,reason],null),
  possible_activities[1:2],array[favorite_detail],array[]::text[],
  jsonb_build_object('source','location_depth_v2_foundation','reason',reason,'version',2)
from seeds
on conflict(character_version_id,location_id) do update set
  familiarity=excluded.familiarity,sentiment=excluded.sentiment,confidence=excluded.confidence,
  opinion_summary=excluded.opinion_summary,opinion_tags=excluded.opinion_tags,
  preferred_activities=excluded.preferred_activities,favorite_details=excluded.favorite_details,
  disliked_details=excluded.disliked_details,metadata=excluded.metadata,updated_at=now()
where public.together_character_place_profiles.metadata->>'source'='location_depth_v2_foundation';

do $$
declare missing_count integer;
begin
  select count(*) into missing_count
  from public.together_locations location
  join public.together_worlds world on world.id=location.world_id
  where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor')
    and(
      location.canonical_lore->>'version'<>'2'
      or location.canonical_lore->>'authored'<>'true'
      or jsonb_array_length(coalesce(location.canonical_lore->'sensoryDetails','[]'::jsonb))<3
      or jsonb_array_length(coalesce(location.canonical_lore->'signatureDetails','[]'::jsonb))<3
      or jsonb_array_length(coalesce(location.canonical_lore->'layout','[]'::jsonb))<3
      or coalesce(location.canonical_lore->'crowdRhythm','{}'::jsonb)='{}'::jsonb
      or coalesce(location.canonical_lore->'activityNotes','{}'::jsonb)='{}'::jsonb
    );
  if missing_count>0 then raise exception 'Location depth v2 left % current locations incomplete',missing_count;end if;
  if exists(
    select 1 from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id and version.version=template.current_published_version
    join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.presence_type='resident'
    join public.together_worlds world on world.id=presence.world_id and world.slug in('juniper-city','port-vervelle','neon-kyo')
    left join public.together_character_place_profiles profile on profile.character_version_id=version.id
    where template.published and template.can_be_selected and template.lifecycle_status<>'archived'
    group by version.id having count(profile.id)<5
  ) then raise exception 'Location depth v2 did not provide five place anchors for every current companion';end if;
end $$;

comment on column public.together_locations.canonical_lore is
  'Versioned stable public location bible. Dynamic occupancy and gated story knowledge must not be stored here.';

commit;
