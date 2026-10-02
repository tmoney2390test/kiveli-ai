import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gildedPack, validateGildedPack } from '../content/gilded-coast/pack.mjs';

const root=resolve(import.meta.dirname,'..');
const sourceMigration=resolve(root,'supabase/migrations/202609040009_kivelle_vharadren_world_v1.sql');
const destinationMigration=resolve(root,'supabase/migrations/20261002193000_gilded_coast_world_v1.sql');
const worldModulePath=resolve(root,'apps/together/src/worlds/gilded-coast.ts');
const characterAssetsPath=resolve(root,'apps/together/src/character-assets/gilded-coast.ts');
const locationAssetsPath=resolve(root,'apps/together/src/location-assets/gilded-coast.ts');
const pulseReferencePath=resolve(root,'content/world-pulse/reference/gilded-coast.json');
const authoredLocationArt=new Set((await readdir(resolve(root,'apps/together/assets/locations/gilded-coast'))).filter((name)=>name.endsWith('.jpg')).map((name)=>name.slice(0,-4)));
const source=await readFile(sourceMigration,'utf8');
const audit=validateGildedPack();
if(!audit.ok)throw new Error(`Gilded Coast source invalid: ${audit.errors.join('; ')}`);
const json=JSON.stringify(gildedPack);
if(json.includes('$gilded_coast_pack$'))throw new Error('Unsafe SQL delimiter in Gilded Coast pack.');
const worldId=gildedPack.world.id;
const arrival=gildedPack.locations.find((place)=>place.slug==='arrival-steps');
const women=gildedPack.characters.filter((person)=>person.gender==='woman').length;
const men=gildedPack.characters.filter((person)=>person.gender==='man').length;
const nonbinary=gildedPack.characters.filter((person)=>person.gender==='nonbinary').length;
const metadata={
  releaseWave:13,releaseStatus:'staged',contentStatus:'gilded_coast_v1',source:'gilded_coast_pack_v1',
  sourceSchemaVersion:gildedPack.schemaVersion,locationCatalogStatus:'authored',residentRosterStatus:'authored',
  residentScheduleStatus:'authored_weekly_v1',socialGraphStatus:'authored_v1',photoStatus:'portraits_ready',
  locationPhotoStatus:'local_authored_with_district_fallbacks',mappedLocationPhotoCount:audit.counts.locations,distinctLocationPhotoCount:authoredLocationArt.size,locationImageSlotCount:audit.counts.locations,
  residentPortraitStatus:'authored',mappedResidentPortraitCount:audit.counts.residents,portraitSlotCount:audit.counts.residents,
  locationCount:audit.counts.locations,districtCount:gildedPack.districts.length,
  publicPlaceCount:audit.counts.locations-gildedPack.districts.length,residentCompanionCount:audit.counts.residents,
  residentGenderRatio:{women,men,nonbinary},weeklyScheduleRowCount:audit.counts.schedules,
  directedSocialConnectionCount:audit.counts.relationships,recurringEventCount:audit.counts.recurring,
  storyArcCount:audit.counts.stories,worldFactCount:gildedPack.worldFacts.length,
  dialogueOpportunityCount:gildedPack.dialogueOpportunities.length,interactionBeatCount:gildedPack.interactionBeats.length,
  experienceCount:gildedPack.experiences.length,genreTags:gildedPack.world.genreTags,
  tagline:gildedPack.world.tagline,title:gildedPack.world.title,relationshipFantasy:gildedPack.world.relationshipFantasy,
  centralQuestion:gildedPack.world.centralQuestion,scheduleClock:'user_local',canonRegistry:'server_owned',privateCanonStatus:'service_role_only',
};
let migration=source;
const embedded=/\$vharadren_pack\$[\s\S]*?\$vharadren_pack\$/;
if(!embedded.test(migration))throw new Error('Vharadren source migration no longer has the expected embedded pack.');
migration=migration.replace(embedded,`$gilded_coast_pack$${json}$gilded_coast_pack$`);
const oldMetadata=/'\{"releaseWave":.+?\}'::jsonb/;
if(!oldMetadata.test(migration))throw new Error('Vharadren source migration metadata changed.');
migration=migration.replace(oldMetadata,`'${JSON.stringify(metadata).replaceAll("'","''")}'::jsonb`);
migration=migration.replaceAll('vharadren_pack','gilded_coast_pack')
  .replaceAll('vharadren','gilded-coast').replaceAll('Vharadren','Gilded Coast')
  .replaceAll('10000000-0000-4000-8000-000000000013',worldId)
  .replaceAll('2d000000-0000-4000-8000-000000000009',arrival.id)
  .replaceAll('8013-','8014-')
  .replaceAll('cinematic painterly realism, weathered late-medieval materials, Gilded Coast visual continuity','cinematic naturalistic realism, salt-worn age-of-sail materials, Gilded Coast visual continuity')
  .replaceAll('weathered late-medieval materials','salt-worn age-of-sail materials')
  .replaceAll('cinematic painterly realism','cinematic naturalistic realism')
  .replaceAll('generic clean castle room','generic empty room')
  .replaceAll('grounded adult high fantasy','grounded fictional age-of-sail setting')
  .replaceAll('My home world is Gilded Coast.','My home world is The Gilded Coast.')
  .replaceAll('tarnished gold","deep crimson","storm blue','sunlit gold","deep indigo","sea turquoise')
  .replaceAll("'caste',item->>'caste'","'district',item->>'districtSlug'")
  .replaceAll("'My caste is '||(item->>'caste')||'.'","'My home district is '||(item->>'districtSlug')||'.'")
  .replaceAll("resident''s established caste, occupation","resident''s established district, occupation")
  .replaceAll("item->>'occupation',item->>'caste'","item->>'occupation',item->>'districtSlug'")
  .replace(/jsonb_build_object\('history',data->'history','castes',[\s\S]*?'idiomGuide',data->'idiomGuide'\)/,
    "jsonb_build_object('history',data->'history','districts',data->'districts','factions',data->'factions','experiences',data->'experiences','contentPolicy',data->'contentPolicy')");

