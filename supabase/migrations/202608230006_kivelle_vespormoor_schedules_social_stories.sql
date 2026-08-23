begin;

create temporary table vespormoor_schedule_characters on commit drop as
select
  template.id as template_id,template.slug,template.name,version.id as version_id,
  version.life_config->'occupation'->>'workPattern' as shift_kind,
  version.life_config->'occupation'->>'primaryLocationSlug' as work_slug,
  version.life_config->'occupation'->'activityVariants'->>0 as work_activity,
  version.life_config->'publicLocationSlugs'->>1 as leisure_slug,
  version.life_config->'publicLocationSlugs'->>2 as evening_slug,
  version.life_config->'publicLocationSlugs'->>3 as weekend_slug
from public.together_character_templates template
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version
where template.id::text like '22000000-0000-4000-8010-%';

delete from public.together_schedule_templates schedule
using vespormoor_schedule_characters character
where schedule.character_version_id=character.version_id;

create temporary table vespormoor_schedule_grid on commit drop as
select character.*,day_number as day_of_week,
  case when day_number between 1 and 5 then work_slug when day_number=6 then leisure_slug else weekend_slug end as day_location_slug,
  case when day_number in(5,6) then weekend_slug when day_number=0 then leisure_slug else evening_slug end as social_location_slug,
  case when day_number=5 then 'Friday variation' when day_number=6 then 'Saturday variation' when day_number=0 then 'Sunday variation' else 'Weekday routine' end as day_variant
from vespormoor_schedule_characters character
cross join generate_series(0,6) day_number;

