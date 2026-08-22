begin;

with lodging as(
  select * from(values
    (45,1,'Porto Vecchio','Locanda Vela','locanda-vela','A weathered sixteen-room harbor inn on the narrow street behind Porto Marina, intimate, genuinely local, and often the first place newcomers sleep in Port Vervelle.',135,array['stay','breakfast','terrace','harbor arrival','secret meeting']::text[],'historic harbor inn',16,'weathered, intimate, genuinely local',array['arrivals','short stays','sailors','visiting artists','secret meetings']::text[],array['weathered and intimate','unpolished but deeply welcoming','alive with harbor arrivals and temporary goodbyes']::text[],array['old timber warmed by the afternoon sun','coffee and toasted bread from the tiny breakfast room','salt air climbing the lane behind Porto Marina','soft terrace conversation above the harbor roofs']::text[],array['sloped floors that make every room feel slightly individual','mismatched doors retained through generations of repairs','a tiny breakfast room where strangers become familiar','a modest terrace overlooking the harbor roofs']::text[],array['a narrow entrance just behind Porto Marina','sixteen guest rooms arranged across uneven old floors','a tiny breakfast room beside the family service area','an upper terrace facing the harbor roofs']::text[],array['Emilia Varo founded the building as a late-nineteenth-century boarding house above her family chandlery.','The boarding house gradually became a local inn without losing its uneven floors, mismatched doors, or family scale.','It remains Port Vervelle''s landing point for people between chapters.']::text[],array['A guest who planned to stay one night keeps finding reasons not to leave.','An old name in the register connects two people who thought they were strangers.','A secret meeting on the terrace is overheard only in fragments.']::text[],array['porto-marina','cafe-marelle','blue-lantern','harbor-steps']::text[]),
    (46,2,'Piazza Aurelia','Palazzo Sereno','palazzo-sereno','A discreet twenty-four-room historic boutique hotel on a quiet lane off Piazza Aurelia, with old-world rooms for important visits, celebrations, and romances kept out of sight.',195,array['stay','breakfast','wedding','anniversary','courtyard']::text[],'historic boutique hotel',24,'romantic, old-world, discreet',array['weddings','anniversaries','visiting families','affluent travelers','clandestine romances']::text[],array['romantic and old-world','quietly affluent','defined by practiced discretion']::text[],array['lemon leaves and pale stone in the courtyard','muted footsteps along restored corridors','breakfast china in the former ballroom','evening piano drifting from the music salon']::text[],array['a former ballroom now used for breakfast','a music salon converted into an intimate lounge','one old lemon tree holding the center of the courtyard','staff who notice everything and repeat almost nothing']::text[],array['a discreet entrance on a quiet lane off Piazza Aurelia','twenty-four guest rooms inside the restored Sereno residence','a former ballroom opening for breakfast','a music salon lounge and enclosed lemon courtyard']::text[],array['The Sereno shipping family built the palazzo as its town residence.','Its restoration preserved the ballroom, music salon, and courtyard while turning the private residence into a boutique hotel.','Weddings, reunions, and consequential visits have made it part of Port Vervelle''s private civic history.']::text[],array['Two guests discover their reservations were arranged by the same person.','A wedding weekend revives an old Sereno family disagreement.','Someone checks in under a familiar but incomplete name.']::text[],array['piazza-aurelia','osteria-rosa','libreria-vervelle','palazzo-civico','atelier-amelie']::text[]),
    (47,3,'Marina Solana','Hôtel Coralline','hotel-coralline','A stylish fifty-two-room beachfront hotel at the quieter end of the Marina Solana promenade, mixing sun-faded glamour, poolside energy, and a little summer chaos.',265,array['stay','pool','rooftop bar','beach','nightlife']::text[],'beachfront hotel',52,'social, sun-faded glamour, slightly chaotic',array['summer visitors','nightlife','pool scenes','flings','visiting performers']::text[],array['social and sun-faded glamorous','slightly chaotic in high summer','restless from poolside afternoon into rooftop night']::text[],array['sunlight flashing across terrazzo floors','chlorine, citrus, and sea air around the pool','music carrying down from the rooftop bar','balcony doors clicking open toward the promenade']::text[],array['mid-century terrazzo floors','curved balconies facing the coast','a lively pool open to day-pass guests','a rooftop bar favored by performers and summer crowds']::text[],array['a promenade entrance at Marina Solana''s quieter end','fifty-two rooms stacked behind curved balconies','a central pool deck that functions as the hotel''s social heart','a rooftop bar above the beachfront rooms']::text[],array['Hôtel Coralline opened during the town''s mid-century tourism boom.','Its terrazzo, curved balconies, pool, and rooftop bar became part of Marina Solana''s summer identity.','Visiting performers traditionally lodge here, pulling afterparties and morning-after stories into the hotel.','The local saying is: What happens at Coralline makes it back to the Piazza eventually.']::text[],array['A rooftop afterparty leaves two different versions of the same story.','A visiting performer asks a local for one unpublicized night in town.','A pool day pass places someone exactly where they claimed they would not be.']::text[],array['marina-solana','spiaggia-solana','lido-vervelle','luna-terrace','velours','la-sirena']::text[]),
    (48,4,'Bellavista','Casa Livia','casa-livia','A quiet nine-room hillside guesthouse above Belvedere Garden, domestic and beautiful enough for writers, couples, and visitors beginning to live like neighbors.',325,array['stay','breakfast','writing','terrace','long visit']::text[],'hillside guesthouse',9,'quiet, beautiful, domestic',array['longer stays','writers','photographers','couples','people temporarily living in town']::text[],array['quiet and domestic','beautiful without feeling staged','suited to slow routines and longer stays']::text[],array['breakfast baking in the shared kitchen','morning light crossing the hillside terrace','keys placed on the old kitchen table','garden air rising from Belvedere below']::text[],array['nine rooms adapted from a teacher''s former home','room keys left at the kitchen table','a baked breakfast served without ceremony','a terrace known for clear morning sunlight']::text[],array['a hillside entrance above Belvedere Garden','nine guest rooms arranged through the former family home','a shared kitchen table that acts as reception','a sunlit terrace facing down toward town']::text[],array['Schoolteacher Livia Ferretti first opened rooms in her home to people who needed a temporary place to stay.','Her nieces kept that tradition and gradually shaped the house into a small guesthouse without removing its domestic character.','Long-stay guests gradually become part of Bellavista''s neighborhood routines.']::text[],array['A guest''s one-week booking becomes a month without anyone naming the reason.','An unfinished manuscript is left on the terrace before rain.','Someone who once stayed with Livia returns looking for the room they remember.']::text[],array['bellavista','belvedere-garden','fiore-and-fig','studio-lucent']::text[]),
    (40,6,'Capo Vervelle','Hôtel Celeste','hotel-celeste','Port Vervelle''s flagship boutique cliffside hotel, with gardens, a pool, restaurant, and spa for milestone weekends, private affairs, and guests who want to disappear beautifully.',400,array['stay','pool','garden','dinner','spa','proposal']::text[],'flagship cliffside hotel',null::integer,'luxurious, secluded, quietly consequential',array['anniversaries','affairs','proposals','special dinners','wedding overflow']::text[],array['secluded and romantic','quietly luxurious','charged by the sense that every booking means something']::text[],array['warm cliffside air moving through the gardens','pool water catching the last light','linen, citrus, and polished stone in the guest halls','dinner conversation fading toward the sea']::text[],array['terraced gardens descending toward the cliffs','a pool shielded from the public road','a destination restaurant used by locals for important dinners','direct access to Celeste Spa']::text[],array['a private arrival road above Capo Vervelle','guest rooms and suites oriented toward the coast','terraced gardens linking the pool, restaurant, and overlooks','Celeste Spa nested inside the hotel grounds']::text[],array['Hôtel Celeste grew into the town''s flagship retreat by offering privacy without losing its relationship to local life.','Its restaurant, spa, and gardens made it the default setting for anniversaries, proposals, affairs, and expensive reconciliations.','Domaine Vervelle wedding parties use the hotel when the estate needs overflow lodging.','For a local, booking Celeste is a statement rather than a practical necessity.']::text[],array['A local books a suite and leaves the second guest name blank.','A proposal dinner is prepared while one partner quietly reconsiders the timing.','Domaine wedding overflow brings two people back together at the pool.']::text[],array['capo-vervelle','celeste-spa','domaine-vervelle','cala-bianca','la-pergola']::text[])
  ) as seed(location_index,parent_index,district_name,name,slug,description,sort_order,activities,lodging_type,room_count,vibe,best_for,atmosphere,sensory,signature_details,layout,public_history,story_seeds,nearby_slugs)
), prepared as(
  select lodging.*,
    ('27000000-0000-4000-8000-'||lpad(location_index::text,12,'0'))::uuid as location_id,
    ('27000000-0000-4000-8000-'||lpad(parent_index::text,12,'0'))::uuid as parent_id,
    jsonb_strip_nulls(jsonb_build_object(
      'tags',to_jsonb(activities),'district',district_name,'photoStatus','pending',
      'lodging',true,'lodgingType',lodging_type,'roomCount',room_count,'vibe',vibe,
      'bestFor',to_jsonb(best_for),'loreVersion',2,'loreAuthored',true,
      'social_energy',case slug when 'hotel-coralline' then 'high' when 'locanda-vela' then 'medium' else 'low' end,
      'privacy',case slug when 'hotel-coralline' then 'medium' else 'high' end,
      'typical_duration_minutes',240,'weather_sensitive',false,'directoryDetailMode','lazy'
    )) as lodging_metadata,
    jsonb_build_object(
      'canonicalPrompt',name||', '||district_name||', Port Vervelle. '||description||' Grounded romantic realism; lived-in Mediterranean hospitality rather than a generic luxury resort.',
      'indoorOutdoor','mixed',
      'architecture',to_jsonb(signature_details),
      'materials',jsonb_build_array('warm pale stone','sun-faded stucco','aged timber','natural linen'),
      'lighting',jsonb_build_array('soft coastal daylight','warm practical interior light','golden late-afternoon sun'),
      'recurringObjects',to_jsonb(signature_details),
      'atmosphere',to_jsonb(atmosphere),
      'visualAnchors',jsonb_build_array(name,district_name,'Port Vervelle'),
      'avoid','["recognizable real-world landmarks","mega-resort styling","cruise ships","futuristic architecture","empty showroom interiors"]'::jsonb,
      'viewpoints',jsonb_build_array('arrival view with the property identity visible','human-height view from a shared guest space','threshold view connecting the lodging to its district'),
      'daypartLighting',jsonb_build_object('morning','cool coastal daylight and practical breakfast activity','afternoon','clear natural light revealing worn materials and layout','evening','warm interior light against the coast','late_night','restrained occupied light with believable privacy'),
      'weatherVariants','{"clear":"warm coastal sun and crisp sea color","wind":"moving awnings, plants, curtains, and textured water","rain":"darkened stone and warm sheltered interiors"}'::jsonb
    ) as visual_context,
    jsonb_build_object(
      'version',2,'authored',true,'summary',description,
      'atmosphere',to_jsonb(atmosphere),
      'sensoryDetails',to_jsonb(sensory),
      'signatureDetails',to_jsonb(signature_details),
      'layout',to_jsonb(layout),
      'crowdRhythm',jsonb_build_object(
        'morning','Breakfast, departures, and practical questions create the most public guest rhythm.',
        'afternoon','Arrivals overlap with guests returning from town, while shared spaces remain unhurried.',
        'evening','Dinner, drinks, and deliberate plans make the property more romantic and socially legible.',
        'late_night','Guest spaces quiet down and privacy becomes the defining rule.',
        'overnight','Only registered guests, invited company, and overnight staff should be assumed present.'
      ),
      'conversationHooks',jsonb_build_array('Why someone chose '||name||' for this particular stay.','Whether a temporary visit is becoming something more consequential.','What regular staff notice about the current arrivals.'),
      'stableFacts',to_jsonb(array_remove(array[name||' is in '||district_name||'.',description,case when room_count is not null then name||' has '||room_count||' rooms.' end],null))||to_jsonb(public_history),
      'localEtiquette',jsonb_build_array('Guest privacy is part of the property''s social contract.','Private rooms require a registered stay, invitation, or canonical shared scene.','Staff-only and occupied areas are never implied accessible from familiarity alone.'),
      'nearbyLocationSlugs',to_jsonb(nearby_slugs),
      'publicHistory',to_jsonb(public_history),
      'recurringPeople',jsonb_build_array(
        jsonb_build_object('label',name||' staff','role','hosts, housekeepers, and service staff who maintain the property''s continuity','rhythm','They remember returning guests and recognize when a stay carries unusual significance.'),
        jsonb_build_object('label','temporary residents','role','travelers, couples, workers, and visitors living briefly inside Port Vervelle','rhythm','Their arrivals and departures bring outside stories into the district.')
      ),
      'activityNotes',(select jsonb_object_agg(activity,initcap(activity)||' follows the property''s guest access, privacy, and current service rhythm.') from unnest(activities) activity),
      'accessNotes',jsonb_build_array('The lobby and public hospitality areas follow the property''s current operations.','Guest rooms and private facilities require a booking, invitation, or canonical shared scene.'),
      'weatherNotes',jsonb_build_array('Coastal wind changes terraces, balconies, pools, and walking approaches quickly.','Rain moves social activity into the property''s shared interior rooms.','Midday heat makes shade and water central to longer stays.'),
      'storySeeds',to_jsonb(story_seeds)
    ) as lodging_lore
  from lodging
)
insert into public.together_locations as target(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,
  hours,possible_activities,metadata,location_type,sort_order,depth,
  canonical_visual_context,canonical_lore
)
select
  location_id,'10000000-0000-4000-8000-000000000008'::uuid,parent_id,name,slug,description,
  'hotel',null,'{"open":"00:00","close":"23:59"}'::jsonb,activities,lodging_metadata,
  'residence',sort_order,1,visual_context,lodging_lore
from prepared
on conflict(id) do update set
  world_id=excluded.world_id,
  parent_location_id=excluded.parent_location_id,
  name=excluded.name,
  slug=excluded.slug,
  description=excluded.description,
  category=excluded.category,
  visual_asset_key=coalesce(target.visual_asset_key,excluded.visual_asset_key),
  hours=excluded.hours,
  possible_activities=excluded.possible_activities,
  metadata=(coalesce(target.metadata,'{}'::jsonb)||excluded.metadata)||jsonb_build_object('photoStatus',coalesce(target.metadata->'photoStatus',excluded.metadata->'photoStatus')),
  location_type=excluded.location_type,
  sort_order=excluded.sort_order,
  depth=excluded.depth,
  canonical_visual_context=coalesce(target.canonical_visual_context,'{}'::jsonb)||excluded.canonical_visual_context,
  canonical_lore=coalesce(target.canonical_lore,'{}'::jsonb)||excluded.canonical_lore,
  updated_at=now();

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'lodgingCount',5,
  'lodgingSlugs',jsonb_build_array('locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste')
),updated_at=now()
where id='10000000-0000-4000-8000-000000000008'::uuid;

commit;
