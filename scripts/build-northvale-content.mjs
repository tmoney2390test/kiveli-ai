import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const packDirectory=resolve(process.argv[2]??'');
if(!process.argv[2])throw new Error('Usage: node scripts/build-northvale-content.mjs <NorthVale pack directory>');
const pack=JSON.parse(await readFile(resolve(packDirectory,'northvale_content_pack.json'),'utf8'));
const worldId='10000000-0000-4000-8000-000000000011';
const oldLocationPrefix='2a000000-0000-4000-8000-';
const locationPrefix='2b000000-0000-4000-8000-';
const remap=(value)=>JSON.parse(JSON.stringify(value).replaceAll(oldLocationPrefix,locationPrefix));
const world=remap(pack.world),locations=remap(pack.locations),characters=remap(pack.characters),schedules=remap(pack.weekly_schedules);
const supportedMobilityStyles=new Set(['walkable','transit','car','mixed']);
const mobilityStyle=supportedMobilityStyles.has(world.mobility_style)?world.mobility_style:'mixed';
const sqlJson=(value,tag)=>`$${tag}$${JSON.stringify(value)}$${tag}$::jsonb`;

const worldSql=`-- Generated from the authored NorthVale Kivelli content pack.
-- NorthVale uses a dedicated 2b location namespace because the proposed 2a
-- namespace is already canonical Juniper City data.
begin;

insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,access_type,entitlement_key,
  timezone,sort_order,featured,visual_context,world_role,social_rhythm,dominant_dayparts,
  relationship_themes,activity_families,mobility_style,weather_profile,default_arrival_location_id
) values(
  '${worldId}',${quote(world.name)},${quote(world.slug)},${quote(world.description)},'northvale-hero',
  '{"accent":["snow blue","pine green","firelight amber"]}'::jsonb,
  ${sqlJson({
    ...camelMetadata(world.metadata),early_access:true,releaseStatus:'playable',contentStatus:'complete_world_v1',
    locationCatalogStatus:'ready',residentRosterStatus:'ready',photoStatus:'hero_ready',
    locationPhotoStatus:'ready',mappedLocationPhotoCount:51,residentScheduleStatus:'authored_weekly_v2',
    socialGraphStatus:'authored_v1',residentPortraitStatus:'primary_portraits_ready',mappedResidentPortraitCount:45,
    tagline:world.tagline,relationshipFantasy:world.relationship_fantasy,centralQuestion:world.central_question,
    originYear:world.origin_year,approximatePopulation:world.year_round_population,peakWinterPopulation:world.peak_winter_population,
    townElevationFeet:world.town_elevation_feet,summitElevationFeet:world.summit_elevation_feet,
    canonicalLore:world.canonical_lore,nativeDateSeeds:world.metadata.native_date_seeds,storySeeds:world.metadata.story_seeds,
    populationArchetypes:world.metadata.population_archetypes,
  },'northvale_world_meta')},true,'subscription','worlds.standard','America/Denver',100,true,
  ${sqlJson(world.visual_context,'northvale_visual')},'home','balanced',
  ${textArray(world.dominant_dayparts)},${textArray(world.relationship_themes)},${textArray(world.activity_families)},
  ${quote(mobilityStyle)},${sqlJson(world.weather_profile,'northvale_weather')},null
)
on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,published=true,
  access_type=excluded.access_type,entitlement_key=excluded.entitlement_key,timezone=excluded.timezone,
  sort_order=excluded.sort_order,featured=excluded.featured,visual_context=excluded.visual_context,
  world_role=excluded.world_role,social_rhythm=excluded.social_rhythm,dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,weather_profile=excluded.weather_profile,updated_at=now();

create temporary table northvale_location_payload(data jsonb) on commit drop;
insert into northvale_location_payload values(${sqlJson(locations,'northvale_locations')});

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,hours,
  possible_activities,metadata,location_type,sort_order,depth,canonical_visual_context,canonical_lore
)
select (item->>'id')::uuid,'${worldId}'::uuid,nullif(item->>'parent_location_id','')::uuid,
  item->>'name',item->>'slug',item->>'description',item->>'category',item->>'visual_asset_key',
  nullif(item->'hours','null'::jsonb),array(select jsonb_array_elements_text(item->'activities')),
  coalesce(item->'metadata','{}'::jsonb)||jsonb_build_object('source','northvale_content_pack_v1','photoStatus','ready'),
  item->>'location_type',(item->>'index')::int*10,case when item->>'parent_location_id' is null then 0 else 1 end,
  item->'canonical_visual_context',item->'canonical_lore'
from northvale_location_payload cross join lateral jsonb_array_elements(data) item
on conflict(id) do update set world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,
  name=excluded.name,slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,possible_activities=excluded.possible_activities,
  metadata=excluded.metadata,location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

update public.together_worlds set default_arrival_location_id='${locationPrefix}000000000007'::uuid,updated_at=now()
where id='${worldId}'::uuid;

do $$
declare location_count int;district_count int;arrival_count int;
begin
  select count(*),count(*) filter(where location_type='district') into location_count,district_count
  from public.together_locations where world_id='${worldId}'::uuid;
  select count(*) into arrival_count from public.together_locations
  where id='${locationPrefix}000000000007'::uuid and world_id='${worldId}'::uuid and slug='lantern-square';
  if location_count<>51 or district_count<>6 or arrival_count<>1 then
    raise exception 'NorthVale location validation failed: locations %, districts %, arrival %',location_count,district_count,arrival_count;
  end if;
end $$;

commit;
`;

