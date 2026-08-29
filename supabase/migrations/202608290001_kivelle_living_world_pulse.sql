begin;

create table if not exists public.together_world_event_templates(
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null,
  event_type text not null,
  location_id uuid references public.together_locations(id) on delete set null,
  district_location_id uuid references public.together_locations(id) on delete set null,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  start_minute integer not null default 720 check(start_minute between 0 and 1439),
  duration_minutes integer not null default 120 check(duration_minutes between 15 and 1440),
  probability numeric(5,4) not null default 1 check(probability between 0 and 1),
  knowledge_scope text not null default 'public' check(knowledge_scope in('public','local','insider','private')),
  significance numeric(5,4) not null default .5 check(significance between 0 and 1),
  topic_tags text[] not null default '{}',
  activity_tags text[] not null default '{}',
  participant_selector jsonb not null default '{}'::jsonb,
  atmosphere text,
  weather jsonb not null default '{}'::jsonb,
  plan_affordances jsonb not null default '{}'::jsonb,
  weight numeric(8,3) not null default 1,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id,slug)
);

create table if not exists public.together_world_event_instances(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  template_id uuid not null references public.together_world_event_templates(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  location_id uuid references public.together_locations(id) on delete set null,
  district_location_id uuid references public.together_locations(id) on delete set null,
  local_date date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in('scheduled','active','completed','cancelled')),
  public_summary text not null,
  atmosphere text,
  weather jsonb not null default '{}'::jsonb,
  simulation_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at),
  unique(continuity_id,simulation_key)
);

create table if not exists public.together_world_event_participants(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  world_event_instance_id uuid not null references public.together_world_event_instances(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  role text not null default 'attendee',
  attendance_state text not null default 'expected' check(attendance_state in('expected','arrived','attended','cancelled','absent')),
  knowledge_detail text not null default 'full' check(knowledge_detail in('awareness','partial','full')),
  joined_at timestamptz,
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_event_instance_id,character_instance_id)
);

create index if not exists together_world_event_templates_retrieval_idx on public.together_world_event_templates(world_id,active,event_type);
create index if not exists together_world_event_templates_location_idx on public.together_world_event_templates(world_id,location_id) where active;
create index if not exists together_world_event_templates_topic_idx on public.together_world_event_templates using gin(topic_tags);
create index if not exists together_world_event_instances_window_idx on public.together_world_event_instances(user_id,continuity_id,world_id,starts_at,ends_at) where status<>'cancelled';
create index if not exists together_world_event_instances_location_idx on public.together_world_event_instances(continuity_id,location_id,starts_at) where status<>'cancelled';
create index if not exists together_world_event_participants_character_idx on public.together_world_event_participants(character_instance_id,created_at desc);

create or replace function public.kivelle_validate_world_event_instance() returns trigger language plpgsql set search_path=public as $$
declare v_owner uuid; v_world uuid; v_location_world uuid; v_district_world uuid;
begin
  select user_id into v_owner from public.together_continuities where id=new.continuity_id;
  select world_id into v_world from public.together_world_event_templates where id=new.template_id;
  if new.location_id is not null then select world_id into v_location_world from public.together_locations where id=new.location_id; end if;
  if new.district_location_id is not null then select world_id into v_district_world from public.together_locations where id=new.district_location_id; end if;
  if v_owner is null or v_owner<>new.user_id or v_world is null or v_world<>new.world_id or (new.location_id is not null and v_location_world<>new.world_id) or (new.district_location_id is not null and v_district_world<>new.world_id) then
    raise exception 'world event must remain inside one user continuity and world';
  end if;
  return new;
end; $$;
drop trigger if exists together_world_event_instance_validate on public.together_world_event_instances;
create trigger together_world_event_instance_validate before insert or update of user_id,continuity_id,template_id,world_id,location_id,district_location_id on public.together_world_event_instances for each row execute function public.kivelle_validate_world_event_instance();

