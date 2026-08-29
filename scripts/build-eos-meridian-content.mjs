import{writeFile}from'node:fs/promises';
import{WORLD_ID,LOCATION_PREFIX,world,locations,characters,socialEdges,recurringEvents,storyArcs,worldFacts,dialogueOpportunities,interactionBeats,dateScenes,buildSchedules}from'./eos-meridian-content.mjs';

const schedules=buildSchedules();
const sqlJson=(value,tag)=>`$${tag}$${JSON.stringify(value)}$${tag}$::jsonb`;
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const locationId=index=>`${LOCATION_PREFIX}${String(index).padStart(12,'0')}`;
const arrivalId=locationId(7);
const placePayload=locations.map(item=>({...item,id:locationId(item.index),worldId:WORLD_ID,parentLocationId:item.parentIndex?locationId(item.parentIndex):null,
  districtSlug:item.parentIndex?locations.find(location=>location.index===item.parentIndex)?.slug:item.slug,
  visualAssetKey:`eos-meridian-location-${item.slug}`}));

const worldMigration=`-- Eos Meridian canonical world and complete location catalog.
begin;

insert into public.together_worlds(
  id,name,slug,description,hero_asset_key,theme,metadata,published,access_type,entitlement_key,
  timezone,sort_order,featured,visual_context,world_role,social_rhythm,dominant_dayparts,
  relationship_themes,activity_families,mobility_style,weather_profile,default_arrival_location_id
) values(
  '${WORLD_ID}',${quote(world.name)},${quote(world.slug)},${quote(world.description)},'eos-meridian-hero',
  '{"accent":["copper","aurora teal","warm amber"]}'::jsonb,
  ${sqlJson({releaseWave:11,early_access:true,releaseStatus:'playable',contentStatus:'complete_world_v1',locationCatalogStatus:'ready',residentRosterStatus:'ready',photoStatus:'hero_ready',locationPhotoStatus:'ready',mappedLocationPhotoCount:locations.length,locationCount:locations.length,districtCount:6,publicPlaceCount:locations.length-6,residentCompanionCount:characters.length,residentRosterVersion:1,residentScheduleStatus:'authored_weekly_v1',socialGraphStatus:'authored_v1',residentPortraitStatus:'primary_portraits_ready',mappedResidentPortraitCount:characters.length,recurringEventCount:recurringEvents.length,storyArcCount:storyArcs.length,worldFactCount:worldFacts.length,dialogueOpportunityCount:dialogueOpportunities.length,interactionBeatCount:interactionBeats.length,nativeDateCount:dateScenes.length,genreTags:['grounded space colony','frontier romance','political independence','science mystery','found family','workplace'],tagline:world.tagline,relationshipFantasy:world.relationshipFantasy,centralQuestion:world.centralQuestion,approximatePopulation:24000,colonyAgeYears:38,gravityRatio:.83,scheduleClock:'user_local',canonicalLore:world.canonicalLore,nativeDateSeeds:dateScenes.slice(0,8).map(item=>item.title),storySeeds:storyArcs.map(item=>item.title),populationArchetypes:characters.map(item=>item.occupation)},'eos_world_meta')},
  true,'subscription','worlds.standard','UTC',110,true,${sqlJson(world.visualContext,'eos_visual')},'home','balanced',
  array['morning','evening','late_night']::text[],
  array['trust as practical care','staying versus leaving','privacy inside a dense colony','work and personal identity','independence and belonging','ordinary life beneath extraordinary skies']::text[],
  array['colony dining','artificial rain','port arrivals','low-gravity recreation','engineering and repair','aurora watching','research and discovery','nightlife and music']::text[],
  'transit',${sqlJson({climate:'tidally locked frontier',states:['calm_twilight','red_dust_storm','aurora_peak','night_ice_cold','interior_rain_cycle'],outdoorBias:.34,userLocalSchedule:true},'eos_weather')},null
)
on conflict(id) do update set name=excluded.name,slug=excluded.slug,description=excluded.description,
  hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,published=true,
  access_type=excluded.access_type,entitlement_key=excluded.entitlement_key,timezone=excluded.timezone,
  sort_order=excluded.sort_order,featured=excluded.featured,visual_context=excluded.visual_context,
  world_role=excluded.world_role,social_rhythm=excluded.social_rhythm,dominant_dayparts=excluded.dominant_dayparts,
  relationship_themes=excluded.relationship_themes,activity_families=excluded.activity_families,
  mobility_style=excluded.mobility_style,weather_profile=excluded.weather_profile,updated_at=now();

create temporary table eos_location_payload(data jsonb) on commit drop;
insert into eos_location_payload values(${sqlJson(placePayload,'eos_locations')});

insert into public.together_locations(
  id,world_id,parent_location_id,name,slug,description,category,visual_asset_key,hours,
  possible_activities,metadata,location_type,sort_order,depth,canonical_visual_context,canonical_lore
)
select (item->>'id')::uuid,'${WORLD_ID}'::uuid,nullif(item->>'parentLocationId','')::uuid,item->>'name',item->>'slug',
  item->>'description',item->>'category',item->>'visualAssetKey',nullif(item->'hours','null'::jsonb),
  array(select jsonb_array_elements_text(item->'activities')),
  jsonb_build_object('source','eos_meridian_content_v1','photoStatus','ready','imageSlotKey',item->>'visualAssetKey',
    'district',item->>'districtSlug',
    'backstory',item->>'backstory','socialTexture',item->>'socialTexture','userLocalClock',true),
  item->>'locationType',(item->>'index')::int*10,case when item->>'parentLocationId' is null then 0 else 1 end,
  jsonb_build_object('canonicalPrompt',(item->>'name')||', Eos Meridian. '||(item->>'description')||
    ' Photorealistic grounded human space-colony environment, believable pressure architecture and worn engineering, warm amber habitation against copper twilight or aurora-lit night, practical current clothing, no readable brands, no aliens, no sterile white spaceship sameness.',
    'indoorOutdoor',case when item->>'locationType' in('outdoor','landmark','district','transit') then 'outdoor' else 'mixed' end,
    'visualAnchors',(item->'visualAnchors')||jsonb_build_array('Eos Meridian','fixed twilight sky','lived-in human colony'),
    'avoid',${sqlJson(world.visualContext.avoid,'eos_visual_avoid')}),
  jsonb_build_object('version',2,'authored',true,'summary',item->>'description','backstory',item->>'backstory',
    'socialTexture',item->>'socialTexture','atmosphere',jsonb_build_array('grounded frontier science fiction','lived-in','shift-shaped','human-scale'),
    'sensoryDetails',jsonb_build_array('Pressure ventilation, worn surfaces, and shift traffic make the infrastructure feel inhabited.',
      'Warm interior light contrasts with the fixed copper or aurora-lit exterior.','The social rhythm changes across user-local dayparts rather than an astronomical sunrise.'),
    'signatureDetails',(item->'visualAnchors'),'layout',jsonb_build_array('recognizable arrival threshold','primary public activity area','quieter edge suited to conversation'),
    'crowdRhythm',jsonb_build_object('morning','Early shift workers establish the practical rhythm.','afternoon','Work, errands, and public traffic overlap.',
      'evening','Off-shift residents create more social energy.','late_night','Late operations and established nightlife remain.','overnight','Only round-the-clock work or authored venues remain.'),
    'conversationHooks',jsonb_build_array('How the place changes between shifts.','What regulars notice that visitors miss.','How colony infrastructure affects ordinary intimacy.'),
    'stableFacts',jsonb_build_array((item->>'name')||' is in Eos Meridian.',item->>'description',item->>'backstory'),
    'localEtiquette',jsonb_build_array('Follow pressure, privacy, access, and safety boundaries.','Do not imply entry into restricted areas.'),
    'weatherNotes',jsonb_build_array('Red storms can close exterior routes.','Nightglass cold and aurora conditions change outdoor access.'),
    'storySeeds',jsonb_build_array('A routine visit may expose a character-specific choice without forcing a quest.'))
from eos_location_payload cross join lateral jsonb_array_elements(data) item
on conflict(id) do update set world_id=excluded.world_id,parent_location_id=excluded.parent_location_id,
  name=excluded.name,slug=excluded.slug,description=excluded.description,category=excluded.category,
  visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,possible_activities=excluded.possible_activities,
  metadata=excluded.metadata,location_type=excluded.location_type,sort_order=excluded.sort_order,depth=excluded.depth,
  canonical_visual_context=excluded.canonical_visual_context,canonical_lore=excluded.canonical_lore,updated_at=now();

update public.together_worlds set default_arrival_location_id='${arrivalId}'::uuid,updated_at=now()
where id='${WORLD_ID}'::uuid;

do $$
declare location_count int;district_count int;arrival_count int;
begin
  select count(*),count(*) filter(where location_type='district') into location_count,district_count
  from public.together_locations where world_id='${WORLD_ID}'::uuid;
  select count(*) into arrival_count from public.together_locations where id='${arrivalId}'::uuid and slug='meridian-concourse';
  if location_count<>${locations.length} or district_count<>6 or arrival_count<>1 then
    raise exception 'Eos Meridian location validation failed: locations %, districts %, arrival %',location_count,district_count,arrival_count;
  end if;
end $$;
commit;
`;