const characterSql=`-- NorthVale's 45 adult companions, identity bibles, homes, voice identity, and world presence.
begin;

alter table public.together_character_templates drop constraint if exists together_character_templates_name_key;
create temporary table northvale_character_payload(data jsonb) on commit drop;
insert into northvale_character_payload values(${sqlJson(characters,'northvale_characters')});

insert into public.together_character_templates(
  id,name,slug,public_handle,age,occupation,biography,creator_id,current_published_version,published,
  lifecycle_status,visibility,relationship_goal,connection_config,spice_level,character_role,
  can_be_selected,can_be_romanced,discovery_metadata,first_meeting,updated_at
)
select (item->>'template_id')::uuid,item->>'name',item->>'slug',item->>'slug',(item->>'age')::int,
  item->>'occupation',item->>'biography',null,1,true,'published','public',item->>'relationship_goal',
  item->'relationship_config',(item->>'spice_level')::int,'primary_companion',
  coalesce((item->>'can_be_selected')::boolean,true),coalesce((item->>'can_be_romanced')::boolean,true),
  jsonb_build_object(
    'summary',item->>'biography','traits',item->'traits','goals',jsonb_build_array('Dating','Friendship','Stories'),
    'featured',(item->>'roster_id')::int=any(array[1,8,15,22,23,32,39,40]),'new',true,
    'gender',item->>'gender','pronouns',item->>'pronouns','background',item->>'background',
    'classification',item->>'classification','species','human','residentWorldSlug','northvale',
    'districtSlug',item->>'district_slug','primaryLocationSlug',item->>'work_slug',
    'portraitStatus','ready','portraitSlotKey',item->>'portrait_asset_key','portraitFocalPosition','top',
    'storyHook',item->>'story_hook','romancePreferences',jsonb_build_object('available',true,'playerInclusive',true,'style',item->>'romance_style'),
    'initialRelationshipState','stranger','seasonalStatus',item->>'seasonal_status'
  ),
  ((item->'first_meeting') - 'location_slug')||jsonb_build_object('location_id',meeting.id),now()
from northvale_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations meeting on meeting.world_id='${worldId}'::uuid and meeting.slug=item->'first_meeting'->>'location_slug'
on conflict(id) do update set name=excluded.name,slug=excluded.slug,public_handle=excluded.public_handle,
  age=excluded.age,occupation=excluded.occupation,biography=excluded.biography,current_published_version=1,
  published=true,lifecycle_status='published',visibility='public',relationship_goal=excluded.relationship_goal,
  connection_config=excluded.connection_config,spice_level=excluded.spice_level,character_role='primary_companion',
  can_be_selected=excluded.can_be_selected,can_be_romanced=excluded.can_be_romanced,
  discovery_metadata=excluded.discovery_metadata,first_meeting=excluded.first_meeting,updated_at=now();

insert into public.together_character_versions(
  id,character_template_id,version,pronouns,personality_config,values_config,interests,
  communication_style,appearance_config,visual_identity,voice_config,boundaries,default_social_graph,
  portrait_asset_key,relationship_config,life_config,character_bible,appearance_candidates,published_at,updated_at
)
select (item->>'version_id')::uuid,(item->>'template_id')::uuid,1,item->>'pronouns',
  jsonb_build_object(
    'warmth',case when item->'traits'?|array['warm','gentle','generous','kind','compassionate'] then .84 else .66 end,
    'humor',case when item->'traits'?|array['witty','dryly funny','playful','teasing'] then .82 else .58 end,
    'directness',coalesce((item->'communication_style'->>'directness')::numeric,.68),'independence',.9,
    'spontaneity',case (item->>'spice_level')::int when 1 then .46 when 2 then .65 else .8 end,
    'socialEnergy',case when item->'traits'?|array['reserved','private','quiet','introverted'] then .42 else .7 end,
    'creativity',.74,'curiosity',.82
  ),
  '{"autonomy":0.96,"mutualRespect":0.96,"honesty":0.9,"consent":1,"privacy":0.94,"ordinaryLife":0.9}'::jsonb,
  array(select jsonb_array_elements_text(item->'interests')),item->'communication_style',
  jsonb_build_object('photoStatus','ready','portraitStatus','ready','canonicalDescription',item->>'appearance',
    'classification',item->>'classification','background',item->>'background','gender',item->>'gender'),
  jsonb_build_object('canonicalDescription',item->>'appearance','referenceStoragePaths','[]'::jsonb,
    'visualDoNotChange',jsonb_build_array('fictional adult age '||(item->>'age'),'gender presentation: '||(item->>'gender'),
      'background: '||(item->>'background'),'recognizable face and proportions'),
    'identityVersion',1,'fictional',true,'status','primary_portrait_ready','portraitSlotKey',item->>'portrait_asset_key',
    'worldVisualStyle',jsonb_build_array('photorealistic','contemporary winter clothing','grounded Colorado mountain realism','no real-person likeness'),
    'gender',item->>'gender','portraitPrompt',item->>'portrait_prompt','homePrompt',item->>'home_prompt'),
  jsonb_build_object('voiceKey',item->'voice_profile'->>'voiceKey','delivery',item->'voice_profile'->>'delivery',
    'providerMappings',jsonb_build_object('xai',case when item->>'gender'='man'
      then (array['leo','rex','sal'])[1+mod((item->>'roster_id')::int,3)]
      else (array['eve','ara','sal'])[1+mod((item->>'roster_id')::int,3)] end)),
  array(select jsonb_array_elements_text(item->'boundaries'))||array['fictional adult','mutual consent','independent point of view','respect user boundaries','do not treat professional warmth as romantic consent'],
  item->'circle_slugs',item->>'portrait_asset_key',item->'relationship_config',
  (item->'life_config')||jsonb_build_object('homeLocationId',district.id,'homeWorldId','${worldId}'::uuid),
  item->'character_bible','[]'::jsonb,now(),now()
from northvale_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id='${worldId}'::uuid and district.slug=item->>'district_slug'
on conflict(id) do update set pronouns=excluded.pronouns,personality_config=excluded.personality_config,
  values_config=excluded.values_config,interests=excluded.interests,communication_style=excluded.communication_style,
  appearance_config=excluded.appearance_config,visual_identity=excluded.visual_identity,voice_config=excluded.voice_config,
  boundaries=excluded.boundaries,default_social_graph=excluded.default_social_graph,portrait_asset_key=excluded.portrait_asset_key,
  relationship_config=excluded.relationship_config,life_config=excluded.life_config,character_bible=excluded.character_bible,
  appearance_candidates=excluded.appearance_candidates,published_at=excluded.published_at,updated_at=now();

insert into public.together_character_world_presence(
  character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata
)
select (item->>'version_id')::uuid,'${worldId}'::uuid,'resident',district.id,1,1,
  jsonb_build_object('source','northvale_content_pack_v1','residentWorldSlug','northvale','homeDistrictSlug',item->>'district_slug',
    'workLocationSlug',item->>'work_slug','classification',item->>'classification','portraitStatus','ready',
    'portraitSlotKey',item->>'portrait_asset_key','authored',true,'dynamicSchedule',true,'scheduleProfile','northvale_rich_weekly_v2')
from northvale_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id='${worldId}'::uuid and district.slug=item->>'district_slug'
on conflict(character_version_id,world_id) do update set presence_type='resident',home_location_id=excluded.home_location_id,
  familiarity=1,metadata=excluded.metadata,updated_at=now();

update public.together_character_homes home set
  residence_type='private contemporary NorthVale home in '||district.name,
  description=template.name||'''s home is a private, lived-in residence in '||district.name||'. '||(version.visual_identity->>'homePrompt'),
  prompt_text=version.visual_identity->>'homePrompt',
  canonical_visual_context=jsonb_build_object('canonicalPrompt',version.visual_identity->>'homePrompt','indoorOutdoor','indoor',
    'visualAnchors',jsonb_build_array('contemporary private residence',district.name,'lived-in occupation details','practical mountain weather'),
    'avoid',jsonb_build_array('public venue signage','luxury default','holiday-card staging','implied access without invitation'),'promptVersion',2),
  canonical_lore=jsonb_build_object('version',2,'authored',true,'summary',template.name||'''s private NorthVale home.',
    'stableFacts',jsonb_build_array('This is a private home.','It is not a public map location.','Entry is permission-based.'),
    'localEtiquette',jsonb_build_array('Do not imply entry from remote chat alone.','Do not invent access, roommates, or wealth.')),
  reference_policy='text_only',source='authored',prompt_version=2,active=true,updated_at=now()
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
cross join public.together_locations district
where home.character_version_id=version.id and district.id=home.district_anchor_location_id
  and version.id::text like '25000000-0000-4000-8011-%';

insert into public.together_character_voice_profiles(character_template_id,voice_key,characteristics,provider_mappings,metadata)
select (item->>'template_id')::uuid,item->'voice_profile'->>'voiceKey',
  jsonb_build_object('gender',item->>'gender','delivery',item->'voice_profile'->>'delivery','energy',case when item->'traits'?|array['quiet','reserved','calm'] then .45 else .7 end),
  version.voice_config->'providerMappings',jsonb_build_object('derivedFromVersionId',version.id,'source','northvale_content_pack_v1')
from northvale_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_character_versions version on version.id=(item->>'version_id')::uuid
on conflict(character_template_id) do update set voice_key=excluded.voice_key,characteristics=excluded.characteristics,
  provider_mappings=excluded.provider_mappings,metadata=excluded.metadata,active=true,updated_at=now();

with activities(activity_key,title,category,start_minute,end_minute,frequency,maximum) as(values
  ('home_cooking','Making something to eat at home','home',960,1260,1,3),
  ('quiet_home','Having some quiet time at home','home',1080,1410,2,5),
  ('northvale_errand','Running an errand near Lantern Square','errand',540,1080,1,2)
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,
  location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,
  energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select (item->>'version_id')::uuid,activity_key,title,category,
  jsonb_build_array(jsonb_build_object('startMinute',start_minute,'endMinute',end_minute)),int4range(45,121,'[]'),
  array[category],case when activity_key='northvale_errand' then array['lantern-square']::text[] else array[]::text[] end,
  array[category,'northvale'],.7,int4range(frequency,frequency+2,'[]'),maximum,18,null,'either','recurring_routine','hidden','open',
  jsonb_build_object('source','northvale_content_pack_v1','outcomeEligible',false)
from northvale_character_payload cross join lateral jsonb_array_elements(data) item cross join activities
on conflict(character_version_id,activity_key) do update set title=excluded.title,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,tags=excluded.tags,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,metadata=excluded.metadata,updated_at=now();

do $$
declare template_count int;version_count int;presence_count int;invalid_count int;
begin
  select count(*) into template_count from public.together_character_templates where id::text like '24000000-0000-4000-8011-%';
  select count(*) into version_count from public.together_character_versions where id::text like '25000000-0000-4000-8011-%';
  select count(*) into presence_count from public.together_character_world_presence where world_id='${worldId}'::uuid and character_version_id::text like '25000000-0000-4000-8011-%';
  select count(*) into invalid_count from northvale_character_payload cross join lateral jsonb_array_elements(data) item
  where (item->>'age')::int<18 or not exists(select 1 from public.together_locations where world_id='${worldId}'::uuid and slug=item->>'work_slug');
  if template_count<>45 or version_count<>45 or presence_count<>45 or invalid_count<>0 then
    raise exception 'NorthVale roster validation failed: templates %, versions %, presence %, invalid %',template_count,version_count,presence_count,invalid_count;
  end if;
end $$;

commit;
`;

