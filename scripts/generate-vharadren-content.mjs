import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] ?? 'C:/Users/Tim19/Downloads/vharadren_content_pack.json');
const repoRoot = resolve(import.meta.dirname, '..');
const migrationPath = resolve(repoRoot, 'supabase/migrations/202609040009_kivelle_vharadren_world_v1.sql');
const worldModulePath = resolve(repoRoot, 'apps/together/src/worlds/vharadren.ts');
const pack = JSON.parse(await readFile(sourcePath, 'utf8'));

const expected = {
  districts: 6,
  locations: 51,
  characters: 49,
  weeklySchedules: 2058,
  socialConnections: 274,
  recurringEvents: 10,
  storyArcs: 12,
  worldFacts: 123,
  dialogueOpportunities: 147,
  interactionBeats: 135,
};

for (const [key, count] of Object.entries(expected)) {
  if (!Array.isArray(pack[key]) || pack[key].length !== count) {
    throw new Error(`Vharadren ${key} expected ${count}; received ${pack[key]?.length ?? 'missing'}.`);
  }
}
if (pack.world?.id !== '10000000-0000-4000-8000-000000000013' || pack.world?.slug !== 'vharadren') {
  throw new Error('Vharadren world identity does not match the reserved Kivelli world identity.');
}
const women = pack.characters.filter((item) => item.gender === 'woman').length;
const men = pack.characters.filter((item) => item.gender === 'man').length;
if (women !== 33 || men !== 16 || pack.characters.some((item) => Number(item.age) < 21)) {
  throw new Error(`Vharadren roster mismatch: ${women} women, ${men} men, minimum age ${Math.min(...pack.characters.map((item) => Number(item.age)))}.`);
}
const locationSlugs = new Set(pack.locations.map((item) => item.slug));
const characterSlugs = new Set(pack.characters.map((item) => item.slug));
const storySlugs = new Set(pack.storyArcs.map((item) => item.slug));
const requireSlug = (kind, slug, owner) => {
  const catalog = kind === 'location' ? locationSlugs : kind === 'character' ? characterSlugs : storySlugs;
  if (slug && !catalog.has(slug)) throw new Error(`${owner} references missing ${kind} ${slug}.`);
};
for (const character of pack.characters) {
  for (const field of ['workSlug', 'leisureSlug', 'eveningSlug', 'weekendSlug']) requireSlug('location', character[field], character.slug);
  requireSlug('location', character.firstMeeting?.locationSlug, `${character.slug}.firstMeeting`);
  if (character.characterBible?.depthVersion !== 5 || !character.privateTruth || !character.hiddenSexual || !character.intimateAnatomy) {
    throw new Error(`${character.slug} is missing required Character Depth v5 private fields.`);
  }
}
for (const row of pack.weeklySchedules) requireSlug('location', row.locationSlug, `${row.characterSlug}.schedule`);
for (const edge of pack.socialConnections) {
  requireSlug('character', edge.sourceSlug, 'social edge');
  requireSlug('character', edge.targetSlug, 'social edge');
}
for (const event of pack.recurringEvents) {
  requireSlug('location', event.locationSlug, event.slug);
  for (const slug of event.participants) requireSlug('character', slug, event.slug);
}
for (const arc of pack.storyArcs) for (const slug of arc.involved) requireSlug('character', slug, arc.slug);
for (const fact of pack.worldFacts) {
  requireSlug('location', fact.locationSlug, fact.slug);
  requireSlug('location', fact.districtSlug, fact.slug);
  requireSlug('story', fact.requiredStorySlug, fact.slug);
}
for (const opportunity of pack.dialogueOpportunities) {
  requireSlug('location', opportunity.locationSlug, opportunity.slug);
  for (const slug of opportunity.characterSlugs ?? []) requireSlug('character', slug, opportunity.slug);
}
for (const beat of pack.interactionBeats) {
  requireSlug('location', beat.locationSlug, beat.slug);
  requireSlug('location', beat.districtSlug, beat.slug);
  for (const slug of beat.requiredParticipantSlugs ?? []) requireSlug('character', slug, beat.slug);
}

const publicLocation = (location) => {
  const lore = location.canonicalLore ?? {};
  return {
    id: location.id,
    world_id: location.worldId,
    parent_location_id: location.parentLocationId ?? null,
    name: location.name,
    slug: location.slug,
    location_type: location.locationType,
    description: location.description,
    category: location.category,
    ...(location.hours ? { hours: location.hours } : {}),
    possible_activities: location.activities,
    visual_asset_key: location.visualAssetKey,
    canonical_visual_context: location.canonicalVisualContext,
    canonical_lore: {
      version: lore.version,
      authored: lore.authored,
      summary: lore.summary,
      atmosphere: lore.atmosphere,
      sensoryDetails: lore.sensoryDetails,
      signatureDetails: location.visualAnchors,
      layout: lore.layout,
      crowdRhythm: lore.crowdRhythm,
      conversationHooks: (location.activities ?? []).slice(0, 3).map((activity) => `How ${activity} changes between quiet and crowded hours.`),
      stableFacts: lore.stableFacts,
      localEtiquette: lore.localEtiquette,
      nearbyLocationSlugs: lore.nearbyLocationSlugs,
      publicHistory: lore.publicHistory,
      recurringPeople: lore.recurringPeople,
      activityNotes: lore.activityNotes,
      accessNotes: lore.accessNotes,
      weatherNotes: lore.weatherNotes,
      storySeeds: [],
    },
    sort_order: Number(location.index) * 10,
    metadata: {
      source: 'vharadren_content_pack_v1',
      district: location.districtSlug,
      assetStatus: 'pending',
      photoStatus: 'pending',
      imageSlotKey: location.visualAssetKey,
      userLocalClock: true,
    },
  };
};