const rosterMigration=`-- Eos Meridian adult companion roster, isolated identity bibles, voice identity, homes, and world presence.
begin;

alter table public.together_character_templates drop constraint if exists together_character_templates_name_key;
create temporary table eos_character_payload(data jsonb) on commit drop;
insert into eos_character_payload values(${sqlJson(characters,'eos_characters')});

insert into public.together_character_templates(
  id,name,slug,public_handle,age,occupation,biography,creator_id,current_published_version,published,
  lifecycle_status,visibility,relationship_goal,connection_config,spice_level,character_role,
  can_be_selected,can_be_romanced,discovery_metadata,first_meeting,updated_at
)
select (item->>'templateId')::uuid,item->>'name',item->>'slug',item->>'slug',(item->>'age')::int,
  item->>'occupation',item->>'biography',null,1,true,'published','public',item->>'relationshipGoal',
  item->'relationshipConfig',(item->>'spiceLevel')::int,'primary_companion',true,true,
  jsonb_build_object('summary',item->>'biography','traits',item->'traits','goals',jsonb_build_array('Dating','Friendship','Stories'),
    'featured',(item->>'rosterId')::int=any(array[1,2,6,11,16,21,26,30]),'new',true,
    'gender',item->>'gender','pronouns',item->>'pronouns','background',item->>'background','classification','human colonist',
    'species','human','residentWorldSlug','eos-meridian','districtSlug',item->>'districtSlug','primaryLocationSlug',item->>'workSlug',
    'portraitStatus','ready','portraitSlotKey',item->>'portraitAssetKey','portraitFocalPosition','top',
    'storyHook',item->>'storyHook','romancePreferences',jsonb_build_object('available',true,'playerInclusive',true,'style',item->>'romanceStyle'),
    'initialRelationshipState','stranger','ageAware',true),
  jsonb_build_object('opener',item->'firstMeeting'->>'opener','location_id',meeting.id),now()
from eos_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations meeting on meeting.world_id='${WORLD_ID}'::uuid and meeting.slug=item->'firstMeeting'->>'locationSlug'
on conflict(id) do update set name=excluded.name,slug=excluded.slug,public_handle=excluded.public_handle,
  age=excluded.age,occupation=excluded.occupation,biography=excluded.biography,current_published_version=1,published=true,
  lifecycle_status='published',visibility='public',relationship_goal=excluded.relationship_goal,
  connection_config=excluded.connection_config,spice_level=excluded.spice_level,character_role='primary_companion',
  can_be_selected=true,can_be_romanced=true,discovery_metadata=excluded.discovery_metadata,
  first_meeting=excluded.first_meeting,updated_at=now();

insert into public.together_character_versions(
  id,character_template_id,version,pronouns,personality_config,values_config,interests,
  communication_style,appearance_config,visual_identity,voice_config,boundaries,default_social_graph,
  portrait_asset_key,relationship_config,life_config,character_bible,appearance_candidates,published_at,updated_at
)
select (item->>'versionId')::uuid,(item->>'templateId')::uuid,1,item->>'pronouns',
  jsonb_build_object('warmth',case when item->'traits'?|array['warm','gentle','generous','affectionate','tender'] then .84 else .68 end,
    'humor',case when item->'traits'?|array['witty','dryly funny','playful','teasing'] then .84 else .6 end,
    'directness',coalesce((item->'communicationStyle'->>'directness')::numeric,.7),'independence',.91,
    'spontaneity',case (item->>'spiceLevel')::int when 1 then .48 when 2 then .66 else .82 end,
    'socialEnergy',case when item->'traits'?|array['private','restrained','introspective','guarded'] then .44 else .7 end,
    'creativity',.76,'curiosity',.84),
  '{"autonomy":0.98,"mutualRespect":0.98,"honesty":0.92,"consent":1,"privacy":0.96,"ordinaryLife":0.92}'::jsonb,
  array(select jsonb_array_elements_text(item->'interests')),item->'communicationStyle',
  jsonb_build_object('photoStatus','ready','portraitStatus','ready','canonicalDescription',item->>'appearance',
    'classification','human colonist','background',item->>'background','gender',item->>'gender','age',(item->>'age')::int),
  jsonb_build_object('canonicalDescription',item->>'appearance','referenceStoragePaths','[]'::jsonb,
    'visualDoNotChange',jsonb_build_array('fictional adult age '||(item->>'age'),'gender presentation: '||(item->>'gender'),
      'background: '||(item->>'background'),'recognizable face, hair, complexion, and proportions'),
    'identityVersion',1,'fictional',true,'status','primary_portrait_ready','portraitSlotKey',item->>'portraitAssetKey',
    'worldVisualStyle',jsonb_build_array('photorealistic','grounded contemporary space colony','practical current clothing','no real-person likeness'),
    'gender',item->>'gender','portraitPrompt','Single textless 3:4 photorealistic portrait of '||(item->>'name')||', a fictional adult age '||(item->>'age')||'. '||(item->>'appearance')||
      '. Place them in or near '||workplace.name||' in Eos Meridian with a softly blurred, job-relevant space-colony background. Natural skin texture, consistent face and proportions, practical modern clothing, no readable text, no logos, no silver jumpsuit, no real-person likeness.',
    'homePrompt','Photorealistic private Eos Meridian residence belonging to '||(item->>'name')||'. Compact lived-in contemporary habitat interior with occupation and interest details, pressure-glass or district-appropriate window, practical storage, warm light, no public signage, no luxury default, and no implied user access.'),
  jsonb_build_object('voiceKey',item->'voiceProfile'->>'voiceKey','delivery',item->'voiceProfile'->>'delivery',
    'providerMappings',jsonb_build_object('xai',item->'voiceProfile'->>'xaiVoiceId')),
  array(select jsonb_array_elements_text(item->'boundaries'))||array['fictional adult','mutual consent','independent point of view','respect user boundaries','do not treat professional warmth as romantic consent'],
  '[]'::jsonb,item->>'portraitAssetKey',item->'relationshipConfig',
  jsonb_build_object('version',2,'homeWorldId','${WORLD_ID}'::uuid,'homeLocationId',district.id,
    'homeDistrictSlug',item->>'districtSlug','occupation',jsonb_build_object('title',item->>'occupation','primaryLocationSlug',item->>'workSlug'),
    'interests',item->'interests','publicLocationSlugs',jsonb_build_array(item->>'workSlug',item->>'secondarySlug',item->>'socialSlug'),
    'scheduling',jsonb_build_object('scheduleProfile','eos_meridian_authored_weekly_v1','authoredCoverage','full_week',
      'socialOverlapAware',true,'privateTimeAuthored',true,'userLocalClock',true)),
  item->'characterBible','[]'::jsonb,now(),now()
from eos_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id='${WORLD_ID}'::uuid and district.slug=item->>'districtSlug'
join public.together_locations workplace on workplace.world_id='${WORLD_ID}'::uuid and workplace.slug=item->>'workSlug'
on conflict(id) do update set pronouns=excluded.pronouns,personality_config=excluded.personality_config,
  values_config=excluded.values_config,interests=excluded.interests,communication_style=excluded.communication_style,
  appearance_config=excluded.appearance_config,visual_identity=excluded.visual_identity,voice_config=excluded.voice_config,
  boundaries=excluded.boundaries,default_social_graph=excluded.default_social_graph,portrait_asset_key=excluded.portrait_asset_key,
  relationship_config=excluded.relationship_config,life_config=excluded.life_config,character_bible=excluded.character_bible,
  appearance_candidates=excluded.appearance_candidates,published_at=excluded.published_at,updated_at=now();

insert into public.together_character_world_presence(character_version_id,world_id,presence_type,home_location_id,familiarity,visited_count,metadata)
select (item->>'versionId')::uuid,'${WORLD_ID}'::uuid,'resident',district.id,1,1,
  jsonb_build_object('source','eos_meridian_content_v1','residentWorldSlug','eos-meridian','homeDistrictSlug',item->>'districtSlug',
    'workLocationSlug',item->>'workSlug','classification','human colonist','portraitStatus','ready',
    'portraitSlotKey',item->>'portraitAssetKey','authored',true,'dynamicSchedule',true,
    'scheduleProfile','eos_meridian_authored_weekly_v1','userLocalClock',true)
from eos_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations district on district.world_id='${WORLD_ID}'::uuid and district.slug=item->>'districtSlug'
on conflict(character_version_id,world_id) do update set presence_type='resident',home_location_id=excluded.home_location_id,
  familiarity=1,metadata=excluded.metadata,updated_at=now();

insert into public.together_character_voice_profiles(character_template_id,voice_key,characteristics,provider_mappings,metadata)
select (item->>'templateId')::uuid,item->'voiceProfile'->>'voiceKey',
  jsonb_build_object('gender',item->>'gender','delivery',item->'voiceProfile'->>'delivery',
    'energy',case when item->'traits'?|array['quiet','restrained','calm','private'] then .46 else .7 end),
  version.voice_config->'providerMappings',jsonb_build_object('derivedFromVersionId',version.id,'source','eos_meridian_content_v1')
from eos_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_character_versions version on version.id=(item->>'versionId')::uuid
on conflict(character_template_id) do update set voice_key=excluded.voice_key,characteristics=excluded.characteristics,
  provider_mappings=excluded.provider_mappings,metadata=excluded.metadata,active=true,updated_at=now();

with activities(activity_key,title,category,start_minute,end_minute,frequency,maximum,location_slug) as(values
  ('home_cooking','Making an ordinary meal at home','home',960,1260,1,3,null::text),
  ('quiet_home','Taking private time at home','home',1080,1410,2,5,null::text),
  ('meridian_errand','Handling an errand around Atlas Market','errand',540,1080,1,2,'atlas-market')
)
insert into public.together_character_activity_templates(
  character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,
  location_slugs,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,
  energy_requirement,social_requirement,priority,visibility,interruptibility,metadata
)
select (item->>'versionId')::uuid,activity_key,title,category,
  jsonb_build_array(jsonb_build_object('startMinute',start_minute,'endMinute',end_minute)),int4range(45,121,'[]'),
  array[category],case when location_slug is null then array[]::text[] else array[location_slug]::text[] end,
  array[category,'eos-meridian'],.7,int4range(frequency,frequency+2,'[]'),maximum,18,null,'either',
  'recurring_routine','hidden','open',jsonb_build_object('source','eos_meridian_content_v1','outcomeEligible',false,'userLocalClock',true)
from eos_character_payload cross join lateral jsonb_array_elements(data) item cross join activities
on conflict(character_version_id,activity_key) do update set title=excluded.title,valid_time_windows=excluded.valid_time_windows,
  duration_minutes=excluded.duration_minutes,location_slugs=excluded.location_slugs,tags=excluded.tags,
  affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,
  maximum_weekly_frequency=excluded.maximum_weekly_frequency,metadata=excluded.metadata,updated_at=now();

do $$
declare template_count int;version_count int;presence_count int;voice_count int;invalid_count int;
begin
  select count(*) into template_count from public.together_character_templates where id::text like '24000000-0000-4000-8012-%';
  select count(*) into version_count from public.together_character_versions where id::text like '25000000-0000-4000-8012-%';
  select count(*) into presence_count from public.together_character_world_presence where world_id='${WORLD_ID}'::uuid and character_version_id::text like '25000000-0000-4000-8012-%';
  select count(*) into voice_count from public.together_character_voice_profiles where character_template_id::text like '24000000-0000-4000-8012-%' and active;
  select count(*) into invalid_count from eos_character_payload cross join lateral jsonb_array_elements(data) item
  where (item->>'age')::int<18 or not exists(select 1 from public.together_locations where world_id='${WORLD_ID}'::uuid and slug=item->>'workSlug');
  if template_count<>${characters.length} or version_count<>${characters.length} or presence_count<>${characters.length} or voice_count<>${characters.length} or invalid_count<>0 then
    raise exception 'Eos roster validation failed: templates %, versions %, presence %, voices %, invalid %',template_count,version_count,presence_count,voice_count,invalid_count;
  end if;
end $$;
commit;
`;