const simulationSql=`-- NorthVale's authored weekly simulation, social graph, ambient events, story arcs, world facts, dialogue opportunities, and date seeds.
begin;

create temporary table northvale_schedule_payload(data jsonb) on commit drop;
insert into northvale_schedule_payload values(${sqlJson(schedules,'northvale_schedules')});

delete from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8011-%';
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  energy_delta,mood_influence,variation_weight,metadata
)
select (item->>'character_version_id')::uuid,(item->>'day_of_week')::int,(item->>'start_minute')::int,
  (item->>'end_minute')::int,location.id,item->>'activity',item->>'availability',(item->>'energy_delta')::int,
  item->>'mood_influence',coalesce((item->>'variation_weight')::numeric,1),item->'metadata'
from northvale_schedule_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${worldId}'::uuid and location.slug=item->>'location_slug'
on conflict(character_version_id,day_of_week,start_minute) do update set end_minute=excluded.end_minute,
  location_id=excluded.location_id,activity=excluded.activity,availability=excluded.availability,
  energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,
  variation_weight=excluded.variation_weight,metadata=excluded.metadata;

delete from public.together_character_schedule_events event using public.together_character_instances instance
where event.character_instance_id=instance.id and instance.character_version_id::text like '25000000-0000-4000-8011-%'
  and event.source in('generated','recurring') and event.starts_at>=date_trunc('day',now());

create temporary table northvale_social_payload(data jsonb) on commit drop;
insert into northvale_social_payload values(${sqlJson(pack.social_edges,'northvale_social')});
with authored as(
  select item->>'source' source_slug,item->>'target' target_slug,item->>'relationship_type' relationship_type,
    (item->>'affinity')::int affinity,(item->>'trust')::int trust,item->>'history' history
  from northvale_social_payload cross join lateral jsonb_array_elements(data) item
),directed as(
  select * from authored union all select target_slug,source_slug,relationship_type,affinity,trust,history from authored
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '${worldId}'::uuid,source.id,target.id,edge.relationship_type,edge.affinity,edge.trust,edge.history,
  jsonb_build_object('source','northvale_social_graph_v1','memorySharing','event_only','authored',true,'knowledgeScope','relationship_and_district')
from directed edge join public.together_character_templates source on source.slug=edge.source_slug
join public.together_character_templates target on target.slug=edge.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set relationship_type=excluded.relationship_type,
  affinity=excluded.affinity,trust=excluded.trust,history=excluded.history,metadata=excluded.metadata,updated_at=now();

create temporary table northvale_event_payload(data jsonb) on commit drop;
insert into northvale_event_payload values(${sqlJson(pack.recurring_events,'northvale_events')});
insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,
  duration_minutes,narrative_summary,state_effects,user_visibility,proactive_eligible,metadata,active,
  category,tone,scale,content_level,conditions,followups
)
select ('3b000000-0000-4000-8011-'||lpad(ordinality::text,12,'0'))::uuid,item->>'name',item->>'event_type',
  '${worldId}'::uuid,location.id,array(select template.id from public.together_character_templates template
    where template.slug=any(array(select jsonb_array_elements_text(item->'participant_slugs')))),
  .58,(item->>'probability')::numeric,(item->>'duration_minutes')::int,item->>'narrative_summary','{}'::jsonb,
  'contextual',true,jsonb_build_object('worldSlug','northvale','worldEvent',true,'recurrence',item->'recurrence','scheduleAware',true),
  true,
  case item->>'category' when 'community' then 'social' when 'music' then 'social' else item->>'category' end,
  case item->>'tone' when 'bright' then 'positive' when 'grounded' then 'positive' when 'intimate' then 'romantic' else item->>'tone' end,
  'normal','standard',jsonb_build_object('recurrence',item->'recurrence'),'{}'::text[]
from northvale_event_payload cross join lateral jsonb_array_elements(data) with ordinality payload(item,ordinality)
join public.together_locations location on location.world_id='${worldId}'::uuid and location.slug=item->>'location_slug'
on conflict(id) do update set name=excluded.name,event_type=excluded.event_type,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,probability=excluded.probability,duration_minutes=excluded.duration_minutes,
  narrative_summary=excluded.narrative_summary,metadata=excluded.metadata,conditions=excluded.conditions,active=true,updated_at=now();

create temporary table northvale_story_payload(data jsonb) on commit drop;
insert into northvale_story_payload values(${sqlJson(pack.story_arcs,'northvale_stories')});
insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select item->>'slug',item->>'title',item->>'category',
  array(select template.id from public.together_character_templates template
    where template.slug=any(array(select jsonb_array_elements_text(item->'lead_slugs')))),
  item->>'min_relationship_stage',
  jsonb_build_object('worldSlug','northvale','characterSlugs',item->'lead_slugs','locationSlugs',item->'location_slugs',
    'dialogueDriven',true,'requiresCorrectPlaceWhenAdvancing',true,'premise',item->>'premise'),
  (select jsonb_agg(jsonb_build_object('id','chapter-'||ordinality,'title',chapter->>'title',
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,'mayTriggerProactiveMessage',true,
    'mayCreateMoment',ordinality=jsonb_array_length(item->'chapters'),'narrativeSeed',chapter->>'narrative_seed',
    'minimumHoursBeforeNext',case when ordinality=1 then 12 else 24 end,
    'eligibleCharacterSlugs',item->'lead_slugs','eligibleLocationSlugs',item->'location_slugs') order by ordinality)
    from jsonb_array_elements(item->'chapters') with ordinality chapter_rows(chapter,ordinality)),
  90,false,'major',true,'specific','${worldId}'::uuid
from northvale_story_payload cross join lateral jsonb_array_elements(data) item
on conflict(slug) do update set title=excluded.title,category=excluded.category,
  eligible_template_ids=excluded.eligible_template_ids,min_relationship_stage=excluded.min_relationship_stage,
  prerequisites=excluded.prerequisites,chapters=excluded.chapters,world_scope='specific',
  specific_world_id=excluded.specific_world_id,active=true,updated_at=now();

create temporary table northvale_fact_payload(data jsonb) on commit drop;
insert into northvale_fact_payload values(${sqlJson(pack.world_facts,'northvale_facts')});
insert into public.together_world_facts(
  world_id,slug,title,fact_text,category,truth_mode,knowledge_scope,content_level,location_id,
  topic_tags,trigger_terms,weight,cooldown_turns,active,metadata
)
select '${worldId}'::uuid,item->>'slug',item->>'title',item->>'fact',
  case item->>'category'
    when 'housing' then 'economy' when 'current' then 'local_knowledge' when 'environment' then 'local_knowledge'
    when 'etiquette' then 'custom' when 'infrastructure' then 'institution' when 'tradition' then 'culture'
    when 'weather' then 'local_knowledge' else item->>'category' end,
  'canonical','public','standard',location.id,
  array[item->>'category',item->>'location_slug'],array(select jsonb_array_elements_text(item->'trigger_terms')),
  1,24,true,jsonb_build_object('source','northvale_content_pack_v1','originalCategory',item->>'category')
from northvale_fact_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${worldId}'::uuid and location.slug=item->>'location_slug'
on conflict(world_id,slug) do update set title=excluded.title,fact_text=excluded.fact_text,category=excluded.category,
  truth_mode=excluded.truth_mode,knowledge_scope=excluded.knowledge_scope,content_level=excluded.content_level,
  location_id=excluded.location_id,topic_tags=excluded.topic_tags,trigger_terms=excluded.trigger_terms,
  weight=excluded.weight,cooldown_turns=excluded.cooldown_turns,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table northvale_opportunity_payload(data jsonb) on commit drop;
insert into northvale_opportunity_payload values(${sqlJson(pack.dialogue_opportunities,'northvale_opportunities')});
insert into public.together_dialogue_opportunities(
  world_id,slug,topic,angle,framing,location_id,topic_tags,trigger_terms,content_level,
  interaction_modes,weight,cooldown_turns,active,metadata
)
select '${worldId}'::uuid,item->>'slug',item->>'topic',item->>'angle',
  'Optional only. Let this companion''s established personality, work, boundaries, history, and relationship stance determine their view.',
  location.id,array[item->>'topic'],array(select jsonb_array_elements_text(item->'trigger_terms')),
  'standard',array['remote','co_present'],1,24,true,
  jsonb_build_object('source','northvale_content_pack_v1','eligibleLocationSlugs',item->'location_slugs')
from northvale_opportunity_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${worldId}'::uuid
  and location.slug=(select value #>> '{}' from jsonb_array_elements(item->'location_slugs') limit 1)
on conflict(world_id,slug) do update set topic=excluded.topic,angle=excluded.angle,framing=excluded.framing,
  location_id=excluded.location_id,topic_tags=excluded.topic_tags,trigger_terms=excluded.trigger_terms,
  content_level=excluded.content_level,interaction_modes=excluded.interaction_modes,weight=excluded.weight,
  cooldown_turns=excluded.cooldown_turns,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table northvale_date_payload(data jsonb) on commit drop;
insert into northvale_date_payload values(${sqlJson(pack.date_scenes,'northvale_dates')});
insert into public.together_date_templates(
  id,name,slug,world_id,location_id,description,hero_asset_key,phases,unlock_rules,entitlement_key,active,metadata
)
select ('4f000000-0000-4000-8011-'||lpad(ordinality::text,12,'0'))::uuid,item->>'title',item->>'slug',
  '${worldId}'::uuid,location.id,item->>'setup','northvale-hero',
  jsonb_build_array(
    jsonb_build_object('id','arrival','title','Arrive','choices',jsonb_build_array(
      jsonb_build_object('id','lean-in','label','Lean into the plan'),jsonb_build_object('id','take-it-in','label','Take in the moment'))),
    jsonb_build_object('id','conversation','title','Settle in','choices',jsonb_build_array(
      jsonb_build_object('id','ask-real','label','Ask something real'),jsonb_build_object('id','follow-mood','label','Follow the mood'))),
    jsonb_build_object('id','turn','title','Something changes','choices',jsonb_build_array(
      jsonb_build_object('id','stay','label','Stay a little longer'),jsonb_build_object('id','change-pace','label','Change the pace'))),
    jsonb_build_object('id','resolution','title','What you keep','choices','[]'::jsonb)
  ),
  '{"familiarity":12,"trust":10,"allowed_stages":["acquaintance","friend","flirting","dating","exclusive","long_term"]}'::jsonb,
  'worlds.standard',true,jsonb_build_object('source','northvale_content_pack_v1','season',item->>'season','tone',item->>'tone')
from northvale_date_payload cross join lateral jsonb_array_elements(data) with ordinality payload(item,ordinality)
join public.together_locations location on location.world_id='${worldId}'::uuid and location.slug=item->>'location_slug'
on conflict(id) do update set name=excluded.name,slug=excluded.slug,world_id=excluded.world_id,
  location_id=excluded.location_id,description=excluded.description,hero_asset_key=excluded.hero_asset_key,
  phases=excluded.phases,unlock_rules=excluded.unlock_rules,entitlement_key=excluded.entitlement_key,
  active=true,metadata=excluded.metadata,updated_at=now();

update public.together_worlds set metadata=metadata||jsonb_build_object(
  'residentCompanionCount',45,'residentRosterStatus','ready','residentScheduleStatus','authored_weekly_v2',
  'socialGraphStatus','authored_v1','recurringEventCount',6,'storyArcCount',7,'worldFactCount',20,
  'dialogueOpportunityCount',12,'nativeDateCount',18,'residentPortraitStatus','primary_portraits_ready',
  'mappedResidentPortraitCount',45
),updated_at=now() where id='${worldId}'::uuid;

do $$
declare schedule_count int;incomplete_days int;invalid_locations int;edge_count int;event_count int;
  story_count int;fact_count int;opportunity_count int;date_count int;
begin
  select count(*) into schedule_count from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8011-%';
  select count(*) into incomplete_days from(
    select version.id,day from public.together_character_versions version cross join generate_series(0,6) day
    left join public.together_schedule_templates schedule on schedule.character_version_id=version.id and schedule.day_of_week=day
    where version.id::text like '25000000-0000-4000-8011-%'
    group by version.id,day having count(schedule.id)<6
  ) incomplete;
  select count(*) into invalid_locations from public.together_schedule_templates schedule
    left join public.together_locations location on location.id=schedule.location_id
    where schedule.character_version_id::text like '25000000-0000-4000-8011-%'
      and schedule.location_id is not null and location.world_id is distinct from '${worldId}'::uuid;
  select count(*) into edge_count from public.together_character_relationship_edges where world_id='${worldId}'::uuid;
  select count(*) into event_count from public.together_event_templates where world_id='${worldId}'::uuid and active;
  select count(*) into story_count from public.together_story_arc_templates where specific_world_id='${worldId}'::uuid and active;
  select count(*) into fact_count from public.together_world_facts where world_id='${worldId}'::uuid and active;
  select count(*) into opportunity_count from public.together_dialogue_opportunities where world_id='${worldId}'::uuid and active;
  select count(*) into date_count from public.together_date_templates where world_id='${worldId}'::uuid and active;
  if schedule_count<>1890 or incomplete_days<>0 or invalid_locations<>0 or edge_count<82 or event_count<>6
    or story_count<>7 or fact_count<>20 or opportunity_count<>12 or date_count<>18 then
    raise exception 'NorthVale simulation validation failed: schedules %, incomplete %, invalid %, edges %, events %, stories %, facts %, opportunities %, dates %',
      schedule_count,incomplete_days,invalid_locations,edge_count,event_count,story_count,fact_count,opportunity_count,date_count;
  end if;
end $$;

commit;
`;

await Promise.all([
  writeFile(resolve('supabase/migrations/202608240015_kivelle_northvale_world_v1.sql'),worldSql),
  writeFile(resolve('supabase/migrations/202608240016_kivelle_northvale_character_roster.sql'),characterSql),
  writeFile(resolve('supabase/migrations/202608240017_kivelle_northvale_simulation_v1.sql'),simulationSql),
]);
console.log(JSON.stringify({world:world.slug,locations:locations.length,characters:characters.length,schedules:schedules.length,
  socialEdges:pack.social_edges.length,events:pack.recurring_events.length,stories:pack.story_arcs.length,
  facts:pack.world_facts.length,opportunities:pack.dialogue_opportunities.length,dates:pack.date_scenes.length}));

function quote(value){return `'${String(value).replaceAll("'","''")}'`;}
function textArray(values){return `array[${values.map(quote).join(',')}]::text[]`;}
function camelMetadata(value){
  const output={};
  for(const[key,item]of Object.entries(value??{}))output[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase())]=item;
  return output;
}