with schedule_rows as(
  -- Early workers: opening shifts, outdoor work, and morning classes.
  select *,1 slot,330 start_minute,390 end_minute,null::text location_slug,'Starting early at home' activity,'limited' availability,0 energy_delta,'focused' mood,'home_morning' activity_key,'Home' display_location
  from vespormoor_schedule_grid where shift_kind in('early','academic_early')
  union all select *,2,420,780,day_location_slug,
    case when day_of_week between 1 and 5 then work_activity when day_of_week=6 then 'Taking a Saturday interest beyond work' else 'Keeping Sunday unhurried' end,
    case when day_of_week between 1 and 5 then 'busy' else 'available' end,-2,'focused','day_anchor',null
  from vespormoor_schedule_grid where shift_kind in('early','academic_early')
  union all select *,3,840,990,leisure_slug,'Taking an afternoon for a personal interest','available',1,'engaged','afternoon_interest',null
  from vespormoor_schedule_grid where shift_kind in('early','academic_early')
  union all select *,4,1080,1260,social_location_slug,'Meeting the evening on their own terms','available',0,'social','evening_social',null
  from vespormoor_schedule_grid where shift_kind in('early','academic_early')
  union all select *,5,1320,1410,null,'Winding down at home','busy',-1,'tired','home_evening','Home'
  from vespormoor_schedule_grid where shift_kind in('early','academic_early')

  union all
  -- Ordinary day workers still have a visible life before and after work.
  select *,1,390,480,null,'Starting the day at home','available',1,'easy','home_morning','Home'
  from vespormoor_schedule_grid where shift_kind='day'
  union all select *,2,480,900,day_location_slug,
    case when day_of_week between 1 and 5 then work_activity when day_of_week=6 then 'Following a Saturday routine away from work' else 'Taking a quiet Sunday outing' end,
    case when day_of_week between 1 and 5 then 'busy' else 'available' end,-2,'focused','day_anchor',null
  from vespormoor_schedule_grid where shift_kind='day'
  union all select *,3,930,1050,leisure_slug,'Taking a late-afternoon personal break','available',1,'easy','afternoon_interest',null
  from vespormoor_schedule_grid where shift_kind='day'
  union all select *,4,1110,1260,social_location_slug,'Spending the evening out in Vespormoor','available',0,'social','evening_social',null
  from vespormoor_schedule_grid where shift_kind='day'
  union all select *,5,1320,1410,null,'Having private time at home','busy',-1,'calm','home_evening','Home'
  from vespormoor_schedule_grid where shift_kind='day'

  union all
  -- Academic days move through real class/research, study, and social spaces.
  select *,1,390,450,null,'Getting ready for campus at home','limited',0,'focused','home_morning','Home'
  from vespormoor_schedule_grid where shift_kind='academic'
  union all select *,2,480,660,day_location_slug,
    case when day_of_week between 1 and 5 then work_activity when day_of_week=6 then 'Following a Saturday campus interest' else 'Taking Sunday away from classes' end,
    case when day_of_week between 1 and 5 then 'busy' else 'available' end,-2,'focused','academic_morning',null
  from vespormoor_schedule_grid where shift_kind='academic'
  union all select *,3,720,900,leisure_slug,'Studying, researching, or working on a personal project','limited',-1,'focused','academic_afternoon',null
  from vespormoor_schedule_grid where shift_kind='academic'
  union all select *,4,960,1110,social_location_slug,'Catching up with campus friends or taking an evening shift','available',1,'social','campus_evening',null
  from vespormoor_schedule_grid where shift_kind='academic'
  union all select *,5,1170,1290,null,'Resetting at home after campus','available',0,'easy','home_reset','Home'
  from vespormoor_schedule_grid where shift_kind='academic'
  union all select *,6,1320,1410,null,'Sleeping at home','busy',-2,'sleep','sleep','Home'
  from vespormoor_schedule_grid where shift_kind='academic'

  union all
  -- Late academic/research and late-day creative work.
  select *,1,420,510,null,'Taking a slower morning at home','available',1,'easy','home_morning','Home'
  from vespormoor_schedule_grid where shift_kind in('late_day','late_academic')
  union all select *,2,600,780,leisure_slug,'Handling study, preparation, or a personal interest','limited',0,'focused','late_morning',null
  from vespormoor_schedule_grid where shift_kind in('late_day','late_academic')
  union all select *,3,840,1050,day_location_slug,
    case when day_of_week between 1 and 5 then work_activity else 'Following a weekend interest away from work' end,
    case when day_of_week between 1 and 5 then 'busy' else 'available' end,-2,'focused','late_day_anchor',null
  from vespormoor_schedule_grid where shift_kind in('late_day','late_academic')
  union all select *,4,1080,1230,social_location_slug,'Moving into the evening around friends or regulars','available',1,'social','evening_social',null
  from vespormoor_schedule_grid where shift_kind in('late_day','late_academic')
  union all select *,5,1230,1410,case when shift_kind='late_academic' and day_of_week between 1 and 6 then work_slug else social_location_slug end,
    case when shift_kind='late_academic' and day_of_week between 1 and 6 then work_activity else 'Taking a late Vespormoor evening' end,
    case when shift_kind='late_academic' then 'busy' else 'available' end,-1,'intent','late_evening',null
  from vespormoor_schedule_grid where shift_kind in('late_day','late_academic')

  union all
  -- Evening jobs preserve their daytime hobbies and stay active through midnight.
  select *,1,0,120,work_slug,'Finishing the late shift','busy',-2,'focused','occupation_after_midnight',null
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')
  union all select *,2,420,540,null,'Taking a private morning at home','available',1,'easy','home_morning','Home'
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')
  union all select *,3,600,780,case when shift_kind='evening_academic' then work_slug else leisure_slug end,
    case when shift_kind='evening_academic' then 'Attending classes before the evening shift' else 'Taking time for a daytime interest' end,
    'available',0,'engaged','day_interest',null
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')
  union all select *,4,840,1020,null,'Resetting at home before work','limited',0,'focused','pre_shift_home','Home'
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')
  union all select *,5,1020,1230,work_slug,work_activity,'busy',-2,'focused','occupation_evening',null
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')
  union all select *,6,1230,1440,work_slug,'Working through the late crowd','busy',-2,'social','occupation_late',null
  from vespormoor_schedule_grid where shift_kind in('evening','evening_academic')

  union all
  -- Dedicated night workers sleep late, prepare in private, and own midnight.
  select *,1,0,180,work_slug,'Working through the after-midnight crowd','busy',-2,'focused','occupation_after_midnight',null
  from vespormoor_schedule_grid where shift_kind in('night','overnight')
  union all select *,2,300,780,null,'Sleeping at home after the night shift','busy',-2,'sleep','sleep','Home'
  from vespormoor_schedule_grid where shift_kind in('night','overnight')
  union all select *,3,840,1020,null,'Keeping the afternoon private at home','limited',1,'quiet','private_daytime','Home'
  from vespormoor_schedule_grid where shift_kind in('night','overnight')
  union all select *,4,1020,1260,case when day_of_week in(0,6) then leisure_slug else work_slug end,
    case when day_of_week in(0,6) then 'Taking a weekend interest before the night begins' else 'Preparing the venue for the night' end,
    'limited',0,'focused','night_prep',null
  from vespormoor_schedule_grid where shift_kind in('night','overnight')
  union all select *,5,1320,1440,work_slug,work_activity,'busy',-2,'social','occupation_night',null
  from vespormoor_schedule_grid where shift_kind in('night','overnight')
), located as(
  select schedule_rows.*,location.id as location_id
  from schedule_rows
  left join public.together_locations location
    on location.world_id='10000000-0000-4000-8000-000000000010' and location.slug=schedule_rows.location_slug
)
insert into public.together_schedule_templates(
  character_version_id,day_of_week,start_minute,end_minute,location_id,
  activity,availability,energy_delta,mood_influence,variation_weight,metadata
)
select version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood,1,
  jsonb_strip_nulls(jsonb_build_object(
    'source','vespormoor_authored_schedule_v1','scheduleMode','authored','profileVisibility','visible',
    'displayLocation',display_location,'activityKey',activity_key,'priority',case when availability='busy' then 'hard_obligation' else 'recurring_routine' end,
    'dayVariant',day_variant,'slot',slot,'worldSlug','vespormoor'
  ))