const simulationMigration=`-- Eos Meridian authored schedules, social graph, place knowledge, events, stories, retrieval depth, and dates.
begin;

create temporary table eos_schedule_payload(data jsonb) on commit drop;
insert into eos_schedule_payload values(${sqlJson(schedules,'eos_schedules')});
delete from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8012-%';
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,
  energy_delta,mood_influence,variation_weight,metadata
)
select (item->>'characterVersionId')::uuid,(item->>'dayOfWeek')::int,(item->>'startMinute')::int,
  (item->>'endMinute')::int,location.id,item->>'activity',item->>'availability',(item->>'energyDelta')::int,
  item->>'moodInfluence',coalesce((item->>'variationWeight')::numeric,1),item->'metadata'
from eos_schedule_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${WORLD_ID}'::uuid and location.slug=item->>'locationSlug'
on conflict(character_version_id,day_of_week,start_minute) do update set end_minute=excluded.end_minute,
  location_id=excluded.location_id,activity=excluded.activity,availability=excluded.availability,
  energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,
  variation_weight=excluded.variation_weight,metadata=excluded.metadata;

delete from public.together_character_schedule_events event using public.together_character_instances instance
where event.character_instance_id=instance.id and instance.character_version_id::text like '25000000-0000-4000-8012-%'
  and event.source in('generated','recurring') and event.starts_at>=date_trunc('day',now());

create temporary table eos_social_payload(data jsonb) on commit drop;
insert into eos_social_payload values(${sqlJson(socialEdges,'eos_social')});
with authored as(
  select item->>'source' source_slug,item->>'target' target_slug,item->>'relationshipType' relationship_type,
    (item->>'affinity')::int affinity,(item->>'trust')::int trust,item->>'history' history
  from eos_social_payload cross join lateral jsonb_array_elements(data) item
),directed as(
  select * from authored union all select target_slug,source_slug,relationship_type,affinity,trust,history from authored
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '${WORLD_ID}'::uuid,source.id,target.id,edge.relationship_type,edge.affinity,edge.trust,edge.history,
  jsonb_build_object('source','eos_meridian_social_graph_v1','memorySharing','event_only','authored',true,
    'knowledgeScope','relationship_and_district')
from directed edge join public.together_character_templates source on source.slug=edge.source_slug
join public.together_character_templates target on target.slug=edge.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set relationship_type=excluded.relationship_type,
  affinity=excluded.affinity,trust=excluded.trust,history=excluded.history,metadata=excluded.metadata,updated_at=now();

create temporary table eos_character_payload(data jsonb) on commit drop;
insert into eos_character_payload values(${sqlJson(characters,'eos_characters_sim')});
insert into public.together_character_place_profiles(
  character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,opinion_tags,
  preferred_activities,favorite_details,disliked_details,metadata
)
select (item->>'versionId')::uuid,location.id,.95,.58,.92,
  (item->>'name')||' knows '||location.name||' through ordinary routine and has an occupation-specific point of view rather than generic world knowledge.',
  array['routine','work','eos-meridian'],array(
    select interest.value
    from jsonb_array_elements_text(item->'interests') with ordinality as interest(value,ordinality)
    where interest.ordinality<=2
    order by interest.ordinality
  ),
  array['repeat routines','competent staff'],array['avoidable access violations'],jsonb_build_object('source','eos_meridian_content_v1','knowledgeScope','direct')
from eos_character_payload cross join lateral jsonb_array_elements(data) item
join public.together_locations location on location.world_id='${WORLD_ID}'::uuid and location.slug=item->>'workSlug'
on conflict(character_version_id,location_id) do update set familiarity=excluded.familiarity,sentiment=excluded.sentiment,
  confidence=excluded.confidence,opinion_summary=excluded.opinion_summary,opinion_tags=excluded.opinion_tags,
  preferred_activities=excluded.preferred_activities,favorite_details=excluded.favorite_details,
  disliked_details=excluded.disliked_details,metadata=excluded.metadata,updated_at=now();

create temporary table eos_event_payload(data jsonb) on commit drop;
insert into eos_event_payload values(${sqlJson(recurringEvents,'eos_events')});
insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,
  duration_minutes,narrative_summary,state_effects,user_visibility,proactive_eligible,metadata,active,
  category,tone,scale,content_level,conditions,followups
)
select ('3b000000-0000-4000-8012-'||lpad(ordinality::text,12,'0'))::uuid,item->>'name',item->>'eventType',
  '${WORLD_ID}'::uuid,location.id,array(select template.id from public.together_character_templates template
    where template.slug=any(array(select jsonb_array_elements_text(item->'participantSlugs')))),
  .58,(item->>'probability')::numeric,(item->>'durationMinutes')::int,item->>'summary','{}'::jsonb,'contextual',true,
  jsonb_build_object('worldSlug','eos-meridian','worldEvent',true,'recurrence',item->'recurrence','scheduleAware',true,'userLocalClock',true),true,
  case item->>'category' when 'music' then 'social' when 'environment' then 'world' when 'community' then 'social' when 'mystery' then 'discovery' else item->>'category' end,
  case item->>'tone' when 'grounded' then 'positive' when 'intimate' then 'romantic' when 'tense' then 'surprising' when 'playful' then 'exciting' else item->>'tone' end,
  'normal','standard',jsonb_build_object('recurrence',item->'recurrence'),'{}'::text[]
from eos_event_payload cross join lateral jsonb_array_elements(data) with ordinality payload(item,ordinality)
join public.together_locations location on location.world_id='${WORLD_ID}'::uuid and location.slug=item->>'locationSlug'
on conflict(id) do update set name=excluded.name,event_type=excluded.event_type,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,probability=excluded.probability,duration_minutes=excluded.duration_minutes,
  narrative_summary=excluded.narrative_summary,metadata=excluded.metadata,conditions=excluded.conditions,active=true,updated_at=now();

create temporary table eos_story_payload(data jsonb) on commit drop;
insert into eos_story_payload values(${sqlJson(storyArcs,'eos_stories')});
insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select item->>'slug',item->>'title',item->>'category',
  array(select template.id from public.together_character_templates template
    where template.slug=any(array(select jsonb_array_elements_text(item->'leadSlugs')))),item->>'minStage',
  jsonb_build_object('worldSlug','eos-meridian','characterSlugs',item->'leadSlugs','locationSlugs',item->'locationSlugs',
    'dialogueDriven',true,'requiresCorrectPlaceWhenAdvancing',true,'premise',item->>'premise'),
  (select jsonb_agg(jsonb_build_object('id','chapter-'||ordinality,'title',chapter->>'title',
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,'mayTriggerProactiveMessage',true,
    'mayCreateMoment',ordinality=jsonb_array_length(item->'chapters'),'narrativeSeed',chapter->>'narrativeSeed',
    'minimumHoursBeforeNext',case when ordinality=1 then 12 else 24 end,
    'eligibleCharacterSlugs',item->'leadSlugs','eligibleLocationSlugs',item->'locationSlugs') order by ordinality)
    from jsonb_array_elements(item->'chapters') with ordinality chapter_rows(chapter,ordinality)),
  90,false,'major',true,'specific','${WORLD_ID}'::uuid
from eos_story_payload cross join lateral jsonb_array_elements(data) item
on conflict(slug) do update set title=excluded.title,category=excluded.category,
  eligible_template_ids=excluded.eligible_template_ids,min_relationship_stage=excluded.min_relationship_stage,
  prerequisites=excluded.prerequisites,chapters=excluded.chapters,world_scope='specific',
  specific_world_id=excluded.specific_world_id,active=true,updated_at=now();

create temporary table eos_fact_payload(data jsonb) on commit drop;
insert into eos_fact_payload values(${sqlJson(worldFacts,'eos_facts')});
insert into public.together_world_facts(
  world_id,slug,title,fact_text,category,truth_mode,knowledge_scope,content_level,
  topic_tags,trigger_terms,weight,cooldown_turns,active,metadata
)
select '${WORLD_ID}'::uuid,item->>'slug',item->>'title',item->>'fact',item->>'category',item->>'truthMode',
  item->>'knowledgeScope',item->>'contentLevel',array[item->>'category','eos-meridian'],
  array(select jsonb_array_elements_text(item->'triggerTerms')),1,24,true,
  jsonb_build_object('source','eos_meridian_content_v1','closedWorld',true)
from eos_fact_payload cross join lateral jsonb_array_elements(data) item
on conflict(world_id,slug) do update set title=excluded.title,fact_text=excluded.fact_text,category=excluded.category,
  truth_mode=excluded.truth_mode,knowledge_scope=excluded.knowledge_scope,content_level=excluded.content_level,
  topic_tags=excluded.topic_tags,trigger_terms=excluded.trigger_terms,weight=excluded.weight,
  cooldown_turns=excluded.cooldown_turns,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table eos_opportunity_payload(data jsonb) on commit drop;
insert into eos_opportunity_payload values(${sqlJson(dialogueOpportunities,'eos_opportunities')});
insert into public.together_dialogue_opportunities(
  world_id,slug,topic,angle,framing,location_id,topic_tags,trigger_terms,content_level,
  interaction_modes,weight,cooldown_turns,active,metadata
)
select '${WORLD_ID}'::uuid,item->>'slug',item->>'topic',item->>'angle',
  'Optional only. Let the companion’s identity, work, boundaries, social graph, and relationship stance determine their view. Never force a topic change.',
  location.id,array[item->>'topic','eos-meridian'],array(select jsonb_array_elements_text(item->'triggerTerms')),
  'standard',array['remote','co_present'],1,24,true,
  jsonb_build_object('source','eos_meridian_content_v1','eligibleLocationSlugs',item->'locationSlugs')
from eos_opportunity_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${WORLD_ID}'::uuid
  and location.slug=(select value #>> '{}' from jsonb_array_elements(item->'locationSlugs') limit 1)
on conflict(world_id,slug) do update set topic=excluded.topic,angle=excluded.angle,framing=excluded.framing,
  location_id=excluded.location_id,topic_tags=excluded.topic_tags,trigger_terms=excluded.trigger_terms,
  content_level=excluded.content_level,interaction_modes=excluded.interaction_modes,weight=excluded.weight,
  cooldown_turns=excluded.cooldown_turns,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table eos_beat_payload(data jsonb) on commit drop;
insert into eos_beat_payload values(${sqlJson(interactionBeats,'eos_beats')});
insert into public.together_scene_interaction_beats(
  world_id,slug,title,location_id,interaction_type,seed,affordances,topic_tags,character_tags,
  min_relationship_stage,content_level,min_spice_level,interaction_modes,co_present_required,
  required_participant_count,maximum_participant_count,dayparts,activity_tags,weight,cooldown_hours,active,metadata
)
select '${WORLD_ID}'::uuid,item->>'slug',item->>'title',location.id,item->>'interactionType',item->>'seed',
  item->'affordances',array[item->>'interactionType','eos-meridian'],'{}'::text[],item->>'minStage',item->>'contentLevel',
  case when item->>'contentLevel' in('mature','explicit') then 2 else null end,array['co_present','date','plan'],true,1,2,
  array['morning','afternoon','evening','late_night'],array[item->>'interactionType'],1,
  case when item->>'interactionType' in('mystery','relationship_choice') then 72 else 24 end,true,
  jsonb_build_object('source','eos_meridian_content_v1','neverDeclareUserAction',true,'neverMutateRelationshipDirectly',true)
from eos_beat_payload cross join lateral jsonb_array_elements(data) item
left join public.together_locations location on location.world_id='${WORLD_ID}'::uuid and location.slug=item->>'locationSlug'
on conflict(world_id,slug) do update set title=excluded.title,location_id=excluded.location_id,
  interaction_type=excluded.interaction_type,seed=excluded.seed,affordances=excluded.affordances,
  topic_tags=excluded.topic_tags,min_relationship_stage=excluded.min_relationship_stage,
  content_level=excluded.content_level,min_spice_level=excluded.min_spice_level,
  interaction_modes=excluded.interaction_modes,co_present_required=excluded.co_present_required,
  cooldown_hours=excluded.cooldown_hours,active=true,metadata=excluded.metadata,updated_at=now();

create temporary table eos_date_payload(data jsonb) on commit drop;
insert into eos_date_payload values(${sqlJson(dateScenes,'eos_dates')});
insert into public.together_date_templates(
  id,name,slug,world_id,location_id,description,hero_asset_key,phases,unlock_rules,entitlement_key,active,metadata
)
select ('4f000000-0000-4000-8012-'||lpad(ordinality::text,12,'0'))::uuid,item->>'title',item->>'slug',
  '${WORLD_ID}'::uuid,location.id,item->>'setup','eos-meridian-hero',
  jsonb_build_array(
    jsonb_build_object('id','arrival','title','Arrive','choices',jsonb_build_array(
      jsonb_build_object('id','lean-in','label','Lean into the plan'),jsonb_build_object('id','take-it-in','label','Take in the place'))),
    jsonb_build_object('id','conversation','title','Settle in','choices',jsonb_build_array(
      jsonb_build_object('id','ask-real','label','Ask something real'),jsonb_build_object('id','follow-mood','label','Follow the mood'))),
    jsonb_build_object('id','turn','title','Something changes','choices',jsonb_build_array(
      jsonb_build_object('id','stay','label','Stay a little longer'),jsonb_build_object('id','change-pace','label','Change the pace'))),
    jsonb_build_object('id','resolution','title','What you keep','choices','[]'::jsonb)),
  '{"familiarity":12,"trust":10,"allowed_stages":["acquaintance","friend","flirting","dating","exclusive","long_term"]}'::jsonb,
  'worlds.standard',true,jsonb_build_object('source','eos_meridian_content_v1','season',item->>'season','tone',item->>'tone')
from eos_date_payload cross join lateral jsonb_array_elements(data) with ordinality payload(item,ordinality)
join public.together_locations location on location.world_id='${WORLD_ID}'::uuid and location.slug=item->>'locationSlug'
on conflict(id) do update set name=excluded.name,slug=excluded.slug,world_id=excluded.world_id,
  location_id=excluded.location_id,description=excluded.description,hero_asset_key=excluded.hero_asset_key,
  phases=excluded.phases,unlock_rules=excluded.unlock_rules,entitlement_key=excluded.entitlement_key,
  active=true,metadata=excluded.metadata,updated_at=now();

update public.together_worlds set metadata=metadata||jsonb_build_object(
  'residentCompanionCount',${characters.length},'residentRosterStatus','ready','residentScheduleStatus','authored_weekly_v1',
  'socialGraphStatus','authored_v1','recurringEventCount',${recurringEvents.length},'storyArcCount',${storyArcs.length},
  'worldFactCount',${worldFacts.length},'dialogueOpportunityCount',${dialogueOpportunities.length},
  'interactionBeatCount',${interactionBeats.length},'nativeDateCount',${dateScenes.length},
  'residentPortraitStatus','primary_portraits_ready','mappedResidentPortraitCount',${characters.length}
),updated_at=now() where id='${WORLD_ID}'::uuid;

do $$
declare schedule_count int;complete_days int;invalid_locations int;edge_count int;place_profile_count int;
  event_count int;story_count int;fact_count int;opportunity_count int;beat_count int;date_count int;
begin
  select count(*) into schedule_count from public.together_schedule_templates where character_version_id::text like '25000000-0000-4000-8012-%';
  select count(*) into complete_days from(
    select character_version_id,day_of_week from public.together_schedule_templates
    where character_version_id::text like '25000000-0000-4000-8012-%'
    group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
  ) days;
  select count(*) into invalid_locations from public.together_schedule_templates schedule
    left join public.together_locations location on location.id=schedule.location_id
    where schedule.character_version_id::text like '25000000-0000-4000-8012-%'
      and schedule.location_id is not null and location.world_id is distinct from '${WORLD_ID}'::uuid;
  select count(*) into edge_count from public.together_character_relationship_edges where world_id='${WORLD_ID}'::uuid;
  select count(*) into place_profile_count from public.together_character_place_profiles where character_version_id::text like '25000000-0000-4000-8012-%';
  select count(*) into event_count from public.together_event_templates where world_id='${WORLD_ID}'::uuid and active;
  select count(*) into story_count from public.together_story_arc_templates where specific_world_id='${WORLD_ID}'::uuid and active;
  select count(*) into fact_count from public.together_world_facts where world_id='${WORLD_ID}'::uuid and active;
  select count(*) into opportunity_count from public.together_dialogue_opportunities where world_id='${WORLD_ID}'::uuid and active;
  select count(*) into beat_count from public.together_scene_interaction_beats where world_id='${WORLD_ID}'::uuid and active;
  select count(*) into date_count from public.together_date_templates where world_id='${WORLD_ID}'::uuid and active;
  if schedule_count<>${schedules.length} or complete_days<>${characters.length*7} or invalid_locations<>0
    or edge_count<${socialEdges.length*2} or place_profile_count<>${characters.length} or event_count<>${recurringEvents.length}
    or story_count<>${storyArcs.length} or fact_count<>${worldFacts.length} or opportunity_count<>${dialogueOpportunities.length}
    or beat_count<>${interactionBeats.length} or date_count<>${dateScenes.length} then
    raise exception 'Eos simulation validation failed: schedules %, days %, invalid %, edges %, profiles %, events %, stories %, facts %, opportunities %, beats %, dates %',
      schedule_count,complete_days,invalid_locations,edge_count,place_profile_count,event_count,story_count,fact_count,opportunity_count,beat_count,date_count;
  end if;
end $$;
commit;
`;