create or replace function public.kivelle_validate_world_event_participant() returns trigger language plpgsql set search_path=public as $$
declare v_event_user uuid; v_event_continuity uuid; v_event_world uuid; v_character_user uuid; v_character_continuity uuid; v_character_world uuid;
begin
  select user_id,continuity_id,world_id into v_event_user,v_event_continuity,v_event_world from public.together_world_event_instances where id=new.world_event_instance_id;
  select instance.user_id,instance.continuity_id,template.world_id into v_character_user,v_character_continuity,v_character_world from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id where instance.id=new.character_instance_id;
  if v_event_user is null or v_character_user is null or v_event_user<>new.user_id or v_character_user<>new.user_id or v_event_continuity<>new.continuity_id or v_character_continuity<>new.continuity_id or v_event_world<>v_character_world then raise exception 'world event participant must remain inside one user continuity and world'; end if;
  return new;
end; $$;
drop trigger if exists together_world_event_participant_validate on public.together_world_event_participants;
create trigger together_world_event_participant_validate before insert or update of user_id,continuity_id,world_event_instance_id,character_instance_id on public.together_world_event_participants for each row execute function public.kivelle_validate_world_event_participant();

alter table public.together_world_event_templates enable row level security;
alter table public.together_world_event_instances enable row level security;
alter table public.together_world_event_participants enable row level security;
revoke all on public.together_world_event_templates from anon,authenticated;
drop policy if exists together_world_event_instances_own_read on public.together_world_event_instances;
create policy together_world_event_instances_own_read on public.together_world_event_instances for select to authenticated using(user_id=auth.uid());
drop policy if exists together_world_event_participants_own_read on public.together_world_event_participants;
create policy together_world_event_participants_own_read on public.together_world_event_participants for select to authenticated using(user_id=auth.uid());
grant select on public.together_world_event_instances,public.together_world_event_participants to authenticated;
grant select,insert,update,delete on public.together_world_event_templates,public.together_world_event_instances,public.together_world_event_participants to service_role;

alter table public.together_knowledge_transfers add column if not exists world_event_instance_id uuid references public.together_world_event_instances(id) on delete set null;
alter table public.together_knowledge_transfers add column if not exists source_message_id uuid references public.together_messages(id) on delete set null;
alter table public.together_knowledge_transfers add column if not exists source_conversation_id uuid references public.together_conversations(id) on delete set null;
alter table public.together_knowledge_transfers add column if not exists confidence numeric(5,4) not null default .8 check(confidence between 0 and 1);
alter table public.together_knowledge_transfers add column if not exists detail_level text not null default 'full' check(detail_level in('awareness','partial','full'));
alter table public.together_knowledge_transfers add column if not exists truth_mode text not null default 'canonical' check(truth_mode in('canonical','disputed','rumor'));
alter table public.together_knowledge_transfers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.together_knowledge_transfers drop constraint if exists together_knowledge_transfer_source_check;
alter table public.together_knowledge_transfers add constraint together_knowledge_transfer_source_check check(life_event_id is not null or scene_session_id is not null or world_event_instance_id is not null or source_message_id is not null) not valid;
alter table public.together_knowledge_transfers validate constraint together_knowledge_transfer_source_check;

alter table public.together_content_usage drop constraint if exists together_content_usage_content_kind_check;
alter table public.together_content_usage add constraint together_content_usage_content_kind_check check(content_kind in('event','arc','date','trip','photo','proactive','world_fact','dialogue_opportunity','interaction_beat','world_event'));