from located
on conflict(character_version_id,day_of_week,start_minute) do update set
  end_minute=excluded.end_minute,location_id=excluded.location_id,activity=excluded.activity,
  availability=excluded.availability,energy_delta=excluded.energy_delta,mood_influence=excluded.mood_influence,
  variation_weight=excluded.variation_weight,metadata=excluded.metadata;

-- Replace only stale generated/recurring materialization for this roster.
delete from public.together_character_schedule_events event
using public.together_character_instances instance
where event.character_instance_id=instance.id
  and instance.character_version_id::text like '23000000-0000-4000-8010-%'
  and event.source in('generated','recurring') and event.starts_at>=date_trunc('day',now());

-- Authored social circles become limited knowledge edges. Characters know
-- close contacts directly; no cross-world or all-roster omniscience is created.
with expanded as(
  select source.id source_id,target.id target_id,source.slug source_slug,target.slug target_slug
  from public.together_character_templates source
  join public.together_character_versions version on version.character_template_id=source.id and version.version=source.current_published_version
  cross join lateral jsonb_array_elements_text(version.default_social_graph) edge(target_slug)
  join public.together_character_templates target on target.slug=edge.target_slug
  where source.id::text like '22000000-0000-4000-8010-%' and target.id::text like '22000000-0000-4000-8010-%'
),directed as(
  select * from expanded union select target_id,source_id,target_slug,source_slug from expanded
),ranked as(
  select *,((hashtext(source_slug||':'||target_slug)::bigint&2147483647)%4)::int as relationship_rank from directed
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000010'::uuid,source_id,target_id,
  case relationship_rank when 0 then 'close_friend' when 1 then 'friend' when 2 then 'acquaintance' else 'colleague' end,
  case relationship_rank when 0 then 82 when 1 then 72 when 2 then 57 else 64 end,
  case relationship_rank when 0 then 80 when 1 then 69 when 2 then 48 else 61 end,
  'They belong to an authored Vespormoor social circle, but closeness and what they share remain relationship-specific.',
  jsonb_build_object('source','vespormoor_roster_v1','memorySharing','event_only','knowledgeScope','relationship_and_district')
from ranked where source_id<>target_id
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,
  history=excluded.history,metadata=excluded.metadata,updated_at=now();

create temporary table vespormoor_special_edges(
  source_slug text,target_slug text,relationship_type text,affinity int,trust int,history text
) on commit drop;
insert into vespormoor_special_edges values
  ('evelyn-harrow','priya-raman','close_friend',88,89,'Evelyn and Priya trade books, tea, and honest advice without demanding disclosure.'),
  ('clara-whitmore','adrian-bell','friendly_rival',74,78,'Their neighboring hospitality businesses sustain an affectionate rivalry over regulars and recipes.'),
  ('adrian-bell','roxy-bell','cousins',81,84,'Adrian and Roxy are cousins who protect each other while pretending not to exchange Raven Ward gossip.'),
  ('mirelle-voss','vivienne-blackwood','old_family_allies',76,68,'Mirelle and Vivienne share old-family obligations and a careful disagreement about the Covenant.'),
  ('elara-vale','julian-ashcroft','mutual_distrust',46,31,'Julian doubts Elara''s claim to Vale House; Elara believes he knows more than his legal role explains.'),
  ('vivienne-blackwood','elara-vale','guarded_history',58,45,'Vivienne remembers a Vale family story that does not fit Elara''s apparent age.'),
  ('camille-laurent','naomi-okafor','close_friend',87,86,'Camille and Naomi protect one weekly dinner from work and old-family politics.'),
  ('adelaide-hawthorne','mateo-serrano','coworker_trust',79,88,'Adelaide and Mateo trust each other with difficult horses and disagree competitively about training.'),
  ('marina-costa','tomas-ferreira','exes',66,74,'Marina and Tomás ended a brief relationship well; the chemistry survives but neither treats it as a claim.'),
  ('hannah-mercer','owen-mercer','siblings',91,94,'Hannah and Owen are siblings who tease mercilessly and notice each other''s moods immediately.'),
  ('lyra-vane','owen-mercer','musical_tension',72,61,'Lyra and Owen share an uncanny musical understanding complicated by professional rivalry.'),
  ('jun-park','astrid-nygaard','research_colleagues',75,82,'Jun and Astrid compare lake and Observatory data while disagreeing about intuition as evidence.'),
  ('maya-bennett-vespormoor','maeve-kearney','close_friend',89,88,'Maya and Maeve became close during first-year chaos and still protect each other''s private doubts.'),
  ('zuri-campbell','rafael-ortega','study_partners',84,80,'Zuri and Rafael are Observatory partners surrounded by a crush rumor neither confirms.'),
  ('elodie-marchand','dorian-bellamy','friendly_rival',71,68,'Elodie and Dorian compete over taste, attention, and who can tell the better story at Rookery House.'),
  ('celeste-moreau','isabella-reyes-vespormoor','trusted_colleagues',83,87,'Celeste and Isabella share carefully bounded access to restricted folklore holdings.'),
  ('rowan-hale','callum-reid','mentor_tension',73,76,'Callum trained Rowan; they trust each other in emergencies and disagree about how much truth reports should contain.'),
  ('amara-nwosu','willow-thorne','close_friend',88,91,'Amara and Willow share plant knowledge, meals, and strict respect for one another''s private rites.'),
  ('dahlia-kane','katya-morozova','professional_rivals',62,57,'Dahlia and Katya compete for Raven Ward influence while protecting the ward from outsiders.'),
  ('nia-holloway','lena-kovacs','close_friend',90,88,'Nia designs Lena''s stage art; Lena is one of few people allowed to interrupt Nia while drawing.'),
  ('roxy-bell','luca-ferraro','after_hours_friends',79,75,'Roxy and Luca trade late-shift food and the harmless version of what their customers did.');

update vespormoor_special_edges
set source_slug=case when source_slug='camille-laurent' then 'camille-laurent-vespormoor' else source_slug end,
    target_slug=case when target_slug='camille-laurent' then 'camille-laurent-vespormoor' else target_slug end;

with directed as(
  select * from vespormoor_special_edges
  union all select target_slug,source_slug,relationship_type,affinity,trust,history from vespormoor_special_edges
)
insert into public.together_character_relationship_edges(
  world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata
)
select '10000000-0000-4000-8000-000000000010',source.id,target.id,edge.relationship_type,edge.affinity,edge.trust,edge.history,
  jsonb_build_object('source','vespormoor_special_edges_v1','memorySharing','event_only','authored',true)
from directed edge
join public.together_character_templates source on source.slug=edge.source_slug
join public.together_character_templates target on target.slug=edge.target_slug
on conflict(world_id,source_template_id,target_template_id) do update set
  relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,
  history=excluded.history,metadata=excluded.metadata,updated_at=now();

-- Recurring ambient events use the existing event system. Recurrence is
-- structured metadata consumed by the life-event scheduler; it is not prompt lore.
create temporary table vespormoor_events(
  event_index int,name text,event_type text,location_slug text,participant_slugs text[],probability numeric,
  duration_minutes int,narrative_summary text,category text,tone text,recurrence jsonb
) on commit drop;
insert into vespormoor_events values
  (1,'Vespormoor Nocturne Night','social','nocturne',array['dahlia-kane','nia-holloway','lena-kovacs','roxy-bell','zuri-campbell','rafael-ortega'],.72,240,'Dahlia''s Friday set pulls Raven Ward regulars and university friends into Nocturne.','social','exciting','{"frequency":"weekly","weekday":5,"startMinute":1320}'::jsonb),
  (2,'Vesper Square Saturday Market','world','vesper-square',array['priya-raman','clara-whitmore','evelyn-harrow','maya-bennett-vespormoor','maeve-kearney','elodie-marchand','keira-sullivan'],.86,240,'Saturday stalls fill Vesper Square with food, books, flowers, students, and neighborhood gossip.','world','positive','{"frequency":"weekly","weekday":6,"startMinute":480}'::jsonb),
  (3,'Stillwater Sessions','social','stillwater-house',array['owen-mercer','lyra-vane','marina-costa','hannah-mercer','jun-park','tomas-ferreira'],.78,180,'Owen''s Saturday piano set brings Lakeward together as evening settles over the water.','social','romantic','{"frequency":"weekly","weekday":6,"startMinute":1140}'::jsonb),
  (4,'High Gardens Open Afternoon','world','high-gardens',array['maeve-kearney','lina-moreno','hana-watanabe','isabella-reyes-vespormoor','celeste-moreau'],.7,180,'The university opens the High Gardens to town residents on Sunday afternoon.','world','positive','{"frequency":"weekly","weekday":0,"startMinute":780}'::jsonb),
  (5,'Moonwake Evening','social','moonwake-baths',array['selene-morcant','mirelle-voss','vivienne-blackwood','camille-laurent','julian-ashcroft'],.34,240,'Moonwake Baths hosts a discreet monthly evening of music, food, and lakeside bathing.','celebration','romantic','{"frequency":"monthly","ordinal":1,"weekday":6,"startMinute":1140}'::jsonb),
  (6,'Black Lantern Rain Crowd','weather','black-lantern',array['evelyn-harrow','priya-raman','clara-whitmore','adrian-bell','marcus-reed','mateo-serrano'],.26,150,'Heavy rain sends Old Vesper regulars into the Black Lantern and rearranges the evening naturally.','weather','mundane','{"frequency":"weather_condition","weather":["rain","heavy_rain"],"startRange":[960,1260]}'::jsonb);

update vespormoor_events
set participant_slugs=array_replace(participant_slugs,'camille-laurent','camille-laurent-vespormoor');

insert into public.together_event_templates(
  id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,duration_minutes,
  narrative_summary,state_effects,user_visibility,proactive_eligible,metadata,active,category,tone,scale,content_level,conditions,followups
)
select ('3a000000-0000-4000-8010-'||lpad(event_index::text,12,'0'))::uuid,name,event_type,
  '10000000-0000-4000-8000-000000000010',location.id,
  array(select template.id from public.together_character_templates template where template.slug=any(participant_slugs)),
  .58,probability,duration_minutes,narrative_summary,'{}'::jsonb,'contextual',true,
  jsonb_build_object('worldSlug','vespormoor','worldEvent',true,'recurrence',recurrence,'scheduleAware',true),
  true,category,tone,'normal','standard',jsonb_build_object('recurrence',recurrence),'{}'::text[]
from vespormoor_events event
join public.together_locations location on location.world_id='10000000-0000-4000-8000-000000000010' and location.slug=event.location_slug
on conflict(id) do update set name=excluded.name,event_type=excluded.event_type,default_location_id=excluded.default_location_id,
  participant_template_ids=excluded.participant_template_ids,probability=excluded.probability,duration_minutes=excluded.duration_minutes,
  narrative_summary=excluded.narrative_summary,metadata=excluded.metadata,conditions=excluded.conditions,active=true,updated_at=now();

-- Dialogue-driven story chains reuse the canonical story graph system. Their
-- chapters encode people and places as eligibility hints, never fetch quests.
create temporary table vespormoor_story_arcs(
  slug text,title text,lead_slugs text[],location_slugs text[],chapter_seeds text[],min_stage text
) on commit drop;
insert into vespormoor_story_arcs values
  ('vespormoor-future-book','The Future Book',array['evelyn-harrow','marcus-reed','isabella-reyes-vespormoor'],array['morrow-and-quill','blackglass-library','vesper-house'],array['Evelyn reveals a book describing an event that has not happened.','Marcus finds a binding detail that should not exist.','Isabella locates a missing catalogue trail.','A careful visit toward Vesper House makes the prediction personally relevant.'],'acquaintance'),
  ('vespormoor-beneath-lake','Beneath Lake Vesper',array['jun-park','tomas-ferreira','lyra-vane','owen-mercer'],array['vesper-boatworks','whisper-dock','sunken-chapel'],array['Jun shares an impossible lake reading.','Tomás connects it to something recovered while diving.','Lyra and Owen recognize the same pattern as music.','Low water exposes a new part of the Sunken Chapel.'],'friend'),
  ('vespormoor-missing-corridors','The Missing Corridors',array['lina-moreno','dorian-bellamy','isabella-reyes-vespormoor'],array['the-cloisters','blackglass-library','undercroft'],array['Lina shows a corridor absent from official plans.','Dorian recognizes it from a poem he should not know.','Isabella finds a deliberately altered plan.','The Undercroft offers a bounded chance to verify one route.'],'acquaintance'),
  ('vespormoor-observatory-signal','The Observatory Signal',array['zuri-campbell','rafael-ortega','astrid-nygaard'],array['observatory','blackglass-library'],array['Zuri notices a pulse in the Observatory signal.','Rafael discovers his electrical affinity answering it.','Astrid reveals that she predicted the next transmission.','A late-night observation triangulates the signal below the horizon.'],'friend'),
  ('vespormoor-vale-return','The Vale Return',array['elara-vale','vivienne-blackwood','julian-ashcroft'],array['vale-house','blackwood-estate','vesper-house'],array['Elara offers one verifiable fact about Vale House.','Vivienne reveals why the Vale name unsettles her family.','Julian exposes a legal inconsistency in the return.','Vesper House responds to the Vale history without explaining itself.'],'friend'),
  ('vespormoor-northern-silence','The Northern Silence',array['rowan-hale','callum-reid','freya-lind'],array['morrow-vale-ranger-station','thornwood-trailhead','standing-stones'],array['Rowan describes the wildlife silence without dramatizing it.','Callum finds an erased historical report.','Freya supplies visual evidence no camera should repeat.','A careful Standing Stones patrol reveals the silence is moving.'],'acquaintance'),
  ('vespormoor-old-portrait','The Old Portrait',array['elodie-marchand','hana-watanabe','seraphine-orison'],array['grand-hall','blackglass-library','saint-orison-chapel'],array['Elodie notices the portrait changing between visits.','Hana experiences a bounded psychometric impression.','Seraphine recognizes a detail omitted from chapel records.','The chapel archive reframes the portrait without fully solving it.'],'friend');

insert into public.together_story_arc_templates(
  slug,title,category,eligible_template_ids,min_relationship_stage,prerequisites,chapters,
  cooldown_days,repeatable,priority,active,world_scope,specific_world_id
)
select story.slug,story.title,'discovery',
  array(select template.id from public.together_character_templates template where template.slug=any(story.lead_slugs)),story.min_stage,
  jsonb_build_object('worldSlug','vespormoor','characterSlugs',to_jsonb(story.lead_slugs),'locationSlugs',to_jsonb(story.location_slugs),'dialogueDriven',true,'requiresCorrectPlaceWhenAdvancing',true),
  (select jsonb_agg(jsonb_build_object(
    'id','chapter-'||ordinality,'title',case ordinality when 1 then 'A strange detail' when 2 then 'Another account' when 3 then 'The pattern sharpens' else 'A threshold' end,
    'userVisibility',case when ordinality=1 then 'contextual' else 'visible' end,'mayTriggerProactiveMessage',true,
    'mayCreateMoment',ordinality=array_length(story.chapter_seeds,1),'narrativeSeed',seed,
    'minimumHoursBeforeNext',case when ordinality=1 then 12 else 24 end,
    'eligibleCharacterSlugs',to_jsonb(story.lead_slugs),'eligibleLocationSlugs',to_jsonb(story.location_slugs)
  ) order by ordinality) from unnest(story.chapter_seeds) with ordinality chapter(seed,ordinality)),
  90,false,'major',true,'specific','10000000-0000-4000-8000-000000000010'
from vespormoor_story_arcs story
on conflict(slug) do update set title=excluded.title,category=excluded.category,
  eligible_template_ids=excluded.eligible_template_ids,min_relationship_stage=excluded.min_relationship_stage,
  prerequisites=excluded.prerequisites,chapters=excluded.chapters,world_scope='specific',
  specific_world_id=excluded.specific_world_id,active=true,updated_at=now();

update public.together_worlds set metadata=metadata||jsonb_build_object(
  'residentCompanionCount',45,'residentRosterStatus','ready','residentScheduleStatus','authored_weekly_v1',
  'socialGraphStatus','authored_v1','recurringEventCount',6,'storyArcCount',7,'residentPortraitStatus','slots_ready'
),updated_at=now() where id='10000000-0000-4000-8000-000000000010';

do $$
declare character_count int; incomplete_days int; invalid_schedule_locations int; edge_count int; event_count int; story_count int;
begin
  select count(*) into character_count from vespormoor_schedule_characters;
  select count(*) into incomplete_days from(
    select character.version_id,day_number
    from vespormoor_schedule_characters character cross join generate_series(0,6) day_number
    left join public.together_schedule_templates schedule on schedule.character_version_id=character.version_id and schedule.day_of_week=day_number
    group by character.version_id,day_number having count(schedule.id)<5
  ) incomplete;
  select count(*) into invalid_schedule_locations from public.together_schedule_templates schedule
    join vespormoor_schedule_characters character on character.version_id=schedule.character_version_id
    left join public.together_locations location on location.id=schedule.location_id
    where schedule.location_id is not null and location.world_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid;
  select count(*) into edge_count from public.together_character_relationship_edges where world_id='10000000-0000-4000-8000-000000000010';
  select count(*) into event_count from public.together_event_templates where world_id='10000000-0000-4000-8000-000000000010' and active=true;
  select count(*) into story_count from public.together_story_arc_templates where specific_world_id='10000000-0000-4000-8000-000000000010' and active=true;
  if character_count<>45 or incomplete_days<>0 or invalid_schedule_locations<>0 or edge_count<80 or event_count<6 or story_count<7 then
    raise exception 'Vespormoor simulation validation failed: characters %, incomplete days %, invalid locations %, edges %, events %, stories %',character_count,incomplete_days,invalid_schedule_locations,edge_count,event_count,story_count;
  end if;
end $$;

commit;