const integrationPayload=characters.map(item=>({templateId:item.templateId,versionId:item.versionId,biography:item.biography,firstMeeting:item.firstMeeting,identityFacts:item.characterBible.identityFacts,xaiVoiceId:item.voiceProfile.xaiVoiceId}));
const integrationMigration=`-- Eos Meridian cross-modality hardening for calls, media, groups, and first meetings.
begin;

create temporary table eos_integration_payload(data jsonb) on commit drop;
insert into eos_integration_payload values(${sqlJson(integrationPayload,'eos_integration')});

update public.together_character_templates template set
  biography=item->>'biography',
  first_meeting=jsonb_build_object('opener',item->'firstMeeting'->>'opener','location_id',meeting.id),
  updated_at=now()
from eos_integration_payload payload cross join lateral jsonb_array_elements(payload.data) item
join public.together_locations meeting on meeting.world_id='${WORLD_ID}'::uuid and meeting.slug=item->'firstMeeting'->>'locationSlug'
where template.id=(item->>'templateId')::uuid;

update public.together_character_versions version set
  character_bible=jsonb_set(coalesce(version.character_bible,'{}'::jsonb),'{identityFacts}',item->'identityFacts',true),
  voice_config=jsonb_set(coalesce(version.voice_config,'{}'::jsonb),'{providerMappings}',
    coalesce(version.voice_config->'providerMappings','{}'::jsonb)||jsonb_build_object('xai',item->>'xaiVoiceId'),true),
  updated_at=now()
from eos_integration_payload payload cross join lateral jsonb_array_elements(payload.data) item
where version.id=(item->>'versionId')::uuid;

update public.together_character_voice_profiles profile set
  provider_mappings=coalesce(profile.provider_mappings,'{}'::jsonb)||jsonb_build_object('xai',item->>'xaiVoiceId'),
  active=true,updated_at=now()
from eos_integration_payload payload cross join lateral jsonb_array_elements(payload.data) item
where profile.character_template_id=(item->>'templateId')::uuid;

do $$
declare ready_count int;voice_count int;group_count int;first_meeting_count int;
begin
  select count(*) into ready_count from public.together_character_versions
  where id::text like '25000000-0000-4000-8012-%'
    and coalesce((visual_identity->>'fictional')::boolean,false)
    and coalesce((content_boundaries->>'allows_romance')::boolean,false)
    and coalesce((content_boundaries->>'allows_explicit')::boolean,false);
  select count(*) into voice_count from public.together_character_voice_profiles
  where character_template_id::text like '24000000-0000-4000-8012-%' and active
    and provider_mappings->>'xai' in('eve','ara','sal','leo','rex');
  select count(*) into group_count from(
    select version.id from public.together_character_versions version
    join public.together_character_world_presence presence on presence.character_version_id=version.id
      and presence.world_id='${WORLD_ID}'::uuid and presence.presence_type='resident'
    where version.id::text like '25000000-0000-4000-8012-%'
    group by version.id having count(*)=1
  ) grouped;
  select count(*) into first_meeting_count from public.together_character_templates template
  join public.together_locations location on location.id=(template.first_meeting->>'location_id')::uuid
  where template.id::text like '24000000-0000-4000-8012-%' and location.world_id='${WORLD_ID}'::uuid
    and template.first_meeting->>'opener' !~ '\\m(she|he|they) routine\\M';
  if ready_count<>${characters.length} or voice_count<>${characters.length} or group_count<>${characters.length} or first_meeting_count<>${characters.length} then
    raise exception 'Eos integration hardening failed: media %, voices %, groups %, first meetings %',ready_count,voice_count,group_count,first_meeting_count;
  end if;
end $$;

commit;
`;

