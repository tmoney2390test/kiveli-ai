import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST } from './gilded-coast-adult-cast-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORLD = 'gilded-coast';
const SOURCE = 'gilded_coast_adult_cast_v1';
const WW = '09';
const WORLD_CFG = {
  id: '10000000-0000-4000-8000-000000000014',
  ww: WW,
  name: 'The Gilded Coast',
  style: 'tropical harbor photoreal, salt air, lantern light, weathered late-gilded pirate material, lived-in workwear',
  avoid: 'slave-market staging, real-world landmarks, readable text, logos, slips, sports bras, mesh, harnesses, latex, pasties, peeled wetsuits, soaked white dresses',
};
const VOICE_PREFIX = 'gilded-coast';
const KNOWN_EXTRA_ANCHORS = new Set(['iori']);
const GILDED_EXISTING = [
  'amara-kade', 'anika-saye', 'bastien-crow', 'bruna-kest', 'cassia-bloom', 'celia-mar',
  'dorian-pike', 'elara-voss', 'elias-reed', 'fen-moreno', 'hugo-fen', 'idris-vale',
  'inez-sol', 'iria-montrose', 'javier-ro', 'julian-mercer', 'keon-flint', 'levi-ash',
  'luca-vane', 'lucien-damar', 'maia-bel', 'mara-blackfin', 'mateo-salt', 'mira-cael',
  'nadia-storm', 'nera-tide', 'nico-solari', 'oren-gale', 'rafiq-nadir', 'sabine-quill',
  'sami-haddad', 'seraphine-vale', 'sora-bay', 'talia-wren', 'tomas-renn', 'yara-nouri',
];
const LODGING = 'blue-lantern-inn';

function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pad(text, min) {
  let out = String(text || '').trim();
  const filler = ' The room stays ordinary, private, and closed unless this resident invites someone in.';
  while (out.length < min) out += filler;
  return out;
}

function xaiVoice(gender, index) {
  const pool = gender === 'man' ? ['leo', 'rex', 'sal'] : ['eve', 'ara', 'sal'];
  return pool[index % 3];
}

function pronouns(gender) {
  return gender === 'man' ? 'he/him' : 'she/her';
}

function uuidFor(kind, index) {
  const prefix = kind === 'template' ? '22000000' : '23000000';
  return `${prefix}-0000-4000-80a1-0000000${WW}${String(index).padStart(3, '0')}`;
}