-- Cross-world minimum behavior packs. These ensure every current world can
-- participate in the runtime while bespoke packs are expanded independently.
with seeds(world_slug,slug,title,summary,event_type,weekdays,start_minute,duration_minutes,topic_tags,activity_tags,atmosphere,plan_affordances) as (values
('juniper-city','weekday-commute-pulse','The city is changing shifts','Transit, offices, cafés, and neighborhood streets are moving through the daily handoff.','city',array[1,2,3,4,5]::smallint[],450,120,array['commute','work','transit'],array['coffee','errands'],'Busy but familiar','{}'::jsonb),
('juniper-city','friday-city-night','Friday night in Juniper','Music rooms, restaurants, and the Riverwalk are filling for the evening.','nightlife',array[5]::smallint[],1110,300,array['nightlife','music','riverwalk'],array['dinner','live music','walk'],'Social and bright','{"reason":"Juniper is lively tonight."}'::jsonb),
('juniper-city','sunday-market-routine','Sunday market morning','Regulars are taking the slower route through the city market.','market',array[0]::smallint[],540,240,array['market','routine','food'],array['market','brunch'],'Slow and neighborly','{"reason":"The Sunday market is active."}'::jsonb),
('juniper-city','summer-river-evening','Riverwalk evening','The river paths are drawing walkers, runners, and small groups after work.','community',array[2,4,6]::smallint[],1050,180,array['river','outdoors'],array['walk','run'],'Open and easy','{"reason":"The Riverwalk is active this evening."}'::jsonb),
('juniper-city','gallery-late-hours','Gallery late hours','Several small exhibitions are keeping the arts district open later than usual.','culture',array[4]::smallint[],1020,240,array['art','gallery'],array['gallery','drinks'],'Curious and conversational','{"reason":"The gallery district has late hours."}'::jsonb),
('neon-kyo','transit-shift','Transit network shift','The city is moving through a high-volume transit window under dense public displays.','infrastructure',array[1,2,3,4,5]::smallint[],450,120,array['transit','city'],array['commute'],'Fast and saturated','{}'::jsonb),
('neon-kyo','raw-hour','Raw Hour','A voluntary privacy window is spreading through participating venues and devices.','culture',array[4]::smallint[],1260,60,array['privacy','raw hour'],array['conversation','offline'],'Unusually quiet','{"reason":"Participating venues are observing Raw Hour."}'::jsonb),
('neon-kyo','night-market-current','Night market current','Food stalls, independent makers, and small performances are drawing a late crowd.','market',array[5,6]::smallint[],1140,300,array['market','food','music'],array['street food','shopping'],'Electric and crowded','{"reason":"The night market is active."}'::jsonb),
('neon-kyo','ghost-window','Ghost Window','A scheduled blind interval is prompting private meetings and cautious movement.','privacy',array[2]::smallint[],1320,45,array['privacy','surveillance'],array['walk','conversation'],'Watchful and quiet','{}'::jsonb),
('neon-kyo','district-signal-maintenance','District signal maintenance','Authentication and navigation overlays are briefly less reliable in one part of the city.','infrastructure',array[3]::smallint[],600,150,array['technology','maintenance'],array['errands'],'Inconvenient but manageable','{}'::jsonb),
('vespormoor','rain-crowd','Rain gathers Old Vesper indoors','Heavy rain is moving foot traffic into cafés, pubs, and bookshops.','weather',array[1,3,5]::smallint[],990,210,array['rain','old vesper'],array['coffee','pub','books'],'Rainy and intimate','{"reason":"Rain is making the town unusually cozy indoors."}'::jsonb),
('vespormoor','university-lecture-cycle','High Estate lecture cycle','Public lectures and late library hours are bringing students and locals onto the High Estate.','university',array[2,4]::smallint[],900,240,array['university','lecture'],array['lecture','library'],'Academic and active','{"reason":"The High Estate has public programming today."}'::jsonb),
('vespormoor','nocturne-night','Nocturne Night','The Raven Ward is building toward a late DJ set and after-hours crowd.','nightlife',array[5]::smallint[],1320,300,array['nightlife','raven ward'],array['music','dancing'],'Dark and energetic','{"reason":"Nocturne has a major set tonight."}'::jsonb),
('vespormoor','vesper-market','Vesper Square market','Produce, books, remedies, and town gossip are sharing the square.','market',array[6]::smallint[],540,240,array['market','gossip'],array['market','coffee'],'Local and busy','{"reason":"Vesper Square market is open."}'::jsonb),
('vespormoor','lake-mist','Mist on Lake Vesper','A dense lake mist is slowing boats and quieting the waterfront.','weather',array[0,3]::smallint[],360,180,array['lake','mist'],array['walk'],'Still and uncertain','{}'::jsonb),
('northvale','morning-patrol-briefing','Mountain conditions briefing','Patrol, guides, and operators are reviewing routes and weather before the day opens.','operations',array[0,1,2,3,4,5,6]::smallint[],390,90,array['mountain','weather','patrol'],array['ski','work'],'Focused and practical','{}'::jsonb),
('northvale','lodge-evening','Lodge evening','Workers, locals, and visitors are settling into the main lodges after the mountain closes.','community',array[1,3,5,6]::smallint[],1050,240,array['lodge','community'],array['dinner','drinks'],'Warm and social','{"reason":"The lodges are lively after mountain close."}'::jsonb),
('northvale','weather-window','Clear-weather window','A short break in the weather is opening the best outdoor conditions of the day.','weather',array[2,4,6]::smallint[],600,180,array['weather','outdoors'],array['ski','hike'],'Bright and temporary','{"reason":"Conditions are especially good for a few hours."}'::jsonb),
('northvale','road-advisory','Mountain road advisory','Changing road conditions are affecting deliveries, shifts, and travel through the valley.','infrastructure',array[1,5]::smallint[],420,180,array['road','weather'],array['travel'],'Cautious and delayed','{}'::jsonb),
('northvale','community-market','Northvale community market','Local food, equipment, and seasonal goods have brought the valley together for the morning.','market',array[6]::smallint[],540,240,array['market','community'],array['shopping','coffee'],'Familiar and practical','{"reason":"The community market is active."}'::jsonb),
('eos-meridian','station-shift-change','Station shift change','Operations, research, and habitat crews are moving through a coordinated handoff.','operations',array[0,1,2,3,4,5,6]::smallint[],420,90,array['station','work'],array['work','coffee'],'Purposeful and busy','{}'::jsonb),
('eos-meridian','commons-meal','Commons meal service','The colony commons is becoming the rare place where most crews overlap.','community',array[0,1,2,3,4,5,6]::smallint[],1080,120,array['food','community'],array['dinner','conversation'],'Busy and communal','{"reason":"Multiple crews overlap at the commons now."}'::jsonb),
('eos-meridian','observation-window','Observation window','Orbital conditions are giving the observation decks an unusually clear view.','environment',array[2,5]::smallint[],1200,120,array['space','observation'],array['view','conversation'],'Quiet and expansive','{"reason":"The observation decks have a clear window tonight."}'::jsonb),
('eos-meridian','maintenance-cycle','Habitat maintenance cycle','One habitat sector is operating around a scheduled systems maintenance window.','infrastructure',array[3]::smallint[],600,180,array['maintenance','habitat'],array['work'],'Constrained but routine','{}'::jsonb),
('eos-meridian','hydroponics-open-hour','Hydroponics open hour','The growing bays are open for supervised visits during a low-load period.','community',array[0,6]::smallint[],840,120,array['plants','hydroponics'],array['walk','visit'],'Green and restorative','{"reason":"Hydroponics is open for visits."}'::jsonb)
)
insert into public.together_world_event_templates(world_id,slug,title,summary,event_type,weekdays,start_minute,duration_minutes,topic_tags,activity_tags,atmosphere,plan_affordances,metadata)
select world.id,seeds.slug,seeds.title,seeds.summary,seeds.event_type,seeds.weekdays,seeds.start_minute,seeds.duration_minutes,seeds.topic_tags,seeds.activity_tags,seeds.atmosphere,seeds.plan_affordances,jsonb_build_object('source','living_world_pulse_v1','behaviorPack',seeds.world_slug)
from seeds join public.together_worlds world on world.slug=seeds.world_slug
on conflict(world_id,slug) do update set title=excluded.title,summary=excluded.summary,event_type=excluded.event_type,weekdays=excluded.weekdays,start_minute=excluded.start_minute,duration_minutes=excluded.duration_minutes,topic_tags=excluded.topic_tags,activity_tags=excluded.activity_tags,atmosphere=excluded.atmosphere,plan_affordances=excluded.plan_affordances,active=true,updated_at=now();