const expansionMigration=`-- Eos Meridian cast expansion v2. Safe for environments where the original world migrations already ran.
${rosterMigration}

${simulationMigration}

${integrationMigration}

begin;
update public.together_worlds
set metadata=coalesce(metadata,'{}'::jsonb)||${sqlJson({
  residentCompanionCount:characters.length,
  residentRosterVersion:2,
  residentScheduleStatus:'authored_weekly_v2',
  socialGraphStatus:'authored_v2',
  residentPortraitStatus:'primary_and_gallery_portraits_ready',
  mappedResidentPortraitCount:characters.length,
  recurringEventCount:recurringEvents.length,
  storyArcCount:storyArcs.length,
  youngAdultCastExpansion:true,
},'eos_cast_v2_meta')},updated_at=now()
where id='${WORLD_ID}'::uuid;
commit;
`;

const locationSeeds=placePayload.map(item=>`  location(${JSON.stringify({index:item.index,parent:item.parentIndex??undefined,district:item.parentIndex?locations.find(candidate=>candidate.index===item.parentIndex)?.name:undefined,name:item.name,slug:item.slug,description:item.description,category:item.category,type:item.locationType,activities:item.activities,hours:item.hours,backstory:item.backstory,socialTexture:item.socialTexture,visualAnchors:item.visualAnchors})}),`).join('\n');
const appWorldFile=`import type{Location,LocationType,World}from'../types';
import{locationSeedLore}from'./location-bible';

export const EOS_MERIDIAN_WORLD_ID='${WORLD_ID}';
export const EOS_MERIDIAN_ARRIVAL_ID='${arrivalId}';
export const EOS_MERIDIAN_CANONICAL_LORE=${JSON.stringify(world.canonicalLore)} as const;
export const eosMeridianCharacterSlugs=${JSON.stringify(characters.map(item=>item.slug))} as const;
export const eosMeridianVoiceAssignments=${JSON.stringify(characters.map(item=>({slug:item.slug,voiceKey:item.voiceProfile.voiceKey,xaiVoiceId:item.voiceProfile.xaiVoiceId})))} as const;

export const eosMeridianWorld:World={
  id:EOS_MERIDIAN_WORLD_ID,slug:'eos-meridian',name:'Eos Meridian',description:${JSON.stringify(world.description)},
  hero_asset_key:'eos-meridian-hero',access_type:'subscription',entitlement_key:'worlds.standard',timezone:'UTC',sort_order:110,featured:true,published:true,
  visual_context:${JSON.stringify(world.visualContext)},
  metadata:${JSON.stringify({releaseWave:11,early_access:true,releaseStatus:'playable',contentStatus:'complete_world_v1',locationCatalogStatus:'ready',residentRosterStatus:'ready',photoStatus:'hero_ready',locationPhotoStatus:'ready',mappedLocationPhotoCount:locations.length,locationCount:locations.length,districtCount:6,publicPlaceCount:locations.length-6,residentCompanionCount:characters.length,residentScheduleStatus:'authored_weekly_v1',socialGraphStatus:'authored_v1',residentPortraitStatus:'primary_portraits_ready',mappedResidentPortraitCount:characters.length,recurringEventCount:recurringEvents.length,storyArcCount:storyArcs.length,worldFactCount:worldFacts.length,dialogueOpportunityCount:dialogueOpportunities.length,interactionBeatCount:interactionBeats.length,nativeDateCount:dateScenes.length,genreTags:['grounded space colony','frontier romance','science mystery','political independence'],tagline:world.tagline,relationshipFantasy:world.relationshipFantasy,centralQuestion:world.centralQuestion,approximatePopulation:24000,colonyAgeYears:38,gravityRatio:.83,scheduleClock:'user_local',canonicalLore:world.canonicalLore})},
  default_arrival_location_id:EOS_MERIDIAN_ARRIVAL_ID,world_role:'home',social_rhythm:'balanced',dominant_dayparts:['morning','evening','late_night'],
  relationship_themes:['trust as practical care','staying versus leaving','privacy inside a dense colony','work and identity','independence and belonging'],
  activity_families:['colony dining','artificial rain','port arrivals','low-gravity recreation','engineering and repair','aurora watching','research and discovery','nightlife and music'],
  mobility_style:'transit',weather_profile:{climate:'tidally locked frontier',states:['calm_twilight','red_dust_storm','aurora_peak','night_ice_cold','interior_rain_cycle'],outdoorBias:.34},
};

type EosLocationSeed={index:number;parent?:number;district?:string;name:string;slug:string;description:string;category:string;type:LocationType;activities:string[];hours?:Record<string,string>|null;backstory:string;socialTexture:string;visualAnchors:string[]};
const eosLocationId=(index:number)=>\`${LOCATION_PREFIX}\${String(index).padStart(12,'0')}\`;
const visualAvoid=${JSON.stringify(world.visualContext.avoid)};
function location(input:EosLocationSeed):Location{
  const district=input.district??input.name,districtNode=input.type==='district';
  return{id:eosLocationId(input.index),world_id:EOS_MERIDIAN_WORLD_ID,parent_location_id:input.parent?eosLocationId(input.parent):null,
    name:input.name,slug:input.slug,description:input.description,category:input.category,location_type:input.type,
    possible_activities:input.activities,hours:input.hours??undefined,visual_asset_key:\`eos-meridian-location-\${input.slug}\`,sort_order:input.index*10,
    canonical_visual_context:{canonicalPrompt:\`\${input.name}, \${district}, Eos Meridian. \${input.description} Photorealistic grounded human space-colony environment, believable pressure architecture, worn engineering, warm amber habitation against copper twilight or aurora-lit night, practical current clothing, no aliens, no sterile white spaceship sameness.\`,
      indoorOutdoor:['outdoor','landmark','district','transit'].includes(input.type)?'outdoor':'mixed',visualAnchors:[input.name,district,'Eos Meridian',...input.visualAnchors],avoid:visualAvoid},
    canonical_lore:locationSeedLore({world:'Eos Meridian',district,name:input.name,description:input.description,category:input.category,type:input.type,
      activities:input.activities,atmosphere:['grounded frontier science fiction','lived-in','shift-shaped'],sensory:['pressure ventilation, worn surfaces, and warm task lighting','fixed copper twilight or aurora reflections'],
      weather:['Red storms can close exterior routes.','Nightglass cold and aurora conditions change outdoor access.']}),
    metadata:{tags:input.activities,district:districtNode?true:district,photoStatus:'ready',imageSlotKey:\`eos-meridian-location-\${input.slug}\`,source:'eos_meridian_content_v1',backstory:input.backstory,socialTexture:input.socialTexture,userLocalClock:true}};
}

export const eosMeridianLocations:Location[]=[
${locationSeeds}
];
`;

await Promise.all([
  writeFile('supabase/migrations/202608270001_kivelle_eos_meridian_world_v1.sql',worldMigration),
  writeFile('supabase/migrations/202608270002_kivelle_eos_meridian_character_roster.sql',rosterMigration),
  writeFile('supabase/migrations/202608270003_kivelle_eos_meridian_simulation_v1.sql',simulationMigration),
  writeFile('supabase/migrations/202608270004_kivelle_eos_meridian_integration_hardening.sql',integrationMigration),
  writeFile('supabase/migrations/202608270005_kivelle_eos_meridian_cast_expansion_v2.sql',expansionMigration),
  writeFile('apps/together/src/worlds/eos-meridian.ts',appWorldFile),
]);

console.log(JSON.stringify({world:world.slug,locations:locations.length,characters:characters.length,schedules:schedules.length,
  socialEdges:socialEdges.length,events:recurringEvents.length,stories:storyArcs.length,facts:worldFacts.length,
  opportunities:dialogueOpportunities.length,beats:interactionBeats.length,dates:dateScenes.length},null,2));