function titleCaseSlug(slug) {
  return slug.split('-').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function firstName(name) {
  return String(name).replace(/^(Priestess|Captain|Inquisitor|Warden|Ser|Oath-Sister)\s+/i, '').split(/\s+/)[0];
}

export function loadCast() {
  if (CAST.length !== 20) throw new Error(`Expected 20 Gilded Coast companions, got ${CAST.length}`);
  return CAST.map((item, offset) => {
    if (item.world !== WORLD) throw new Error(`Unexpected world ${item.world} (${item.name})`);
    if (item.home !== LODGING) throw new Error(`${item.name} home ${item.home} is not photographed lodging ${LODGING}`);
    const index = offset + 1;
    const slug = slugify(item.name);
    const gender = item.gender;
    const voiceKey = `${VOICE_PREFIX}-${slug}`;
    const biography = `${item.name} is ${WORLD_CFG.name}'s ${item.occupation.toLowerCase()}. ${item.traits.join(', ')}. ${item.desire} ${item.hook}`;
    const homeName = `${item.name}'s private room`;
    const homeDescription = pad(
      `A compact private room ${firstName(item.name)} keeps off the clock at the Blue Lantern Inn: work clothes on a chair, a dish for jewelry or keys, leftover food, and a bed that is not the job. ${item.occupation} details stay ordinary and lived-in.`,
      120,
    );
    const homePrompt = pad(
      `Private textless living space of ${item.name} in ${item.district}, reflecting a ${item.occupation}, ${item.background}, and life after the work is finished. Keep the room human-scale and visibly lived in. No public signage, readable text, luxury staging, or implied player access without an authored invitation. Preserve the resident's privacy and ordinary materials. ${WORLD_CFG.style}. Avoid ${WORLD_CFG.avoid}.`,
      300,
    );
    return {
      ...item,
      slug,
      index,
      worldId: WORLD_CFG.id,
      ww: WW,
      worldName: WORLD_CFG.name,
      worldStyle: WORLD_CFG.style,
      worldAvoid: WORLD_CFG.avoid,
      templateId: uuidFor('template', index),
      versionId: uuidFor('version', index),
      pronouns: pronouns(gender),
      species: 'human',
      voiceKey,
      xaiVoiceId: xaiVoice(gender, offset),
      biography,
      portraitSlotKey: `${WORLD}-character-${slug}`,
      portraitAssetKey: slug,
      homeName,
      homeDescription,
      homePrompt,
      featured: offset === 0,
    };
  });
}

export async function validate(characters) {
  const errors = [];
  const locations = JSON.parse(await readFile(resolve(root, 'scripts/_existing_location_slugs.json'), 'utf8'));
  const existingSlugs = new Set(JSON.parse(await readFile(resolve(root, 'scripts/_existing_character_slugs.json'), 'utf8')));
  const assetsText = await readFile(resolve(root, 'apps/together/src/assets.ts'), 'utf8');
  for (const match of assetsText.matchAll(/'([a-z0-9-]+)':catalogArtwork\('characters\//g)) existingSlugs.add(match[1]);
  for (const extra of [...KNOWN_EXTRA_ANCHORS, ...GILDED_EXISTING]) existingSlugs.add(extra);
  const newSlugs = new Set();
  for (const item of characters) {
    if (existingSlugs.has(item.slug)) errors.push(`slug collision with live catalog: ${item.slug}`);
    if (newSlugs.has(item.slug)) errors.push(`duplicate new slug: ${item.slug}`);
    newSlugs.add(item.slug);
    if (item.age < 23) errors.push(`${item.slug} age ${item.age} < 23`);
    if (!['woman', 'man'].includes(item.gender)) errors.push(`${item.slug} gender ${item.gender}`);
    if (item.home !== LODGING) errors.push(`${item.slug} home ${item.home} is not ${LODGING}`);
    const worldLocs = new Set(locations[item.world] || []);
    for (const field of ['district', 'work', 'leisure', 'social', 'home']) {
      if (!worldLocs.has(item[field])) errors.push(`${item.slug} missing ${field} location ${item[field]} in ${item.world}`);
    }
    if (!item.anchors?.length) errors.push(`${item.slug} has no anchors`);
    for (const anchor of item.anchors || []) {
      if (!existingSlugs.has(anchor) && !newSlugs.has(anchor)) errors.push(`${item.slug} unknown anchor ${anchor}`);
    }
    for (const field of ['occupation', 'appearance', 'opener', 'truth', 'anatomy', 'hidden', 'hook', 'desire', 'tone', 'quirk', 'romance']) {
      if (!item[field] || String(item[field]).length < 8) errors.push(`${item.slug} weak ${field}`);
    }
  }
  const women = characters.filter((item) => item.gender === 'woman').length;
  const men = characters.filter((item) => item.gender === 'man').length;
  if (characters.length !== 20) errors.push(`total ${characters.length}, expected 20`);
  if (women !== 13 || men !== 7) errors.push(`gender mix ${women}W/${men}M, expected 13W/7M`);
  if (characters[0]?.gender !== 'woman') errors.push('featured first companion must be a woman');
  return { errors, newSlugs: [...newSlugs] };
}

function buildEdges(characters) {
  const edges = [];
  for (let i = 0; i < characters.length; i += 2) {
    const a = characters[i];
    const b = characters[i + 1];
    if (!b) continue;
    const history = `${a.name} and ${b.name} keep overlapping nights in ${WORLD_CFG.name} and neither pretends the work is the whole of them.`;
    edges.push({ worldId: a.worldId, source: a.slug, target: b.slug, type: 'work ally', affinity: 76, trust: 70, history });
    edges.push({ worldId: a.worldId, source: b.slug, target: a.slug, type: 'work ally', affinity: 74, trust: 68, history: `${b.name} trusts ${a.name} more than the house.` });
  }
  for (const item of characters) {
    for (const anchor of item.anchors) {
      edges.push({
        worldId: item.worldId,
        source: item.slug,
        target: anchor,
        type: 'trusted contact',
        affinity: 62,
        trust: 58,
        history: `${item.name} uses ${anchor.replaceAll('-', ' ')} as a living contact, not a rumor.`,
      });
    }
  }
  return edges;
}

function payloadFor(item) {
  return {
    templateId: item.templateId,
    versionId: item.versionId,
    worldId: item.worldId,
    world: item.world,
    worldName: item.worldName,
    name: item.name,
    slug: item.slug,
    age: item.age,
    gender: item.gender,
    pronouns: item.pronouns,
    background: item.background,
    species: item.species,
    district: item.district,
    work: item.work,
    leisure: item.leisure,
    social: item.social,
    home: item.home,
    occupation: item.occupation,
    pattern: item.pattern,
    traits: item.traits,
    interests: item.interests,
    tone: item.tone,
    quirk: item.quirk,
    romance: item.romance,
    hook: item.hook,
    desire: item.desire,
    appearance: item.appearance,
    opener: item.opener,
    truth: item.truth,
    anatomy: item.anatomy,
    hidden: item.hidden,
    biography: item.biography,
    voiceKey: item.voiceKey,
    xaiVoiceId: item.xaiVoiceId,
    portraitSlotKey: item.portraitSlotKey,
    portraitAssetKey: item.portraitAssetKey,
    featured: item.featured,
    homeName: item.homeName,
    homeDescription: item.homeDescription,
    homePrompt: item.homePrompt,
    worldStyle: item.worldStyle,
    worldAvoid: item.worldAvoid,
    anchors: item.anchors,
  };
}

export function buildSql(characters) {
  const payload = characters.map(payloadFor);
  const edges = buildEdges(characters);
  const json = JSON.stringify(payload);
  const edgeJson = JSON.stringify(edges);
  return `-- Gilded Coast adult cast: 20 highly adult residents.
begin;

alter table public.together_character_templates drop constraint if exists together_character_templates_name_key;

create temporary table ace_cast(data jsonb) on commit drop;
insert into ace_cast values($kivelle_gilded_coast_ace_v1$${json}$kivelle_gilded_coast_ace_v1$::jsonb);

insert into public.together_character_templates(
  id,name,slug,public_handle,age,occupation,biography,creator_id,current_published_version,published,
  lifecycle_status,visibility,relationship_goal,connection_config,spice_level,character_role,
  can_be_selected,can_be_romanced,discovery_metadata,first_meeting,updated_at
)
select
  (item->>'templateId')::uuid,item->>'name',item->>'slug',item->>'slug',(item->>'age')::int,
  item->>'occupation',item->>'biography',null,1,true,'published','public','either',
  jsonb_build_object('goal','either','spiceLevel',3,'romanticEnergy',item->>'romance','pace','confident','initialStage','stranger','romanticPace',0.86,'affection',0.74,'initiative',0.9),
  3,'primary_companion',true,true,
  jsonb_build_object(
    'summary',item->>'biography','traits',item->'traits','goals',jsonb_build_array('Dating','Friendship','Stories'),
    'featured',(item->>'featured')::boolean,'new',true,'gender',item->>'gender','pronouns',item->>'pronouns',
    'background',item->>'background','species',item->>'species','fictional',true,
    'residentWorldSlug',item->>'world','districtSlug',item->>'district','primaryLocationSlug',item->>'work',
    'portraitStatus','ready','portraitSlotKey',item->>'portraitSlotKey','portraitAssetKey',item->>'portraitAssetKey',
    'portraitSource','authored_packaged_asset','portraitFocalPosition','top','storyHook',item->>'hook',
    'romancePreferences',jsonb_build_object('available',true,'playerInclusive',true,'style',item->>'romance'),
    'initialRelationshipState','stranger','ageAware',true,'source','${SOURCE}'
  ),
  jsonb_build_object(
    'worldId',item->>'worldId','world_id',item->>'worldId','locationSlug',item->>'work','location_id',meeting.id,
    'title','Meet '||(item->>'name'),
    'setup',(item->>'name')||' is at work when the player first encounters them.',
    'companionActivity','working','mood','charged',
    'openingLine',item->>'opener','opening_line',item->>'opener',
    'suggestedPrompts',jsonb_build_array('What does this work actually cost you?','Are you working or choosing?','What would a night off look like?')
  ),
  now()
from ace_cast cross join lateral jsonb_array_elements(data) item
join public.together_locations meeting on meeting.world_id=(item->>'worldId')::uuid and meeting.slug=item->>'work'
on conflict(id) do update set
  name=excluded.name,slug=excluded.slug,public_handle=excluded.public_handle,age=excluded.age,
  occupation=excluded.occupation,biography=excluded.biography,published=true,lifecycle_status='published',
  visibility='public',relationship_goal=excluded.relationship_goal,connection_config=excluded.connection_config,
  spice_level=excluded.spice_level,can_be_selected=true,can_be_romanced=true,
  discovery_metadata=excluded.discovery_metadata,first_meeting=excluded.first_meeting,updated_at=now();

insert into public.together_character_versions(
  id,character_template_id,version,pronouns,personality_config,values_config,interests,communication_style,
  appearance_config,visual_identity,voice_config,boundaries,default_social_graph,portrait_asset_key,
  relationship_config,life_config,character_bible,appearance_candidates,content_boundaries,published_at,updated_at
)
select
  (item->>'versionId')::uuid,(item->>'templateId')::uuid,1,item->>'pronouns',
  jsonb_build_object(
    'warmth',case when item->'traits'?|array['tender','funny','generous','affectionate','protective'] then 0.84 else 0.62 end,
    'humor',case when item->'traits'?|array['funny','witty','playful','shameless'] then 0.86 else 0.58 end,
    'directness',0.88,'independence',0.9,'spontaneity',0.82,
    'socialEnergy',case when item->'traits'?|array['quiet','solemn','lonely','private'] then 0.44 else 0.78 end,
    'creativity',0.72,'curiosity',0.76
  ),
  '{"autonomy":0.98,"mutualRespect":0.98,"honesty":0.9,"privacy":0.92,"ordinaryLife":0.8}'::jsonb,
  array(select jsonb_array_elements_text(item->'interests')),
  jsonb_build_object(
    'length','short_to_medium','emojiFrequency','none','directness',0.88,'teasing',true,'callbackFrequency','natural',
    'genericQuestions','avoid','followupQuestions','specific_and_earned','signature',item->>'tone','quirks',item->>'quirk'
  ),
  jsonb_build_object('photoStatus','ready','portraitStatus','ready','asset',item->>'portraitAssetKey','canonicalDescription',item->>'appearance','gender',item->>'gender','age',(item->>'age')::int),
  jsonb_build_object(
    'canonicalDescription',item->>'appearance','referenceStoragePaths','[]'::jsonb,
    'visualDoNotChange',jsonb_build_array('fictional adult age '||(item->>'age'),'gender presentation: '||(item->>'gender'),item->>'background','recognizable face, hair, complexion, build, and proportions'),
    'identityVersion',1,'fictional',true,'status','packaged_ready','portraitSlotKey',item->>'portraitSlotKey','gender',item->>'gender',
    'portraitPrompt','Single textless 3:4 photorealistic portrait of '||(item->>'name')||', a fictional adult age '||(item->>'age')||'. '||(item->>'appearance')||'. '||(item->>'worldStyle')||'. No readable text, no logos, no real-person likeness. Avoid '||(item->>'worldAvoid')||'.'
  ),
  jsonb_build_object('voiceKey',item->>'voiceKey','delivery',item->>'tone','providerMappings',jsonb_build_object('xai',item->>'xaiVoiceId')),
  array[
    'Occupation, rank, pay, and membership purchase no private night.',
    'Exhibition and edge play are chosen; they are never an obligation.',
    'fictional adult','independent point of view','respect user boundaries',
    'rank, work, debt, and payment never create consent'
  ],
  item->'anchors',
  item->>'portraitAssetKey',
  jsonb_build_object('goal','either','spiceLevel',3,'romanticEnergy',item->>'romance','pace','confident','initialStage','stranger','romanticPace',0.86,'affection',0.74,'initiative',0.9),
  jsonb_build_object(
    'version',2,'homeWorldId',(item->>'worldId')::uuid,'homeLocationId',district.id,'homeDistrictSlug',item->>'district',
    'occupation',jsonb_build_object('title',item->>'occupation','workPattern',item->>'pattern','primaryLocationSlug',item->>'work',
      'activityVariants',jsonb_build_array('Working the job','Preparing the room','Taking an off-clock hour')),
    'interests',item->'interests',
    'publicLocationSlugs',jsonb_build_array(item->>'work',item->>'leisure',item->>'social'),
    'workDays',jsonb_build_array(0,1,2,3,4,5,6),
    'scheduling',jsonb_build_object('userLocalClock',true,'generationVersion','${SOURCE}','scheduleProfile','adult_cast_weekly_v1','authoredCoverage','full_week')
  ),
  jsonb_build_object(
    'promptVersion',5,'depthVersion',5,'depthAuthored',true,'traits',item->'traits','background',item->>'background',
    'appearance',item->>'appearance','occupation',item->>'occupation','interests',item->'interests','quirks',item->>'quirk',
    'storyHook',item->>'hook','dialogueTone',item->>'tone','socialCircle',item->'anchors','romanceStyle',item->>'romance',
    'desire',item->>'desire','complication',item->>'hook','fictional',true,
    'identityFacts',jsonb_build_array('I am '||(item->>'age')||' years old.','My home world is '||(item->>'worldName')||'.','My work is '||(item->>'occupation')||'.'),
    'anecdotes',jsonb_build_array(
      jsonb_build_object('id',(item->>'slug')||':anecdote:work','title','The night the work became personal','summary',item->>'hook','topics',item->'interests','revealStages',jsonb_build_array('acquaintance','friend','flirting','dating'),'minimumTrust',12,'cooldownTurns',24),
      jsonb_build_object('id',(item->>'slug')||':anecdote:choice','title','The choice still unresolved','summary',item->>'desire','topics',jsonb_build_array('work','identity','desire'),'revealStages',jsonb_build_array('friend','flirting','dating'),'minimumTrust',28,'cooldownTurns',36)
    )
  ),
  '[]'::jsonb,
  jsonb_build_object('adult_only',true,'allows_romance',true,'allows_suggestive',true,'allows_mature',true,'allows_explicit',true),
  now(),now()
from ace_cast cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id=(item->>'worldId')::uuid and district.slug=item->>'district'
on conflict(id) do update set
  pronouns=excluded.pronouns,personality_config=excluded.personality_config,values_config=excluded.values_config,
  interests=excluded.interests,communication_style=excluded.communication_style,appearance_config=excluded.appearance_config,
  visual_identity=excluded.visual_identity,voice_config=excluded.voice_config,boundaries=excluded.boundaries,
  default_social_graph=excluded.default_social_graph,portrait_asset_key=excluded.portrait_asset_key,
  relationship_config=excluded.relationship_config,life_config=excluded.life_config,character_bible=excluded.character_bible,
  content_boundaries=excluded.content_boundaries,published_at=excluded.published_at,updated_at=now();

insert into public.together_character_private_profiles(character_version_id,private_truth,adult_continuity,intimate_anatomy,hidden_sexual,metadata)
select
  (item->>'versionId')::uuid,item->>'truth',
  'Hidden sexual life and intimate anatomy are private. Use them only in eligible adult intimacy; never as public biography, portrait direction, or a lecture.',
  item->>'anatomy',item->>'hidden',
  jsonb_build_object('source','${SOURCE}','characterSlug',item->>'slug','policy','server_only')
from ace_cast cross join lateral jsonb_array_elements(data) item
on conflict(character_version_id) do update set
  private_truth=excluded.private_truth,adult_continuity=excluded.adult_continuity,
  intimate_anatomy=excluded.intimate_anatomy,hidden_sexual=excluded.hidden_sexual,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_world_presence(character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata)
select
  (item->>'versionId')::uuid,(item->>'worldId')::uuid,'resident',district.id,1,1,
  jsonb_build_object('source','${SOURCE}','residentWorldSlug',item->>'world','homeDistrictSlug',item->>'district',
    'workLocationSlug',item->>'work','portraitStatus','ready','portraitSlotKey',item->>'portraitSlotKey','authored',true,'dynamicSchedule',true)
from ace_cast cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id=(item->>'worldId')::uuid and district.slug=item->>'district'
on conflict(character_version_id,world_id) do update set
  presence_type='resident',home_location_id=excluded.home_location_id,familiarity=1,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_voice_profiles(character_template_id,voice_key,characteristics,provider_mappings,metadata)
select
  (item->>'templateId')::uuid,item->>'voiceKey',
  jsonb_build_object('gender',item->>'gender','delivery',item->>'tone'),
  jsonb_build_object('xai',item->>'xaiVoiceId'),
  jsonb_build_object('source','${SOURCE}','authored',true)
from ace_cast cross join lateral jsonb_array_elements(data) item
on conflict(character_template_id) do update set
  voice_key=excluded.voice_key,characteristics=excluded.characteristics,provider_mappings=excluded.provider_mappings,
  metadata=excluded.metadata,active=true,updated_at=now();

insert into public.together_character_homes(
  character_version_id,world_id,district_anchor_location_id,name,residence_type,description,prompt_text,
  canonical_visual_context,canonical_lore,reference_policy,source,prompt_version,active
)
select
  (item->>'versionId')::uuid,(item->>'worldId')::uuid,district.id,item->>'homeName','private residence',
  item->>'homeDescription',item->>'homePrompt',
  jsonb_build_object('canonicalPrompt',item->>'homePrompt','indoorOutdoor','indoor','visualAnchors',jsonb_build_array(item->>'district',item->>'occupation'),'avoid',jsonb_build_array('modern luxury staging','readable text','implied public access')),
  jsonb_build_object('version',2,'authored',true,'summary',item->>'homeDescription','stableFacts',jsonb_build_array('This is a private residence.','Entry requires an authored invitation or canonical shared scene.'),
    'localEtiquette',jsonb_build_array('Familiarity alone never grants entry.','Remote conversation never implies co-presence.')),
  'text_only','authored',1,true
from ace_cast cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id=(item->>'worldId')::uuid and district.slug=item->>'district'
on conflict(character_version_id) do update set
  world_id=excluded.world_id,district_anchor_location_id=excluded.district_anchor_location_id,name=excluded.name,
  description=excluded.description,prompt_text=excluded.prompt_text,canonical_visual_context=excluded.canonical_visual_context,
  canonical_lore=excluded.canonical_lore,active=true,updated_at=now();

insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  energy_delta,mood_influence,variation_weight,metadata
)
select
  (item->>'versionId')::uuid,d.day,block.start_minute,block.end_minute,location.id,block.activity,block.availability,
  block.energy_delta,block.mood,1,
  jsonb_build_object('source','${SOURCE}','scheduleMode','authored','weekIndex',0,'userLocalClock',true,'activityVariants',block.variants,'displayLocation',location.name)
from ace_cast
cross join lateral jsonb_array_elements(data) item
cross join generate_series(0,6) as d(day)
cross join lateral (
  select * from (
    values
      (0, case when item->>'pattern'='night' then 540 else 480 end, item->>'home',
        case when item->>'pattern'='night' then 'Sleeping in after the late set' else 'Sleeping before the day shift' end,
        'busy',2,'tired',jsonb_build_array('Sleeping in','Recovering from the last shift')),
      (case when item->>'pattern'='night' then 540 else 480 end,
       case when item->>'pattern'='night' then 780 else 540 end,
       case when item->>'pattern'='night' then item->>'leisure' else item->>'home' end,
       case when item->>'pattern'='night' then 'Taking unhurried personal time' else 'Getting ready for the day' end,
       'available',1,'easy',jsonb_build_array('Taking unhurried personal time','Getting ready')),
      (case when item->>'pattern'='night' then 780 else 540 end,
       case when item->>'pattern'='night' then 960 else 1020 end,
       case when item->>'pattern'='night' then item->>'social' else item->>'work' end,
       case when item->>'pattern'='night' then 'Between shifts with people they actually keep' else 'Working the job' end,
       case when item->>'pattern'='night' then 'available' else 'busy' end,
       case when item->>'pattern'='night' then 0 else -2 end,
       case when item->>'pattern'='night' then 'curious' else 'charged' end,
       jsonb_build_array('Between shifts','Working the job')),
      (case when item->>'pattern'='night' then 960 else 1020 end,
       case when item->>'pattern'='night' then 1080 else 1140 end,
       case when item->>'pattern'='night' then item->>'work' else item->>'leisure' end,
       case when item->>'pattern'='night' then 'Getting ready before the floor opens' else 'Taking unhurried personal time' end,
       case when item->>'pattern'='night' then 'limited' else 'available' end,
       case when item->>'pattern'='night' then -1 else 1 end,
       case when item->>'pattern'='night' then 'focused' else 'easy' end,
       jsonb_build_array('Getting ready','Taking unhurried personal time')),
      (case when item->>'pattern'='night' then 1080 else 1140 end,
       case when item->>'pattern'='night' then 1380 else 1320 end,
       case when item->>'pattern'='night' then item->>'work' else item->>'social' end,
       case when item->>'pattern'='night' then 'Working the job' else 'Keeping company off the clock' end,
       case when item->>'pattern'='night' then 'busy' else 'available' end,
       case when item->>'pattern'='night' then -2 else 0 end,
       case when item->>'pattern'='night' then 'charged' else 'curious' end,
       jsonb_build_array('Working the job','Keeping company')),
      (case when item->>'pattern'='night' then 1380 else 1320 end, 1440,
       case when item->>'pattern'='night' then item->>'work' else item->>'home' end,
       case when item->>'pattern'='night' then 'Closing out the night' else 'Coming home' end,
       'limited',-1,'spent',jsonb_build_array('Closing out the night','Coming home'))
  ) as block(start_minute,end_minute,location_slug,activity,availability,energy_delta,mood,variants)
) block
join public.together_locations location on location.world_id=(item->>'worldId')::uuid and location.slug=block.location_slug
on conflict(character_version_id,day_of_week,start_minute,week_index) do update set
  end_minute=excluded.end_minute,location_id=excluded.location_id,activity=excluded.activity,
  availability=excluded.availability,energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,
  metadata=excluded.metadata;

insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,
  location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,
  energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select
  (item->>'versionId')::uuid,act.activity_key,act.title,act.category,
  jsonb_build_array(jsonb_build_object('startMinute',act.start_minute,'endMinute',act.end_minute)),
  int4range(90,181,'[]'),array[]::text[],array[act.location_slug],array[item->>'world','adult-cast'],
  .86,int4range(1,3,'[]'),4,12,null,'either','preferred_activity','hint','open',
  jsonb_build_object('source','${SOURCE}','authored',true)
from ace_cast cross join lateral jsonb_array_elements(data) item
cross join lateral (
  select * from (values
    ('signature_work','Working the job','work',item->>'work',1080,1380),
    ('off_clock','An off-clock hour','personal',item->>'leisure',540,780),
    ('kept_company','Company they actually keep','social',item->>'social',780,960)
  ) as act(activity_key,title,category,location_slug,start_minute,end_minute)
) act
on conflict(character_version_id,activity_key) do update set title=excluded.title,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_place_profiles(
  character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,
  opinion_tags,preferred_activities,favorite_details,disliked_details,metadata
)
select distinct on ((item->>'versionId'), location.id)
  (item->>'versionId')::uuid,location.id,place.familiarity,place.sentiment,.84,place.summary,
  array[item->>'world',place.tag],array[place.activity],array[place.detail],array[]::text[],
  jsonb_build_object('source','${SOURCE}','authored',true)
from ace_cast cross join lateral jsonb_array_elements(data) item
cross join lateral (
  select * from (values
    (item->>'work',.96,.22,'work',(item->>'name')||' knows this floor as work, not scenery.','working the job','the room at its real late rhythm'),
    (item->>'district',.82,.18,'home','Home district, not a postcard.','walking home','the ordinary street after last call'),
    (item->>'leisure',.74,.16,'routine','A place used when the clock is off.','unhurried personal time','the room without an audience'),
    (item->>'social',.7,.14,'routine','People they actually keep.','kept company','ordinary tables'),
    (item->>'home',.88,.12,'home','Where they actually sleep.','sleeping in','a bed the job does not enter')
  ) as place(slug,familiarity,sentiment,tag,summary,activity,detail)
) place
join public.together_locations location on location.world_id=(item->>'worldId')::uuid and location.slug=place.slug
order by (item->>'versionId'), location.id, place.familiarity desc
on conflict(character_version_id,location_id) do update set
  familiarity=excluded.familiarity,opinion_summary=excluded.opinion_summary,metadata=excluded.metadata,updated_at=now();

insert into public.together_dialogue_opportunities(
  world_id,slug,topic,angle,framing,location_id,district_location_id,topic_tags,trigger_terms,character_tags,
  min_relationship_stage,content_level,min_spice_level,dayparts,interaction_modes,weight,cooldown_turns,active,metadata
)
select
  (item->>'worldId')::uuid,opp.slug,opp.topic,opp.angle,item->>'tone',
  location.id,location.parent_location_id,opp.topic_tags,opp.trigger_terms,array[item->>'slug'],
  opp.min_stage,opp.content_level,opp.min_spice,array['evening','late_night'],
  array['chat','group_chat','place'],1.2,32,true,
  jsonb_build_object('source','${SOURCE}','characterSlugs',jsonb_build_array(item->>'slug'),'closedWorld',true)
from ace_cast cross join lateral jsonb_array_elements(data) item
cross join lateral (
  select * from (values
    ((item->>'slug')||'-desire', item->>'desire', 'Let '||(item->>'name')||' discuss the ambition through current work without asking the player to solve it.', 'standard', null::int, 'acquaintance', array['desire',item->>'slug'], array['work','night','want']),
    ((item->>'slug')||'-contradiction', item->>'hook', 'Let '||(item->>'name')||' show the contradiction in character.', 'standard', null::int, 'friend', array['contradiction',item->>'slug'], array['house','job','night']),
    ((item->>'slug')||'-romance', item->>'romance', 'Let '||(item->>'name')||' express desire in their own voice when the player has earned the intimacy.', 'mature', 3, 'flirting', array['romance',item->>'slug','adult'], array['after hours','private room','come upstairs'])
  ) as opp(slug,topic,angle,content_level,min_spice,min_stage,topic_tags,trigger_terms)
) opp
join public.together_locations location on location.world_id=(item->>'worldId')::uuid and location.slug=item->>'work'
on conflict(world_id,slug) do update set topic=excluded.topic,angle=excluded.angle,framing=excluded.framing,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table ace_edges(data jsonb) on commit drop;
insert into ace_edges values($kivelle_gilded_coast_ace_edges$${edgeJson}$kivelle_gilded_coast_ace_edges$::jsonb);

insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select
  (edge->>'worldId')::uuid,source.id,target.id,edge->>'type',(edge->>'affinity')::int,(edge->>'trust')::int,edge->>'history',
  jsonb_build_object('source','${SOURCE}','authored',true,'knowledgeScope','direct')
from ace_edges cross join lateral jsonb_array_elements(data) edge
join public.together_character_templates source on source.slug=edge->>'source'
join public.together_character_templates target on target.slug=edge->>'target'
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,history=excluded.history,metadata=excluded.metadata,updated_at=now();

update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
  'residentCompanionCount', coalesce((metadata->>'residentCompanionCount')::int,0)+20,
  'mappedResidentPortraitCount', case when metadata ? 'mappedResidentPortraitCount' then to_jsonb(coalesce((metadata->>'mappedResidentPortraitCount')::int,0)+20) else null end,
  'portraitSlotCount', case when metadata ? 'portraitSlotCount' then to_jsonb(coalesce((metadata->>'portraitSlotCount')::int,0)+20) else null end,
  'weeklyScheduleRowCount', case when metadata ? 'weeklyScheduleRowCount' then to_jsonb(coalesce((metadata->>'weeklyScheduleRowCount')::int,0)+840) else null end,
  'residentGenderRatio', case when metadata ? 'residentGenderRatio' then
    (metadata->'residentGenderRatio') || jsonb_build_object(
      'women', coalesce((metadata->'residentGenderRatio'->>'women')::int,0)+13,
      'men', coalesce((metadata->'residentGenderRatio'->>'men')::int,0)+7
    ) else null end,
  'residentRosterStatus','ready',
  'gildedCoastAdultCast', '${SOURCE}'
)),
    updated_at=now()
where slug='gilded-coast'
  and coalesce(metadata->>'gildedCoastAdultCast','') is distinct from '${SOURCE}';

do $$
declare template_count int; version_count int; private_count int; schedule_count int; underage int; missing_loc int; lodging int;
begin
  select count(*) into template_count from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%';
  select count(*) into version_count from public.together_character_versions where id::text like '23000000-0000-4000-80a1-00000009%';
  select count(*) into private_count from public.together_character_private_profiles where character_version_id::text like '23000000-0000-4000-80a1-00000009%';
  select count(*) into schedule_count from public.together_schedule_templates where character_version_id::text like '23000000-0000-4000-80a1-00000009%';
  select count(*) into underage from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%' and age<23;
  select count(*) into missing_loc from ace_cast cross join lateral jsonb_array_elements(data) item
    where not exists (select 1 from public.together_locations where world_id=(item->>'worldId')::uuid and slug=item->>'work');
  select count(*) into lodging from ace_cast cross join lateral jsonb_array_elements(data) item
    where item->>'home' is distinct from 'blue-lantern-inn';
  if template_count<>20 or version_count<>20 or private_count<>20 or schedule_count<>840 or underage<>0 or missing_loc<>0 or lodging<>0 then
    raise exception 'Gilded Coast adult cast failed: templates %, versions %, private %, schedules %, underage %, missing_loc %, lodging %',
      template_count, version_count, private_count, schedule_count, underage, missing_loc, lodging;
  end if;
end $$;

commit;
`;
}

function buildTestSql() {
  return `begin;
select plan(9);

select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast templates exist');
select is((select count(*) from public.together_character_versions where id::text like '23000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast versions exist');
select is((select count(*) from public.together_character_private_profiles where character_version_id::text like '23000000-0000-4000-80a1-00000009%'), 20::bigint,
  '20 Gilded Coast adult-cast private profiles exist');
select is((select count(*) from public.together_schedule_templates where character_version_id::text like '23000000-0000-4000-80a1-00000009%'), 840::bigint,
  '20 Gilded Coast companions have full-week authored schedules');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%' and age<23), 0::bigint,
  'no Gilded Coast adult-cast companion is under 23');
select is((select count(*) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%' and spice_level=3), 20::bigint,
  'every Gilded Coast adult-cast companion is spice 3');
select ok(not exists(
  select 1 from public.together_character_private_profiles
  where character_version_id::text like '23000000-0000-4000-80a1-00000009%'
    and (length(coalesce(hidden_sexual,''))<40 or length(coalesce(intimate_anatomy,''))<40)
), 'every Gilded Coast adult-cast private profile has authored intimacy');
select is((select count(distinct slug) from public.together_character_templates where id::text like '22000000-0000-4000-80a1-00000009%'), 20::bigint,
  'Gilded Coast adult-cast slugs are unique');
select is((
  select count(*) from public.together_schedule_templates s
  join public.together_locations l on l.id=s.location_id
  where s.character_version_id::text like '23000000-0000-4000-80a1-00000009%'
    and s.start_minute=0 and l.slug<>'blue-lantern-inn'
), 0::bigint, 'Gilded Coast adult-cast sleep blocks use photographed lodging');

select * from finish();
rollback;
`;
}

function portraitPrompt(item) {
  return `Single textless 3:4 photorealistic portrait of ${item.name}, a fictional adult age ${item.age}. ${item.appearance} Place them in or near ${titleCaseSlug(item.work)} in ${item.worldName}. ${item.worldStyle}. Natural skin texture, consistent adult face and proportions, sensual lived-in workwear, no nudes, no readable text, no logos, no real-person likeness. Avoid ${item.worldAvoid}.`;
}

async function patchAssets(characters) {
  const assetsPath = resolve(root, 'apps/together/src/assets.ts');
  let text = await readFile(assetsPath, 'utf8');
  const ready = [];
  for (const item of characters) {
    try {
      await stat(resolve(root, `apps/together/assets/characters/${item.world}/${item.slug}.jpg`));
      ready.push(item);
    } catch {
      // Portraits are generated after SQL/client wiring; skip missing files.
    }
  }
  if (!ready.length) {
    console.log(JSON.stringify({ skippedAssets: true, reason: 'portraits missing' }));
    return;
  }
  const lines = ready
    .filter((item) => !text.includes(`'${item.slug}':catalogArtwork`))
    .map((item) => `  '${item.slug}':catalogArtwork('characters/${item.world}/${item.slug}.jpg'),`);
  if (!lines.length) return;
  const anchor = "  'sabine-roche':catalogArtwork('characters/calders-run/sabine-roche.jpg'),";
  if (!text.includes(anchor)) {
    throw new Error('assets.ts anchor sabine-roche is missing');
  }
  text = text.replace(anchor, `${anchor}\n${lines.join('\n')}`);
  await writeFile(assetsPath, text);
}

async function patchLegacyTest() {
  const path = resolve(root, 'supabase/tests/162_kivelle_adult_cast_expansion.sql');
  let text = await readFile(path, 'utf8');
  const from = "where id::text like '22000000-0000-4000-80a1-%'";
  const to = "where id::text like '22000000-0000-4000-80a1-00000000%'";
  if (text.includes(from) && !text.includes(to)) text = text.replaceAll(from, to);
  const fromV = "where id::text like '23000000-0000-4000-80a1-%'";
  const toV = "where id::text like '23000000-0000-4000-80a1-00000000%'";
  if (text.includes(fromV) && !text.includes(toV)) text = text.replaceAll(fromV, toV);
  const fromP = 'where character_version_id::text like \'23000000-0000-4000-80a1-%\'';
  const toP = 'where character_version_id::text like \'23000000-0000-4000-80a1-00000000%\'';
  if (text.includes(fromP) && !text.includes(toP)) text = text.replaceAll(fromP, toP);
  await writeFile(path, text);
}

async function main() {
  const characters = loadCast();
  const { errors } = await validate(characters);
  if (errors.length) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  const mode = process.argv[2] || 'all';
  if (mode === 'validate') {
    console.log(JSON.stringify({
      ok: true,
      count: characters.length,
      featured: characters[0].slug,
      lodging: LODGING,
      slugs: characters.map((item) => item.slug),
    }, null, 2));
    return;
  }
  const sql = buildSql(characters);
  const migrationPath = resolve(root, 'supabase/migrations/202610022200_kivelle_gilded_coast_adult_cast.sql');
  await writeFile(migrationPath, sql);
  await writeFile(resolve(root, 'supabase/tests/163_kivelle_gilded_coast_adult_cast.sql'), buildTestSql());
  const portraitPlan = characters.map((item) => ({
    world: item.world,
    slug: item.slug,
    dest: `apps/together/assets/characters/${item.world}/${item.slug}.jpg`,
    prompt: portraitPrompt(item),
    aspect: '2:3',
  }));
  await writeFile(resolve(root, 'scripts/gilded-coast-adult-cast-portraits.json'), JSON.stringify(portraitPlan, null, 2) + '\n');
  if (mode === 'sql') {
    console.log(JSON.stringify({ ok: true, migrationPath, characters: characters.length }));
    return;
  }
  await mkdir(resolve(root, 'apps/together/assets/characters/gilded-coast'), { recursive: true });
  await patchAssets(characters);
  await patchLegacyTest();
  console.log(JSON.stringify({ ok: true, characters: characters.length, migrationPath, portraits: portraitPlan.length, lodging: LODGING }));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