// The world is seeded as a hidden canonical record. Publication is a separate
// deliberate migration after every portrait/reference and event catalog passes.
migration=migration.replace(/,true,'subscription','worlds\.standard','UTC',120,true,/,",false,'subscription','worlds.standard','UTC',130,true,")
  .replace('metadata=excluded.metadata,published=true,','metadata=excluded.metadata,published=false,');

// Production derives week_index from metadata and indexes it with the slot.
// The generated column must not appear in the INSERT column list.
migration=migration.replace(
  'on conflict(character_version_id,day_of_week,start_minute) do update',
  'on conflict(character_version_id,day_of_week,start_minute,week_index) do update',
);
// A slot ending exactly at midnight must be stored as 1440, not modulo zero.
migration=migration.replace(
  "then 1440 else (item->>'endMinute')::int%1440 end,",
  "then 1440 else case when (item->>'endMinute')::int%1440=0 then 1440 else (item->>'endMinute')::int%1440 end end,",
);

const validateStart=migration.lastIndexOf('do $$');
const commitStart=migration.lastIndexOf('commit;');
if(validateStart<0||commitStart<validateStart)throw new Error('Could not isolate migration validation block.');
const validation=`do $$
declare loc_count int; resident_count int; schedule_count int; edge_count int; arc_count int; fact_count int;
begin
  select count(*) into loc_count from public.together_locations where world_id='${worldId}'::uuid;
  select count(*) into resident_count from public.together_character_world_presence where world_id='${worldId}'::uuid and presence_type='resident';
  select count(*) into schedule_count from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8014-%';
  select count(*) into edge_count from public.together_character_relationship_edges where world_id='${worldId}'::uuid;
  select count(*) into arc_count from public.together_story_arc_templates where specific_world_id='${worldId}'::uuid and active;
  select count(*) into fact_count from public.together_world_facts where world_id='${worldId}'::uuid and active;
  if loc_count<>${audit.counts.locations} or resident_count<>${audit.counts.residents} or schedule_count<>${audit.counts.schedules}
    or edge_count<>${audit.counts.relationships} or arc_count<>${audit.counts.stories} or fact_count<>${gildedPack.worldFacts.length} then
    raise exception 'Gilded Coast seed count mismatch: places %, residents %, schedules %, edges %, arcs %, facts %',loc_count,resident_count,schedule_count,edge_count,arc_count,fact_count;
  end if;
  if exists(select 1 from public.together_character_versions where id::text like '25000000-0000-4000-8014-%' and character_bible ?| array['privateTruth','adultContinuity','intimateAnatomy','hiddenSexual']) then
    raise exception 'Gilded Coast private character canon leaked into public bible';
  end if;
end $$;

`;
migration=migration.slice(0,validateStart)+validation+migration.slice(commitStart);
if(migration.includes('vharadren')||migration.includes('Vharadren')||migration.includes('8013-'))throw new Error('Gilded migration retains Vharadren-specific references.');