const publicWorldMetadata = {
  releaseWave: 12,
  releaseStatus: 'playable',
  contentStatus: 'complete_world_v1',
  source: 'vharadren_content_pack_v1',
  sourceSchemaVersion: pack.schemaVersion,
  locationCatalogStatus: 'ready',
  residentRosterStatus: 'ready',
  residentScheduleStatus: 'authored_weekly_v1',
  socialGraphStatus: 'authored_v1',
  photoStatus: 'hero_ready',
  locationPhotoStatus: 'slots_pending',
  mappedLocationPhotoCount: 0,
  locationImageSlotCount: 51,
  residentPortraitStatus: 'slots_pending',
  mappedResidentPortraitCount: 0,
  portraitSlotCount: 49,
  locationCount: 51,
  districtCount: 6,
  publicPlaceCount: 45,
  residentCompanionCount: 49,
  residentGenderRatio: { women: 33, men: 16 },
  weeklyScheduleRowCount: 2058,
  directedSocialConnectionCount: 274,
  recurringEventCount: 10,
  storyArcCount: 12,
  worldFactCount: 123,
  dialogueOpportunityCount: 147,
  interactionBeatCount: 135,
  genreTags: pack.world.genreTags,
  tagline: pack.world.tagline,
  title: pack.world.title,
  pronunciation: pack.world.pronunciation,
  relationshipFantasy: pack.world.relationshipFantasy,
  centralQuestion: pack.world.centralQuestion,
  scheduleClock: 'user_local',
  calendar: pack.world.calendar,
  currencies: pack.world.currencies,
  canonRegistry: 'server_owned',
  privateCanonStatus: 'service_role_only',
};

const appWorld = {
  id: pack.world.id,
  slug: pack.world.slug,
  name: pack.world.name,
  description: pack.world.description,
  hero_asset_key: 'vharadren-hero',
  access_type: 'subscription',
  entitlement_key: 'worlds.standard',
  timezone: 'UTC',
  sort_order: 120,
  featured: true,
  published: true,
  visual_context: pack.world.visualContext,
  default_arrival_location_id: '2d000000-0000-4000-8000-000000000009',
  metadata: publicWorldMetadata,
  world_role: 'home',
  social_rhythm: 'busy',
  dominant_dayparts: pack.world.dominantDayparts,
  relationship_themes: pack.world.relationshipThemes,
  activity_families: pack.world.activityFamilies,
  mobility_style: pack.world.mobilityStyle,
  weather_profile: pack.world.weatherProfile,
};

const json = (value) => JSON.stringify(value);
const packJson = json(pack);
if (packJson.includes('$vharadren_pack$')) throw new Error('Unexpected SQL dollar-quote delimiter in Vharadren source.');

