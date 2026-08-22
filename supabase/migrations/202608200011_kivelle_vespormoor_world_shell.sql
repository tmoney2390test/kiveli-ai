begin;

-- Vespormoor is deliberately staged but unpublished. The canonical world,
-- lore, visual language, and default art key are ready; authored locations,
-- residents, calendars, and their reference media will arrive in later packs.
insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,
  access_type,entitlement_key,timezone,sort_order,featured,visual_context,
  world_role,social_rhythm,dominant_dayparts,relationship_themes,
  activity_families,mobility_style,weather_profile
) values (
  '10000000-0000-4000-8000-000000000010',
  'Vespormoor',
  'vespormoor',
  'A mist-bound mountain town where humans and the Veiled have lived under an ancient covenant for three centuries—and something beneath Lake Vesper is beginning to wake.',
  'vespormoor-hero',
  '{"accent":["midnight blue","wet slate","aged brass","candle amber"]}'::jsonb,
  '{"releaseWave":9,"early_access":true,"releaseStatus":"preproduction","contentStatus":"world_shell_ready","locationCatalogStatus":"pending","residentRosterStatus":"pending","photoStatus":"hero_ready","locationPhotoStatus":"default_only","mappedLocationPhotoCount":0,"residentCompanionCount":0,"tagline":"Every family keeps a secret. The lake keeps all of them.","relationshipFantasy":"Fall for someone whose secrets may be older—and more dangerous—than the town itself.","originYear":1712,"approximatePopulation":20000,"foundingFigures":["Lucien Vesper","Isolde Vesper"],"governingPact":"The Vesper Covenant","supernaturalResidents":["vampires","witches","immortals","shapeshifters","other Veiled beings"],"covenantRules":["Keep the Veiled secret from the outside world.","Never prey upon an unwilling townsperson.","Do not bring ancient supernatural conflicts into the valley."],"historicCrises":["The Burning Winter of 1846"],"centralWarning":"Nothing beneath the water shall be awakened.","nativeDateSeeds":["Candlelight at Closing Time","Fog on the Lake Path","The Restricted Stacks","A Storm at Vesper House"],"storySeeds":["The Lights Beneath the Water","An Old Family Returns","The Road Changed After Midnight","A Clause in the Covenant"],"populationArchetypes":["university scholar","old-book dealer","physician","innkeeper","estate caretaker","local historian","Veiled liaison","covenant family heir"],"canonicalLore":{"origin":"Vespormoor began as a hidden settlement in a mountain valley around black Lake Vesper, long feared for voices in the woods, missing time, and lights beneath the water.","founding":"In 1712 Lucien Vesper and his sister Isolde built Vesper House and created a sanctuary for the Veiled.","covenant":"The Vesper Covenant binds the oldest families to secrecy, mutual protection, and strict limits on supernatural behavior.","burningWinter":"A faction attempted to seize the town during the Burning Winter of 1846. Lucien disappeared soon afterward; Isolde vanished half a century later.","lakeWarning":"Nothing beneath the water shall be awakened.","modernDay":"Vespormoor now appears to outsiders as an exceptionally preserved mountain town of roughly twenty thousand people, while locals quietly live alongside the Veiled.","presentThreat":"The protections are weakening: lights move beneath the lake, animals avoid the shore, old families are returning, and Vesper House glows at night."}}'::jsonb,
  false,
  'subscription',
  'worlds.standard',
  'America/New_York',
  90,
  true,
  '{"setting":"secluded Gothic mountain town surrounding black Lake Vesper, hidden by dense forest, steep peaks, and persistent supernatural mist","geography":["deep mountain valley","black still lake","dense old-growth forest","steep mist-covered peaks","isolated estates and wooded trails"],"architecture":["Victorian Gothic townhouses","rain-dark stone civic buildings","candlelit shopfronts","ancient university halls","secluded manor estates","Vesper House above the lake"],"climate":"cool wet mountain climate with frequent fog, rain, and long winters","visualStyle":["grounded Gothic romantic realism","blue-gray mist against warm candlelight","wet cobblestone reflections","quiet supernatural tension"],"palette":["midnight blue","charcoal","wet slate","forest black-green","aged brass","candle amber"],"recurringElements":["gas-style streetlamps","low lake fog","wrought iron","dark water","old family crests","warm windows in the rain"],"signageStyle":["carved serif lettering","aged brass plaques","hand-painted shop signs","unobtrusive university wayfinding"],"avoid":["overt high-fantasy spectacle","visible monsters in ordinary public scenes","graphic horror or gore","modern glass skyline","cyberpunk neon","theme-park Gothic"]}'::jsonb,
  'home',
  'quiet',
  array['evening','late_night','morning']::text[],
  array['secrecy','trust','forbidden intimacy','mortality and immortality','family legacy','mutual protection','awakening danger']::text[],
  array['old bookstores','university life','candlelit dining','lakeshore walks','wooded trails','estate visits','town traditions','supernatural mysteries']::text[],
  'walkable',
  '{"climate":"cool wet mountain valley","states":["fog","rain","overcast","snow","clear_cold"],"outdoorBias":0.44}'::jsonb
)
on conflict(id) do update set
  name=excluded.name,slug=excluded.slug,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,
  access_type=excluded.access_type,entitlement_key=excluded.entitlement_key,
  timezone=excluded.timezone,sort_order=excluded.sort_order,featured=excluded.featured,
  visual_context=excluded.visual_context,world_role=excluded.world_role,
  social_rhythm=excluded.social_rhythm,dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,weather_profile=excluded.weather_profile,
  updated_at=now();

commit;