const publicLocations=gildedPack.locations.map((place)=>({id:place.id,world_id:place.worldId,parent_location_id:place.parentLocationId,name:place.name,slug:place.slug,location_type:place.locationType,description:place.description,category:place.category,...(place.hours?{hours:place.hours}:{}),possible_activities:place.activities,visual_asset_key:place.visualAssetKey,canonical_visual_context:place.canonicalVisualContext,canonical_lore:place.canonicalLore,sort_order:place.index*10,metadata:place.metadata}));
const world={id:worldId,slug:gildedPack.world.slug,name:gildedPack.world.name,description:gildedPack.world.description,hero_asset_key:'gilded-coast-hero',access_type:'subscription',entitlement_key:'worlds.standard',timezone:'UTC',sort_order:130,featured:true,published:false,visual_context:gildedPack.world.visualContext,default_arrival_location_id:arrival.id,metadata,world_role:'home',social_rhythm:'busy',dominant_dayparts:gildedPack.world.dominantDayparts,relationship_themes:gildedPack.world.relationshipThemes,activity_families:gildedPack.world.activityFamilies,mobility_style:gildedPack.world.mobilityStyle,weather_profile:gildedPack.world.weatherProfile};
const module=`import type { Location, World } from '../types';\n\nexport const GILDED_COAST_WORLD_ID='${worldId}';\nexport const GILDED_COAST_ARRIVAL_ID='${arrival.id}';\nexport const gildedCoastCharacterSlugs=${JSON.stringify(gildedPack.characters.map((person)=>person.slug))} as const;\nexport const gildedCoastAssetSlots=${JSON.stringify({hero:{key:'gilded-coast-hero',status:'local_authored'},locations:gildedPack.locations.map((place)=>({key:place.visualAssetKey,status:authoredLocationArt.has(place.slug)?'local_authored':'district_fallback'})),portraits:gildedPack.characters.map((person)=>({key:person.portraitAssetKey,status:'local_authored'}))})} as const;\nexport const gildedCoastWorld: World=${JSON.stringify(world)};\nexport const gildedCoastLocations: Location[]=${JSON.stringify(publicLocations)};\n`;
await writeFile(destinationMigration,migration,'utf8');
await writeFile(worldModulePath,module,'utf8');
await mkdir(resolve(root,'apps/together/src/character-assets'),{recursive:true});
await writeFile(characterAssetsPath,`import { catalogArtwork } from '../catalogArtwork';\nimport type { ImageSource } from 'expo-image';\n\nexport const gildedCoastCharacterAssets: Record<string, ImageSource> = {\n${gildedPack.characters.map((person)=>`  '${person.slug}': catalogArtwork('characters/gilded-coast/${person.slug}.jpg'),`).join('\n')}\n};\n`,'utf8');
await writeFile(locationAssetsPath,`import { catalogArtwork } from '../catalogArtwork';\nimport type { ImageSource } from 'expo-image';\n\nexport const gildedCoastLocationAssets: Record<string, ImageSource> = {\n${gildedPack.locations.map((place)=>{const artSlug=authoredLocationArt.has(place.slug)?place.slug:place.metadata.district;return `  '${place.slug}': catalogArtwork('locations/gilded-coast/${artSlug}.jpg'),`;}).join('\n')}\n};\n`,'utf8');
await writeFile(pulseReferencePath,JSON.stringify({source:'Staged canonical Gilded Coast content pack, 2026-10-02',world:{name:gildedPack.world.name,slug:gildedPack.world.slug,description:gildedPack.world.description},locations:gildedPack.locations.map((place)=>({name:place.name,slug:place.slug,category:place.category,description:place.description})),characters:gildedPack.characters.map((person)=>({name:person.name,slug:person.slug,age:person.age,occupation:person.occupation,biography:person.biography}))},null,2)+'\n','utf8');
console.log(JSON.stringify({destinationMigration,worldModulePath,characterAssetsPath,locationAssetsPath,pulseReferencePath,distinctLocationArt:authoredLocationArt.size,counts:audit.counts,arrival:arrival.id,women,men,nonbinary},null,2));