const migration = `-- Complete Vharadren world, residents, simulation, retrieval depth, and private canon.
-- Generated from vharadren_content_pack.json by scripts/generate-vharadren-content.mjs.
begin;

create table if not exists public.together_character_private_profiles(
  character_version_id uuid primary key references public.together_character_versions(id) on delete cascade,
  private_truth text not null,
  adult_continuity text,
  intimate_anatomy text,
  hidden_sexual text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.together_character_private_profiles enable row level security;
revoke all on public.together_character_private_profiles from public,anon,authenticated;
grant select,insert,update,delete on public.together_character_private_profiles to service_role;
comment on table public.together_character_private_profiles is 'Server-only companion truths and adult continuity. Never return these rows through client catalog or bootstrap APIs.';

create table if not exists public.together_world_canon_sources(
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  content_key text not null,
  content_type text not null,
  knowledge_scope text not null default 'story' check(knowledge_scope in('public','visitor','local','insider','private','story')),
  content_level text not null default 'standard' check(content_level in('standard','romance','mature','explicit')),
  payload jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(world_id,content_key)
);
alter table public.together_world_canon_sources enable row level security;
revoke all on public.together_world_canon_sources from public,anon,authenticated;
grant select,insert,update,delete on public.together_world_canon_sources to service_role;
comment on table public.together_world_canon_sources is 'Server-only closed-world canon and secret source material. Runtime retrieval must still apply knowledge and content policy.';

create table if not exists public.together_character_relationship_private(
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  source_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  target_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  private_tension text not null,
  knowledge_scope text not null default 'direct',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(world_id,source_template_id,target_template_id),
  check(source_template_id<>target_template_id)
);
alter table public.together_character_relationship_private enable row level security;
revoke all on public.together_character_relationship_private from public,anon,authenticated;
grant select,insert,update,delete on public.together_character_relationship_private to service_role;

create temporary table vharadren_pack(data jsonb) on commit drop;
insert into vharadren_pack values($vharadren_pack$${packJson}$vharadren_pack$::jsonb);

insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,access_type,entitlement_key,
  timezone,sort_order,featured,visual_context,world_role,social_rhythm,dominant_dayparts,
  relationship_themes,activity_families,mobility_style,weather_profile,default_arrival_location_id
)
select (data->'world'->>'id')::uuid,data->'world'->>'name',data->'world'->>'slug',data->'world'->>'description','vharadren-hero',
  '{"accent":["tarnished gold","deep crimson","storm blue"]}'::jsonb,
  '${json(publicWorldMetadata).replaceAll("'", "''")}'::jsonb,true,'subscription','worlds.standard','UTC',120,true,
  data->'world'->'visualContext','home','busy',array(select jsonb_array_elements_text(data->'world'->'dominantDayparts')),
  array(select jsonb_array_elements_text(data->'world'->'relationshipThemes')),
  array(select jsonb_array_elements_text(data->'world'->'activityFamilies')),data->'world'->>'mobilityStyle',data->'world'->'weatherProfile',null
from vharadren_pack
on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,published=true,
  access_type=excluded.access_type,entitlement_key=excluded.entitlement_key,timezone=excluded.timezone,
  sort_order=excluded.sort_order,featured=excluded.featured,visual_context=excluded.visual_context,
  world_role=excluded.world_role,social_rhythm=excluded.social_rhythm,dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,weather_profile=excluded.weather_profile,updated_at=now();

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,hours,possible_activities,
  metadata,location_type,sort_order,depth,canonical_visual_context,canonical_lore
)
select (item->>'id')::uuid,(item->>'worldId')::uuid,nullif(item->>'parentLocationId','')::uuid,item->>'name',item->>'slug',
  item->>'description',item->>'category',item->>'visualAssetKey',nullif(item->'hours','null'::jsonb),
  array(select jsonb_array_elements_text(item->'activities')),
  (coalesce(item->'metadata','{}'::jsonb) - ARRAY['secretSummary']::text[])||jsonb_build_object(
    'source','vharadren_content_pack_v1','photoStatus','pending','assetStatus','pending','imageSlotKey',item->>'visualAssetKey','userLocalClock',true),
  item->>'locationType',(item->>'index')::int*10,case when item->>'parentLocationId' is null then 0 else 1 end,
  item->'canonicalVisualContext',
  (coalesce(item->'canonicalLore','{}'::jsonb) - ARRAY['signatureDetails','conversationHooks','storySeeds']::text[])||jsonb_build_object(
    'signatureDetails',coalesce(item->'visualAnchors','[]'::jsonb),
    'conversationHooks',(select coalesce(jsonb_agg('How '||value||' changes between quiet and crowded hours.'),'[]'::jsonb) from (select value from jsonb_array_elements_text(coalesce(item->'activities','[]'::jsonb)) limit 3) activities),
    'storySeeds','[]'::jsonb)
from vharadren_pack cross join lateral jsonb_array_elements(data->'locations') item
on conflict(id) do update set world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,name=excluded.name,
  slug=excluded.slug,description=excluded.description,category=excluded.category,visual_asset_key=excluded.visual_asset_key,
  hours=excluded.hours,possible_activities=excluded.possible_activities,metadata=excluded.metadata,
  location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

update public.together_worlds set default_arrival_location_id='2d000000-0000-4000-8000-000000000009'::uuid,updated_at=now()
where id='10000000-0000-4000-8000-000000000013'::uuid;

insert into public.together_world_canon_sources(world_id,content_key,content_type,knowledge_scope,content_level,payload,metadata)
select '10000000-0000-4000-8000-000000000013'::uuid,'world:complete-canon','world_canon','story','standard',
  jsonb_build_object('history',data->'history','castes',data->'castes','houses',data->'houses','religion',data->'religion',
    'magic',data->'magic','dragons',data->'dragons','factions',data->'factions','idiomGuide',data->'idiomGuide'),
  jsonb_build_object('source','vharadren_content_pack_v1','closedWorld',true)
from vharadren_pack
on conflict(world_id,content_key) do update set payload=excluded.payload,metadata=excluded.metadata,updated_at=now();

insert into public.together_world_canon_sources(world_id,content_key,content_type,knowledge_scope,content_level,payload,metadata)
select '10000000-0000-4000-8000-000000000013'::uuid,'world:mature-doctrine','content_doctrine','private','mature',
  jsonb_build_object('matureContentDoctrine',data->'world'->'matureContentDoctrine','contentPolicy',data->'contentPolicy'),
  jsonb_build_object('source','vharadren_content_pack_v1','existingPolicyRequired',true)
from vharadren_pack
on conflict(world_id,content_key) do update set payload=excluded.payload,metadata=excluded.metadata,updated_at=now();

insert into public.together_world_canon_sources(world_id,content_key,content_type,knowledge_scope,content_level,payload,metadata)
select '10000000-0000-4000-8000-000000000013'::uuid,'location:'||(item->>'slug'),'location_secret','story','standard',
  jsonb_build_object('secret',item->>'secret','storySeeds',item->'storySeeds','signatureDetails',item->'canonicalLore'->'signatureDetails'),
  jsonb_build_object('source','vharadren_content_pack_v1','locationId',item->>'id','locationSlug',item->>'slug')
from vharadren_pack cross join lateral jsonb_array_elements(data->'locations') item
on conflict(world_id,content_key) do update set payload=excluded.payload,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_templates(
  id,name,slug,public_handle,age,occupation,biography,creator_id,current_published_version,published,
  lifecycle_status,visibility,relationship_goal,connection_config,spice_level,character_role,
  can_be_selected,can_be_romanced,discovery_metadata,first_meeting,updated_at
)
select (item->>'templateId')::uuid,item->>'name',item->>'slug',item->>'slug',(item->>'age')::int,
  item->>'occupation',item->>'biography',null,1,true,'published','public',item->>'relationshipGoal',
  item->'relationshipConfig',(item->>'spiceLevel')::int,'primary_companion',
  coalesce((item->>'canBeSelected')::boolean,true),coalesce((item->>'canBeRomanced')::boolean,true),
  jsonb_build_object('summary',item->>'biography','traits',item->'traits','goals',jsonb_build_array('Dating','Friendship','Stories'),
    'featured',(item->>'rosterId')::int between 1 and 8,'new',true,'gender',item->>'gender','pronouns',item->>'pronouns',
    'background',item->>'background','classification',item->>'classification','species','human','fictional',true,
    'caste',item->>'caste','residentWorldSlug','vharadren','districtSlug',item->>'districtSlug','primaryLocationSlug',item->>'workSlug',
    'portraitStatus','pending','portraitSlotKey',item->>'portraitAssetKey','portraitFocalPosition','top',
    'storyHook',item->>'storyHook','romancePreferences',jsonb_build_object('available',true,'playerInclusive',true,'style',item->>'romanceStyle'),
    'initialRelationshipState','stranger','ageAware',true,'source','vharadren_content_pack_v1'),
  item->'firstMeeting'||jsonb_build_object('location_id',meeting.id),now()
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
join public.together_locations meeting on meeting.world_id='10000000-0000-4000-8000-000000000013'::uuid and meeting.slug=item->'firstMeeting'->>'locationSlug'
on conflict(id) do update set name=excluded.name,slug=excluded.slug,public_handle=excluded.public_handle,age=excluded.age,
  occupation=excluded.occupation,biography=excluded.biography,current_published_version=1,published=true,
  lifecycle_status='published',visibility='public',relationship_goal=excluded.relationship_goal,
  connection_config=excluded.connection_config,spice_level=excluded.spice_level,character_role=excluded.character_role,
  can_be_selected=excluded.can_be_selected,can_be_romanced=excluded.can_be_romanced,
  discovery_metadata=excluded.discovery_metadata,first_meeting=excluded.first_meeting,updated_at=now();

insert into public.together_character_versions(
  id,character_template_id,version,pronouns,personality_config,values_config,interests,communication_style,
  appearance_config,visual_identity,voice_config,boundaries,default_social_graph,portrait_asset_key,
  relationship_config,life_config,character_bible,appearance_candidates,content_boundaries,published_at,updated_at
)
select (item->>'versionId')::uuid,(item->>'templateId')::uuid,1,item->>'pronouns',
  jsonb_build_object('warmth',case when item->'traits'?|array['warm','gentle','generous','affectionate','tender','compassionate'] then .84 else .68 end,
    'humor',case when item->'traits'?|array['witty','dry','playful','teasing','mischievous'] then .82 else .56 end,
    'directness',coalesce((item->'communicationStyle'->>'directness')::numeric,.7),'independence',.92,
    'spontaneity',case (item->>'spiceLevel')::int when 1 then .48 when 2 then .66 else .8 end,
    'socialEnergy',case when item->'traits'?|array['private','restrained','introspective','guarded','quiet'] then .46 else .7 end,
    'creativity',.76,'curiosity',.84),
  '{"autonomy":0.98,"mutualRespect":0.98,"honesty":0.9,"consent":1,"privacy":0.96,"ordinaryLife":0.88}'::jsonb,
  array(select jsonb_array_elements_text(item->'interests')),item->'communicationStyle',
  jsonb_build_object('photoStatus','pending','portraitStatus','slot_ready','canonicalDescription',item->>'appearance',
    'classification',item->>'classification','background',item->>'background','gender',item->>'gender','age',(item->>'age')::int,'caste',item->>'caste'),
  jsonb_build_object('canonicalDescription',item->>'appearance','referenceStoragePaths','[]'::jsonb,
    'visualDoNotChange',jsonb_build_array('fictional adult age '||(item->>'age'),'gender presentation: '||(item->>'gender'),
      'background: '||(item->>'background'),'recognizable face, hair, complexion, build, and proportions'),
    'identityVersion',1,'fictional',true,'status','portrait_slot_pending','portraitSlotKey',item->>'portraitAssetKey',
    'worldVisualStyle',jsonb_build_array('cinematic painterly realism','weathered late-medieval materials','grounded adult high fantasy','no real-person likeness'),
    'gender',item->>'gender','portraitPrompt',item->>'portraitPrompt','homePrompt',item->>'homePrompt'),
  jsonb_build_object('voiceKey',item->'voiceProfile'->>'voiceKey','delivery',item->'voiceProfile'->>'delivery','providerMappings','{}'::jsonb),
  array(select jsonb_array_elements_text(item->'boundaries'))||array['fictional adult','mutual consent','independent point of view','respect user boundaries','rank, work, debt, captivity, sanctuary, rescue, and payment never create consent'],
  coalesce(item->'circleSlugs','[]'::jsonb),item->>'portraitAssetKey',item->'relationshipConfig',
  item->'lifeConfig'||jsonb_build_object('homeLocationId',district.id,'homeDistrictSlug',item->>'districtSlug','homeWorldId','10000000-0000-4000-8000-000000000013',
    'scheduling',coalesce(item->'lifeConfig'->'scheduling','{}'::jsonb)||jsonb_build_object('userLocalClock',true)),
  (coalesce(item->'characterBible','{}'::jsonb) - ARRAY['privateTruth','adultContinuity','intimateAnatomy','hiddenSexual']::text[])||jsonb_build_object(
    'fictional',true,'closedWorldKnowledge','Knows Vharadren, its authored residents, institutions, locations, calendar, and established history. Treats rumors, secrets, and distant figures according to supplied knowledge scope; never imports real-world people, brands, politics, or current events as personal experience.',
    'identityFacts',jsonb_build_array('I am '||(item->>'age')||' years old.','My home world is Vharadren.','My caste is '||(item->>'caste')||'.','My work is '||(item->>'occupation')||'.')),
  '[]'::jsonb,
  jsonb_build_object('adult_only',true,'allows_romance',true,'allows_suggestive',(item->>'spiceLevel')::int>=2,
    'allows_mature',(item->>'spiceLevel')::int>=2,'allows_explicit',(item->>'spiceLevel')::int>=3),now(),now()
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
join public.together_locations district on district.world_id='10000000-0000-4000-8000-000000000013'::uuid and district.slug=item->>'districtSlug'
on conflict(id) do update set pronouns=excluded.pronouns,personality_config=excluded.personality_config,
  values_config=excluded.values_config,interests=excluded.interests,communication_style=excluded.communication_style,
  appearance_config=excluded.appearance_config,visual_identity=excluded.visual_identity,voice_config=excluded.voice_config,
  boundaries=excluded.boundaries,default_social_graph=excluded.default_social_graph,portrait_asset_key=excluded.portrait_asset_key,
  relationship_config=excluded.relationship_config,life_config=excluded.life_config,character_bible=excluded.character_bible,
  appearance_candidates=excluded.appearance_candidates,content_boundaries=excluded.content_boundaries,
  published_at=excluded.published_at,updated_at=now();

insert into public.together_character_private_profiles(character_version_id,private_truth,adult_continuity,intimate_anatomy,hidden_sexual,metadata)
select (item->>'versionId')::uuid,item->>'privateTruth',item->'characterBible'->>'adultContinuity',item->>'intimateAnatomy',item->>'hiddenSexual',
  jsonb_build_object('source','vharadren_content_pack_v1','characterSlug',item->>'slug','desire',item->>'desire','complication',item->>'complication','policy','server_only')
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
on conflict(character_version_id) do update set private_truth=excluded.private_truth,adult_continuity=excluded.adult_continuity,
  intimate_anatomy=excluded.intimate_anatomy,hidden_sexual=excluded.hidden_sexual,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_world_presence(character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata)
select (item->>'versionId')::uuid,'10000000-0000-4000-8000-000000000013'::uuid,'resident',district.id,1,1,
  jsonb_build_object('source','vharadren_content_pack_v1','residentWorldSlug','vharadren','homeDistrictSlug',item->>'districtSlug',
    'workLocationSlug',item->>'workSlug','classification',item->>'classification','portraitStatus','pending',
    'portraitSlotKey',item->>'portraitAssetKey','authored',true,'dynamicSchedule',true,
    'scheduleProfile','vharadren_rich_weekly_v1','userLocalClock',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
join public.together_locations district on district.world_id='10000000-0000-4000-8000-000000000013'::uuid and district.slug=item->>'districtSlug'
on conflict(character_version_id,world_id) do update set presence_type='resident',home_location_id=excluded.home_location_id,
  familiarity=1,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_voice_profiles(character_template_id,voice_key,characteristics,provider_mappings,metadata)
select (item->>'templateId')::uuid,item->'voiceProfile'->>'voiceKey',
  jsonb_build_object('gender',item->>'gender','delivery',item->'voiceProfile'->>'delivery','register',item->>'languageRegister'),
  '{}'::jsonb,jsonb_build_object('source','vharadren_content_pack_v1','providerAssignment','pending','authored',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
on conflict(character_template_id) do update set voice_key=excluded.voice_key,characteristics=excluded.characteristics,
  provider_mappings=excluded.provider_mappings,metadata=excluded.metadata,active=true,updated_at=now();

insert into public.together_character_homes(
  character_version_id,world_id,district_anchor_location_id,name,residence_type,description,prompt_text,
  canonical_visual_context,canonical_lore,reference_policy,source,prompt_version,active
)
select (item->>'versionId')::uuid,'10000000-0000-4000-8000-000000000013'::uuid,district.id,
  (item->>'name')||'''s Private Quarters','private residence',item->>'homePrompt',
  (item->>'homePrompt')||' Preserve the resident''s established caste, occupation, interests, privacy, and district materials. Keep the room human-scale and visibly lived in. No public signage, readable text, modern objects, real-world logos, or implied user access without an authored invitation.',
  jsonb_build_object('canonicalPrompt',(item->>'homePrompt')||' Textless cinematic painterly realism, weathered late-medieval materials, Vharadren visual continuity, no modern objects, no readable text.',
    'indoorOutdoor','indoor','visualAnchors',jsonb_build_array(item->>'districtSlug',item->>'occupation',item->>'caste'),'avoid',jsonb_build_array('modern objects','generic clean castle room','readable text','implied public access')),
  jsonb_build_object('version',2,'authored',true,'summary',item->>'homePrompt','stableFacts',jsonb_build_array('This is a private residence.','Entry requires an authored invitation or canonical shared scene.'),
    'localEtiquette',jsonb_build_array('Familiarity alone never grants entry.','Remote conversation never implies co-presence.')),
  'text_only','authored',1,true
from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item
join public.together_locations district on district.world_id='10000000-0000-4000-8000-000000000013'::uuid and district.slug=item->>'districtSlug'
on conflict(character_version_id) do update set world_id=excluded.world_id,district_anchor_location_id=excluded.district_anchor_location_id,
  name=excluded.name,residence_type=excluded.residence_type,description=excluded.description,prompt_text=excluded.prompt_text,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,
  reference_policy=excluded.reference_policy,source='authored',prompt_version=excluded.prompt_version,active=true,updated_at=now();

with activity_rows as(
  select item->>'characterVersionId' version_id,item->>'activityKey' activity_key,item->>'activity' activity,
    (item->>'startMinute')::int start_minute,(item->>'endMinute')::int end_minute,item->>'locationSlug' location_slug,
    item->>'availability' availability,item->>'mood' mood
  from vharadren_pack cross join lateral jsonb_array_elements(data->'weeklySchedules') item
), grouped as(
  select version_id,activity_key,min(activity) title,min(start_minute) start_minute,max(end_minute) end_minute,
    array_remove(array_agg(distinct location_slug),null) location_slugs,array_agg(distinct mood) moods,
    count(*)::int frequency,bool_or(availability='busy') busy,bool_or(availability='limited') limited
  from activity_rows group by version_id,activity_key
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,
  location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,
  energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select version_id::uuid,activity_key,title,
  case when activity_key~'(sleep|private|home|morning)' then 'home' when activity_key~'(work|court|shift)' then 'work' else 'routine' end,
  jsonb_build_array(jsonb_build_object('startMinute',start_minute%1440,'endMinute',least(end_minute,1440))),
  int4range(greatest(15,end_minute-start_minute),greatest(16,end_minute-start_minute+1),'[)'),
  array(select distinct location.category from public.together_locations location where location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=any(location_slugs)),
  location_slugs,array['vharadren',activity_key],.75,int4range(frequency,frequency+1,'[)'),least(14,frequency),6,null,'either',
  case when busy then 'recurring_routine' else 'preferred_activity' end,'known',case when busy then 'busy' when limited then 'limited' else 'open' end,
  jsonb_build_object('source','vharadren_content_pack_v1','authored',true,'userLocalClock',true,'moods',moods)
from grouped
on conflict(character_version_id,activity_key) do update set title=excluded.title,category=excluded.category,
  valid_time_windows=excluded.valid_time_windows,duration_minutes=excluded.duration_minutes,
  location_categories=excluded.location_categories,location_slugs=excluded.location_slugs,tags=excluded.tags,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,
  priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,
  metadata=excluded.metadata,updated_at=now();

insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  energy_delta,mood_influence,variation_weight,metadata
)
select (item->>'characterVersionId')::uuid,
  ((item->>'dayOfWeek')::int+floor((item->>'startMinute')::numeric/1440)::int)%7,
  (item->>'startMinute')::int%1440,
  case when floor((item->>'startMinute')::numeric/1440)<floor(((item->>'endMinute')::int-1)::numeric/1440) then 1440 else (item->>'endMinute')::int%1440 end,
  location.id,item->>'activity',item->>'availability',(item->>'energyDelta')::int,item->>'mood',1,
  jsonb_build_object('source',item->>'source','scheduleMode','authored','activityKey',item->>'activityKey','slot',(item->>'slot')::int,
    'diegeticDay',item->>'diegeticDay','originalDayOfWeek',(item->>'dayOfWeek')::int,
    'originalStartMinute',(item->>'startMinute')::int,'originalEndMinute',(item->>'endMinute')::int,
    'userLocalClock',true,'generationVersion','vharadren_authored_weekly_v1')
from vharadren_pack cross join lateral jsonb_array_elements(data->'weeklySchedules') item
left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
on conflict(character_version_id,day_of_week,start_minute) do update set end_minute=excluded.end_minute,
  location_id=excluded.location_id,activity=excluded.activity,availability=excluded.availability,
  energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,variation_weight=excluded.variation_weight,
  metadata=excluded.metadata;

insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000013'::uuid,source.id,target.id,item->>'relationshipType',
  round((item->>'affinity')::numeric*100)::int,round((item->>'trust')::numeric*100)::int,item->>'publicDynamic',
  jsonb_build_object('source','vharadren_content_pack_v1','authored',coalesce((item->>'authored')::boolean,true),
    'tension',(item->>'tension')::numeric,'knowledgeScope',item->>'knowledgeScope','publicDynamic',item->>'publicDynamic')
from vharadren_pack cross join lateral jsonb_array_elements(data->'socialConnections') item
join public.together_character_templates source on source.slug=item->>'sourceSlug'
join public.together_character_templates target on target.slug=item->>'targetSlug'
on conflict(world_id,source_template_id,target_template_id) do update set relationship_type=excluded.relationship_type,
  affinity=excluded.affinity,trust=excluded.trust,history=excluded.history,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_relationship_private(world_id,source_template_id,target_template_id,private_tension,knowledge_scope,metadata)
select '10000000-0000-4000-8000-000000000013'::uuid,source.id,target.id,item->>'privateTension',item->>'knowledgeScope',
  jsonb_build_object('source','vharadren_content_pack_v1','sourceSlug',item->>'sourceSlug','targetSlug',item->>'targetSlug','relationshipType',item->>'relationshipType')
from vharadren_pack cross join lateral jsonb_array_elements(data->'socialConnections') item
join public.together_character_templates source on source.slug=item->>'sourceSlug'
join public.together_character_templates target on target.slug=item->>'targetSlug'
on conflict(world_id,source_template_id,target_template_id) do update set private_tension=excluded.private_tension,
  knowledge_scope=excluded.knowledge_scope,metadata=excluded.metadata,updated_at=now();

insert into public.together_world_canon_sources(world_id,content_key,content_type,knowledge_scope,content_level,payload,metadata)
select '10000000-0000-4000-8000-000000000013'::uuid,'relationship:'||(item->>'sourceSlug')||':'||(item->>'targetSlug'),
  'key_relationship','story','standard',item,jsonb_build_object('source','vharadren_content_pack_v1','authored',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'keyRelationships') item
on conflict(world_id,content_key) do update set payload=excluded.payload,metadata=excluded.metadata,updated_at=now();

insert into public.together_event_templates(
  id,name,event_type,category,tone,scale,content_level,world_id,default_location_id,participant_template_ids,
  significance,probability,duration_minutes,narrative_summary,state_effects,conditions,followups,
  user_visibility,proactive_eligible,metadata,active
)
select ('3a000000-0000-4000-8013-'||lpad(ordinality::text,12,'0'))::uuid,item->>'title','world','world','exciting','meaningful','standard',
  '10000000-0000-4000-8000-000000000013'::uuid,location.id,
  array(select template.id from public.together_character_templates template where template.slug=any(array(select jsonb_array_elements_text(item->'participants')))),
  .72,1,greatest(15,(item->>'endMinute')::int-(item->>'startMinute')::int),item->>'rhythm','{}'::jsonb,
  jsonb_build_object('dayOfWeek',(item->>'dayOfWeek')::int,'startMinute',(item->>'startMinute')::int,'userLocalClock',true),
  array(select jsonb_array_elements_text(item->'hooks')),'contextual',true,
  jsonb_build_object('source','vharadren_content_pack_v1','slug',item->>'slug','participantSlugs',item->'participants','worldEvent',true),true
from vharadren_pack cross join lateral jsonb_array_elements(data->'recurringEvents') with ordinality payload(item,ordinality)
join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
on conflict(id) do update set name=excluded.name,event_type=excluded.event_type,category=excluded.category,tone=excluded.tone,
  scale=excluded.scale,content_level=excluded.content_level,world_id=excluded.world_id,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,significance=excluded.significance,probability=excluded.probability,
  duration_minutes=excluded.duration_minutes,narrative_summary=excluded.narrative_summary,conditions=excluded.conditions,
  followups=excluded.followups,user_visibility=excluded.user_visibility,proactive_eligible=excluded.proactive_eligible,
  metadata=excluded.metadata,active=true,updated_at=now();

insert into public.together_world_event_templates(
  world_id,slug,title,summary,event_type,location_id,district_location_id,weekdays,start_minute,duration_minutes,
  probability,knowledge_scope,significance,topic_tags,activity_tags,participant_selector,atmosphere,plan_affordances,weight,active,metadata
)
select '10000000-0000-4000-8000-000000000013'::uuid,item->>'slug',item->>'title',item->>'rhythm','world',location.id,location.parent_location_id,
  array[(item->>'dayOfWeek')::smallint],(item->>'startMinute')::int,(item->>'endMinute')::int-(item->>'startMinute')::int,
  1,'public',.72,array['vharadren',item->>'slug'],array(select jsonb_array_elements_text(item->'hooks')),
  jsonb_build_object('characterSlugs',item->'participants','maximum',jsonb_array_length(item->'participants')),
  item->>'rhythm',jsonb_build_object('reason',(item->'hooks'->>0),'locationSlug',item->>'locationSlug'),1,true,
  jsonb_build_object('source','vharadren_content_pack_v1','userLocalClock',true,'authored',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'recurringEvents') item
join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
on conflict(world_id,slug) do update set title=excluded.title,summary=excluded.summary,event_type=excluded.event_type,
  location_id=excluded.location_id,district_location_id=excluded.district_location_id,weekdays=excluded.weekdays,
  start_minute=excluded.start_minute,duration_minutes=excluded.duration_minutes,probability=excluded.probability,
  knowledge_scope=excluded.knowledge_scope,significance=excluded.significance,topic_tags=excluded.topic_tags,
  activity_tags=excluded.activity_tags,participant_selector=excluded.participant_selector,atmosphere=excluded.atmosphere,
  plan_affordances=excluded.plan_affordances,weight=excluded.weight,active=true,metadata=excluded.metadata,updated_at=now();

insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select item->>'slug',item->>'title','world',
  array(select template.id from public.together_character_templates template where template.slug=any(array(select jsonb_array_elements_text(item->'involved')))),
  'acquaintance',jsonb_build_object('worldSlug','vharadren','characterSlugs',item->'involved','premise',item->>'premise',
    'coreFacts',item->'coreFacts','possibleEndStates',item->'possibleEndStates','closedWorld',true),
  (select jsonb_agg(jsonb_build_object('id','chapter-'||ordinality,'title','Chapter '||ordinality,
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,'mayTriggerProactiveMessage',true,
    'mayCreateMoment',ordinality=jsonb_array_length(item->'stages'),'narrativeSeed',stage #>> '{}',
    'minimumHoursBeforeNext',24,'eligibleCharacterSlugs',item->'involved') order by ordinality)
    from jsonb_array_elements(item->'stages') with ordinality stage_rows(stage,ordinality)),
  90,false,'major',true,'specific','10000000-0000-4000-8000-000000000013'::uuid
from vharadren_pack cross join lateral jsonb_array_elements(data->'storyArcs') item
on conflict(slug) do update set title=excluded.title,category=excluded.category,eligible_template_ids=excluded.eligible_template_ids,
  min_relationship_stage=excluded.min_relationship_stage,prerequisites=excluded.prerequisites,chapters=excluded.chapters,
  cooldown_days=excluded.cooldown_days,repeatable=excluded.repeatable,priority=excluded.priority,active=true,
  world_scope='specific',specific_world_id=excluded.specific_world_id,updated_at=now();

insert into public.together_world_facts(
  world_id,slug,title,fact_text,category,truth_mode,knowledge_scope,content_level,district_location_id,location_id,
  topic_tags,trigger_terms,dayparts,relationship_stages,min_world_familiarity,required_story_slug,
  interactive,weight,cooldown_turns,active,metadata
)
select '10000000-0000-4000-8000-000000000013'::uuid,item->>'slug',item->>'title',item->>'factText',item->>'category',
  item->>'truthMode',item->>'knowledgeScope',item->>'contentLevel',district.id,location.id,
  array(select jsonb_array_elements_text(coalesce(item->'topicTags','[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(item->'triggerTerms','[]'::jsonb))),'{}'::text[],
  array(select jsonb_array_elements_text(coalesce(item->'relationshipStages','[]'::jsonb))),
  coalesce((item->>'minWorldFamiliarity')::int,0),nullif(item->>'requiredStorySlug',''),coalesce((item->>'interactive')::boolean,false),
  coalesce((item->>'weight')::numeric,1),coalesce((item->>'cooldownTurns')::int,24),true,
  jsonb_build_object('source','vharadren_content_pack_v1','closedWorld',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'worldFacts') item
left join public.together_locations district on district.world_id='10000000-0000-4000-8000-000000000013'::uuid and district.slug=item->>'districtSlug'
left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
on conflict(world_id,slug) do update set title=excluded.title,fact_text=excluded.fact_text,category=excluded.category,
  truth_mode=excluded.truth_mode,knowledge_scope=excluded.knowledge_scope,content_level=excluded.content_level,
  district_location_id=excluded.district_location_id,location_id=excluded.location_id,topic_tags=excluded.topic_tags,
  trigger_terms=excluded.trigger_terms,dayparts=excluded.dayparts,relationship_stages=excluded.relationship_stages,
  min_world_familiarity=excluded.min_world_familiarity,required_story_slug=excluded.required_story_slug,
  interactive=excluded.interactive,weight=excluded.weight,cooldown_turns=excluded.cooldown_turns,
  active=true,metadata=excluded.metadata,updated_at=now();

insert into public.together_dialogue_opportunities(
  world_id,slug,topic,angle,framing,location_id,district_location_id,topic_tags,trigger_terms,character_tags,
  min_relationship_stage,content_level,min_spice_level,dayparts,interaction_modes,weight,cooldown_turns,active,metadata
)
select '10000000-0000-4000-8000-000000000013'::uuid,item->>'slug',item->>'topic',item->>'angle',item->>'framing',
  location.id,location.parent_location_id,
  array(select jsonb_array_elements_text(coalesce(item->'topicTags','[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(item->'triggerTerms','[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(item->'characterSlugs','[]'::jsonb))),
  nullif(item->>'minRelationshipStage',''),item->>'contentLevel',nullif(item->>'minSpiceLevel','')::int,
  array(select jsonb_array_elements_text(coalesce(item->'dayparts','[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(item->'interactionModes','[]'::jsonb))),
  coalesce((item->>'weight')::numeric,1),coalesce((item->>'cooldownTurns')::int,24),true,
  jsonb_build_object('source','vharadren_content_pack_v1','characterSlugs',item->'characterSlugs','closedWorld',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'dialogueOpportunities') item
left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
on conflict(world_id,slug) do update set topic=excluded.topic,angle=excluded.angle,framing=excluded.framing,
  location_id=excluded.location_id,district_location_id=excluded.district_location_id,topic_tags=excluded.topic_tags,
  trigger_terms=excluded.trigger_terms,character_tags=excluded.character_tags,
  min_relationship_stage=excluded.min_relationship_stage,content_level=excluded.content_level,
  min_spice_level=excluded.min_spice_level,dayparts=excluded.dayparts,interaction_modes=excluded.interaction_modes,
  weight=excluded.weight,cooldown_turns=excluded.cooldown_turns,active=true,metadata=excluded.metadata,updated_at=now();

insert into public.together_scene_interaction_beats(
  world_id,slug,title,location_id,district_location_id,interaction_type,seed,affordances,topic_tags,character_tags,
  min_relationship_stage,content_level,min_spice_level,interaction_modes,co_present_required,
  required_participant_count,maximum_participant_count,dayparts,activity_tags,weight,cooldown_hours,active,metadata
)
select '10000000-0000-4000-8000-000000000013'::uuid,item->>'slug',item->>'title',location.id,
  coalesce(district.id,location.parent_location_id),case when item->>'contentLevel'='mature' then 'adult' else 'environment' end,
  item->>'framing',jsonb_build_array(item->>'affordance'),array['vharadren',item->>'locationSlug'],
  array(select jsonb_array_elements_text(coalesce(item->'requiredParticipantSlugs','[]'::jsonb))),
  nullif(item->>'minRelationshipStage',''),item->>'contentLevel',nullif(item->>'minSpiceLevel','')::int,
  array(select jsonb_array_elements_text(coalesce(item->'interactionModes','[]'::jsonb))),true,
  (item->>'minParticipants')::int,(item->>'maxParticipants')::int,
  array(select jsonb_array_elements_text(coalesce(item->'dayparts','[]'::jsonb))),array[item->>'locationSlug'],1,
  coalesce((item->>'cooldownTurns')::int,24),coalesce((item->>'active')::boolean,true),
  jsonb_build_object('source','vharadren_content_pack_v1','requiredParticipantSlugs',item->'requiredParticipantSlugs',
    'outcomePolicy',item->>'outcomePolicy','neverDeclareUserAction',true,'neverMutateRelationshipDirectly',true,'closedWorld',true)
from vharadren_pack cross join lateral jsonb_array_elements(data->'interactionBeats') item
left join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'locationSlug'
left join public.together_locations district on district.world_id='10000000-0000-4000-8000-000000000013'::uuid and district.slug=item->>'districtSlug'
on conflict(world_id,slug) do update set title=excluded.title,location_id=excluded.location_id,
  district_location_id=excluded.district_location_id,interaction_type=excluded.interaction_type,seed=excluded.seed,
  affordances=excluded.affordances,topic_tags=excluded.topic_tags,character_tags=excluded.character_tags,
  min_relationship_stage=excluded.min_relationship_stage,content_level=excluded.content_level,min_spice_level=excluded.min_spice_level,
  interaction_modes=excluded.interaction_modes,co_present_required=excluded.co_present_required,
  required_participant_count=excluded.required_participant_count,maximum_participant_count=excluded.maximum_participant_count,
  dayparts=excluded.dayparts,activity_tags=excluded.activity_tags,weight=excluded.weight,cooldown_hours=excluded.cooldown_hours,
  active=excluded.active,metadata=excluded.metadata,updated_at=now();

do $$
declare location_count int;district_count int;template_count int;version_count int;women_count int;men_count int;
  home_count int;presence_count int;voice_count int;private_count int;schedule_count int;bad_schedule_count int;
  incomplete_schedule_count int;edge_count int;private_edge_count int;event_count int;pulse_count int;arc_count int;
  fact_count int;opportunity_count int;beat_count int;unresolved_count int;private_leak_count int;
begin
  select count(*),count(*) filter(where location_type='district') into location_count,district_count from public.together_locations where world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(*),count(*) filter(where discovery_metadata->>'gender'='woman'),count(*) filter(where discovery_metadata->>'gender'='man') into template_count,women_count,men_count from public.together_character_templates where id::text like '24000000-0000-4000-8013-%';
  select count(*) into version_count from public.together_character_versions where id::text like '25000000-0000-4000-8013-%';
  select count(*) into home_count from public.together_character_homes where world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(*) into presence_count from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(*) into voice_count from public.together_character_voice_profiles where character_template_id::text like '24000000-0000-4000-8013-%' and active;
  select count(*) into private_count from public.together_character_private_profiles where character_version_id::text like '25000000-0000-4000-8013-%' and length(private_truth)>0 and length(hidden_sexual)>0 and length(intimate_anatomy)>0;
  select count(*),count(*) filter(where start_minute<0 or start_minute>=end_minute or end_minute>1440) into schedule_count,bad_schedule_count from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8013-%';
  select count(*) into incomplete_schedule_count from(select character_version_id,count(*) rows,count(distinct day_of_week) days from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8013-%' group by character_version_id having count(*)<>42 or count(distinct day_of_week)<>7) incomplete;
  select count(*) into edge_count from public.together_character_relationship_edges where world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(*) into private_edge_count from public.together_character_relationship_private where world_id='10000000-0000-4000-8000-000000000013'::uuid;
  select count(*) into event_count from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into pulse_count from public.together_world_event_templates where world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into arc_count from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into fact_count from public.together_world_facts where world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into opportunity_count from public.together_dialogue_opportunities where world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into beat_count from public.together_scene_interaction_beats where world_id='10000000-0000-4000-8000-000000000013'::uuid and active;
  select count(*) into unresolved_count from vharadren_pack cross join lateral jsonb_array_elements(data->'characters') item where not exists(select 1 from public.together_locations location where location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->>'workSlug') or not exists(select 1 from public.together_locations location where location.world_id='10000000-0000-4000-8000-000000000013'::uuid and location.slug=item->'firstMeeting'->>'locationSlug');
  select count(*) into private_leak_count from public.together_character_versions where id::text like '25000000-0000-4000-8013-%' and (character_bible ?| array['privateTruth','adultContinuity','intimateAnatomy','hiddenSexual']);
  if location_count<>51 or district_count<>6 or template_count<>49 or version_count<>49 or women_count<>33 or men_count<>16
    or home_count<>49 or presence_count<>49 or voice_count<>49 or private_count<>49 or schedule_count<>2058
    or bad_schedule_count<>0 or incomplete_schedule_count<>0 or edge_count<>274 or private_edge_count<>274
    or event_count<>10 or pulse_count<>10 or arc_count<>12 or fact_count<>123 or opportunity_count<>147 or beat_count<>135
    or unresolved_count<>0 or private_leak_count<>0 then
    raise exception 'Vharadren validation failed: loc %/% char %/%/% versions % homes % presence % voices % private % schedules % bad % incomplete % edges %/% events %/% arcs % facts % opportunities % beats % unresolved % leaks %',
      location_count,district_count,template_count,women_count,men_count,version_count,home_count,presence_count,voice_count,private_count,
      schedule_count,bad_schedule_count,incomplete_schedule_count,edge_count,private_edge_count,event_count,pulse_count,arc_count,
      fact_count,opportunity_count,beat_count,unresolved_count,private_leak_count;
  end if;
end $$;

commit;
`;

const worldModule = `import type{Location,World}from'../types';

export const VHARADREN_WORLD_ID='${pack.world.id}';
export const VHARADREN_ARRIVAL_ID='2d000000-0000-4000-8000-000000000009';
export const vharadrenCharacterSlugs=${json(pack.characters.map((item) => item.slug))} as const;
export const vharadrenAssetSlots={hero:{key:'vharadren-hero',status:'ready'},locations:${json(pack.locations.map((item) => ({ key: item.visualAssetKey, status: 'pending' })))},portraits:${json(pack.characters.map((item) => ({ key: item.portraitAssetKey, status: 'pending' })))}} as const;
export const vharadrenWorld:World=${json(appWorld)};
export const vharadrenLocations:Location[]=${json(pack.locations.map(publicLocation))};
`;

await writeFile(migrationPath, migration, 'utf8');
await writeFile(worldModulePath, worldModule, 'utf8');
console.log(JSON.stringify({ sourcePath, migrationPath, worldModulePath, counts: expected, women, men }, null, 2));