-- Port Vervelle pilot: thirty grounded, location-aware recurring pulse events.
with pilot(slug,title,summary,event_type,location_slug,weekdays,start_minute,duration_minutes,probability,topic_tags,activity_tags,atmosphere,participant_slugs,reason) as (values
('harbor-wake','The harbor wakes','Fishing crews, café regulars, and early charters are setting Porto Vecchio in motion.','harbor','porto-marina',array[1,2,3,4,5,6]::smallint[],360,150,1.0,array['harbor','work'],array['coffee','harbor walk'],'Salt-bright and industrious',array['matteo-bellandi','rafael-silva']::text[],'The harbor is active early.'),
('fish-market-rush','Fish market rush','Cooks, crews, and locals are trading the morning catch and half the town''s newest gossip.','market','vervelle-fish-market',array[2,4,6]::smallint[],390,180,1.0,array['market','food','gossip'],array['market','breakfast'],'Busy and familiar',array['alessandro-moretti','elias-romano']::text[],'The fish market is busiest now.'),
('charter-weather-window','Charter weather window','Calm water has opened a reliable window for sailing lessons and coastal charters.','harbor','vervelle-sailing-house',array[1,3,5]::smallint[],540,240,.85,array['sailing','weather'],array['sailing','boat tour'],'Clear and inviting',array['matteo-bellandi']::text[],'Conditions are good for sailing.'),
('blue-lantern-acoustic','Blue Lantern acoustic set','A local acoustic set is drawing off-duty harbor workers into the tavern.','performance','blue-lantern',array[4]::smallint[],1200,210,1.0,array['music','harbor'],array['live music','drinks'],'Loose and neighborly',array['idris-benali']::text[],'The Blue Lantern has live music tonight.'),
('harbor-steps-sunset','Sunset on the Harbor Steps','Musicians, couples, and tired crews are lingering as the harbor turns gold.','community','harbor-steps',array[2,5,6]::smallint[],1110,150,.9,array['sunset','harbor'],array['sunset','conversation'],'Warm and unhurried',array['matteo-bellandi','elias-romano']::text[],'The Harbor Steps are especially lively at sunset.'),
('bakery-morning-line','Forno Bellini morning line','The bakery queue is turning breakfast errands into a social hour.','community','forno-bellini',array[0,1,3,5]::smallint[],450,120,.9,array['bakery','routine'],array['coffee','pastry'],'Warm and conversational',array['nico-valenti']::text[],'Forno Bellini is in its morning rhythm.'),
('piazza-market-day','Piazza market day','Food, flowers, books, and familiar faces have taken over the central square.','market','piazza-aurelia',array[6]::smallint[],540,270,1.0,array['market','community'],array['market','people watching'],'Colorful and busy',array['nico-valenti','alessandro-moretti']::text[],'The Piazza market is running today.'),
('civic-public-meeting','Public meeting at Palazzo Civico','A restoration and waterfront planning session is drawing unusually strong local interest.','civic','palazzo-civico',array[2]::smallint[],1080,150,.75,array['politics','development'],array['public meeting'],'Serious and attentive',array['marco-de-santis','elias-romano']::text[],'A public planning meeting is happening tonight.'),
('bookshop-courtyard-reading','Courtyard reading','A visiting writer and local readers are gathering in Libreria Vervelle''s shaded courtyard.','culture','libreria-vervelle',array[3]::smallint[],1050,120,.8,array['books','culture'],array['reading','coffee'],'Quiet and thoughtful',array['elias-romano','nico-valenti']::text[],'The bookshop has a courtyard reading.'),
('osteria-neighborhood-table','Osteria neighborhood table','A long communal table is bringing several local circles together over dinner.','community','osteria-rosa',array[0]::smallint[],1170,210,.9,array['food','community'],array['dinner','wine'],'Warm and overlapping',array['alessandro-moretti','luca-bianchi']::text[],'Osteria Rosa has its long Sunday table.'),
('solana-volleyball','Solana beach volleyball','The regular beach group has gathered for a competitive late-afternoon game.','social','spiaggia-solana',array[3,6]::smallint[],960,150,1.0,array['beach','friends'],array['volleyball','swimming'],'Playful and competitive',array['enzo-moretti','theo-mancini','matteo-bellandi','rafael-silva']::text[],'The beach group is playing volleyball.'),
('solana-swim-window','Calm-water swim window','The water is calm enough for a longer supervised swim along Spiaggia Solana.','weather','spiaggia-solana',array[1,4]::smallint[],600,180,.85,array['beach','weather'],array['swimming'],'Bright and easy',array['enzo-moretti','rafael-silva']::text[],'The water is especially calm now.'),
('lido-afternoon-set','Lido afternoon set','A relaxed DJ set is keeping the beach club busy beyond lunch.','performance','lido-vervelle',array[0,5]::smallint[],900,240,.9,array['music','beach'],array['music','lunch','swimming'],'Sunny and social',array['idris-benali','theo-mancini']::text[],'The Lido has an afternoon set.'),
('la-sirena-night','La Sirena night','A promoted club night is pulling together Vervelle''s music and beach circles.','nightlife','la-sirena',array[5,6]::smallint[],1320,300,1.0,array['nightlife','music'],array['dancing','dj'],'Loud and magnetic',array['idris-benali','theo-mancini','matteo-bellandi']::text[],'La Sirena has a major night running.'),
('velours-live-singer','Live singer at Velours','A singer and small ensemble are holding the room to low conversation and close listening.','performance','velours',array[3]::smallint[],1230,180,.9,array['music','date'],array['cocktails','live music'],'Intimate and polished',array['gabriel-laurent','idris-benali']::text[],'Velours has live music tonight.'),
('maison-rouge-jazz','Maison Rouge jazz room','The cabaret room is hosting a late jazz program and supper service.','performance','maison-rouge',array[2,5]::smallint[],1260,210,.85,array['jazz','nightlife'],array['jazz','dinner'],'Elegant and lively',array['gabriel-laurent','lorenzo-bellaforte']::text[],'Maison Rouge has a jazz program.'),
('luna-sunset-tables','Luna Terrace sunset tables','The rooftop is filling early for the evening''s clearest sunset.','social','luna-terrace',array[1,4,6]::smallint[],1080,180,.9,array['sunset','dining'],array['dinner','wine'],'Golden and romantic',array['gabriel-laurent','lorenzo-bellaforte']::text[],'Luna Terrace has an exceptional sunset tonight.'),
('studio-lucent-opening','Studio Lucent portrait opening','A small portrait exhibition is bringing Vervelle''s creative circles into one room.','culture','studio-lucent',array[4]::smallint[],1080,180,.75,array['art','photography'],array['gallery','conversation'],'Creative and observant',array['idris-benali','nico-valenti','marco-de-santis']::text[],'Studio Lucent has an opening tonight.'),
('belvedere-picnic-evening','Belvedere picnic evening','Locals are carrying food and blankets up to the overlook before sunset.','community','belvedere-garden',array[0,3]::smallint[],1020,180,.8,array['garden','sunset'],array['picnic','walk'],'Quiet and affectionate',array['luca-bianchi','nico-valenti']::text[],'Belvedere Garden is ideal before sunset.'),
('fitness-open-class','Bellavista open class','The fitness club is running an open boxing and conditioning session.','community','bellavista-fitness-club',array[2,5]::smallint[],1050,90,.9,array['fitness','community'],array['workout','boxing'],'Energetic and welcoming',array['theo-mancini','enzo-moretti']::text[],'Bellavista has an open training session.'),
('clinic-shift-handoff','Clinic shift handoff','The clinic is moving through a busy but controlled evening handoff.','operations','vervelle-general-clinic',array[1,3,5]::smallint[],1080,90,.8,array['medicine','work'],array['work'],'Focused and contained',array['luca-bianchi']::text[],'The clinic is in its evening handoff.'),
('studio-ondine-open-workshop','Studio Ondine open workshop','A public ceramics session is filling the studio with beginners and regulars.','culture','studio-ondine',array[2,6]::smallint[],900,150,.9,array['art','ceramics'],array['ceramics','art class'],'Messy and relaxed',array['nico-valenti']::text[],'Studio Ondine has an open workshop.'),
('piccolo-midnight-film','Piccolo midnight film','The neighborhood cinema is screening a restored coastal classic late.','culture','piccolo-cinema',array[5]::smallint[],1380,150,.85,array['film','culture'],array['movie','late show'],'Nostalgic and quiet',array['nico-valenti','elias-romano']::text[],'Piccolo Cinema has a special late screening.'),
('domaine-long-lunch','Domaine long lunch','The vineyard has opened its terrace for a long communal lunch and tasting.','community','domaine-vervelle',array[0]::smallint[],750,270,.9,array['vineyard','food'],array['long lunch','wine tasting'],'Generous and social',array['lorenzo-bellaforte','gabriel-laurent']::text[],'Domaine Vervelle is hosting a long lunch.'),
('domaine-harvest-evening','Vineyard harvest evening','Estate workers and friends are finishing a harvest day with food and music.','seasonal','domaine-vervelle',array[6]::smallint[],1050,240,.55,array['vineyard','harvest'],array['wine','live music'],'Tired and celebratory',array['lorenzo-bellaforte']::text[],'The vineyard is marking the harvest tonight.'),
('celeste-spa-evening','Moonlight spa evening','Celeste Spa is keeping its terraces and thermal rooms open after sunset.','wellness','celeste-spa',array[4]::smallint[],1080,180,.85,array['spa','hotel'],array['spa','relaxation'],'Quiet and restorative',array['gabriel-laurent','luca-bianchi']::text[],'Celeste Spa has extended evening hours.'),
('cala-cleanup-dive','Cala Bianca conservation dive','Divers and volunteers are documenting and clearing debris around the cove.','community','cala-bianca',array[6]::smallint[],480,240,.8,array['conservation','diving'],array['diving','beach'],'Purposeful and calm',array['rafael-silva','elias-romano','matteo-bellandi']::text[],'A conservation dive is active at Cala Bianca.'),
('cala-quiet-evening','Cala Bianca quiet evening','The cove has emptied into one of its calmest windows before dark.','environment','cala-bianca',array[1,3]::smallint[],1050,150,.8,array['cove','quiet'],array['swimming','conversation'],'Secluded and still',array['rafael-silva']::text[],'Cala Bianca is unusually quiet now.'),
('faro-clear-sunset','Clear sunset at Faro Vervelle','The cliff path is open under clear conditions and the lighthouse view reaches far down the coast.','weather','faro-vervelle',array[2,5]::smallint[],1050,150,.8,array['lighthouse','weather'],array['cliff walk','sunset'],'Windy and expansive',array['elias-romano','marco-de-santis']::text[],'The lighthouse has a clear sunset window.'),
('pergola-summer-dancing','Dancing at La Pergola','Dinner tables are giving way to live music and dancing under the olive trees.','performance','la-pergola',array[6]::smallint[],1260,210,.9,array['music','food'],array['dinner','summer dancing'],'Warm and celebratory',array['alessandro-moretti','lorenzo-bellaforte','idris-benali']::text[],'La Pergola has music and dancing tonight.')
)
insert into public.together_world_event_templates(world_id,slug,title,summary,event_type,location_id,district_location_id,weekdays,start_minute,duration_minutes,probability,knowledge_scope,significance,topic_tags,activity_tags,participant_selector,atmosphere,plan_affordances,metadata)
select world.id,pilot.slug,pilot.title,pilot.summary,pilot.event_type,location.id,coalesce(case when location.location_type='district' then location.id else location.parent_location_id end,location.parent_location_id),pilot.weekdays,pilot.start_minute,pilot.duration_minutes,pilot.probability,'public',.68,pilot.topic_tags,pilot.activity_tags,jsonb_build_object('characterSlugs',to_jsonb(pilot.participant_slugs),'minimum',0,'maximum',4),pilot.atmosphere,jsonb_build_object('reason',pilot.reason),jsonb_build_object('source','port_vervelle_world_pulse_v1','worldBehaviorPack','port-vervelle')
from pilot join public.together_worlds world on world.slug='port-vervelle' join public.together_locations location on location.world_id=world.id and location.slug=pilot.location_slug
on conflict(world_id,slug) do update set title=excluded.title,summary=excluded.summary,event_type=excluded.event_type,location_id=excluded.location_id,district_location_id=excluded.district_location_id,weekdays=excluded.weekdays,start_minute=excluded.start_minute,duration_minutes=excluded.duration_minutes,probability=excluded.probability,topic_tags=excluded.topic_tags,activity_tags=excluded.activity_tags,participant_selector=excluded.participant_selector,atmosphere=excluded.atmosphere,plan_affordances=excluded.plan_affordances,active=true,updated_at=now();

comment on table public.together_world_event_templates is 'Server-owned recurring World Pulse definitions. They describe shared local reality, not dialogue or forced user actions.';
comment on table public.together_world_event_instances is 'Continuity-scoped deterministic materializations of World Pulse events.';
comment on table public.together_world_event_participants is 'Canonical attendance and knowledge boundaries for characters participating in a World Pulse event.';

commit;
