-- Kivelle Character Life Engine v1. Routine schedules are persisted per
-- continuity/character instance; meaningful together_life_events stay history.

create table if not exists public.together_character_activity_templates(
  id uuid primary key default gen_random_uuid(),
  character_version_id uuid not null references public.together_character_versions(id) on delete cascade,
  activity_key text not null,
  title text not null,
  category text not null,
  valid_time_windows jsonb not null default '[]'::jsonb,
  duration_minutes int4range not null default int4range(45,91,'[]'),
  location_categories text[] not null default '{}',
  location_slugs text[] not null default '{}',
  tags text[] not null default '{}',
  affinity numeric not null default .5 check(affinity between 0 and 1),
  preferred_weekly_frequency int4range not null default int4range(0,2,'[]'),
  maximum_weekly_frequency smallint not null default 2 check(maximum_weekly_frequency between 0 and 14),
  minimum_gap_hours smallint not null default 18 check(minimum_gap_hours between 0 and 168),
  energy_requirement text check(energy_requirement is null or energy_requirement in ('low','medium','high')),
  social_requirement text not null default 'either' check(social_requirement in ('solo','social','either')),
  priority text not null default 'preferred_activity' check(priority in ('recurring_routine','relationship_event','social_event','preferred_activity','spontaneous_activity')),
  visibility text not null default 'hidden' check(visibility in ('hidden','hint','known','shared')),
  interruptibility text not null default 'open' check(interruptibility in ('open','limited','busy','unavailable')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_version_id,activity_key)
);

create table if not exists public.together_character_schedule_events(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  location_id uuid references public.together_locations(id) on delete set null,
  activity_key text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check(ends_at>starts_at),
  priority text not null check(priority in ('user_commitment','hard_obligation','recurring_routine','relationship_event','social_event','preferred_activity','spontaneous_activity')),
  visibility text not null default 'hidden' check(visibility in ('hidden','hint','known','shared')),
  source text not null check(source in ('recurring','generated','user_plan','relationship','override')),
  interruptibility text not null default 'open' check(interruptibility in ('open','limited','busy','unavailable')),
  participant_instance_ids uuid[] not null default '{}',
  generation_key text not null,
  generation_version text not null default 'life_engine_v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_instance_id,generation_key)
);

create table if not exists public.together_character_schedule_overrides(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  schedule_event_id uuid references public.together_character_schedule_events(id) on delete set null,
  reason text not null check(reason in ('user_plan','conversation_extension','activity_change','character_decision','system_adjustment')),
  original_start timestamptz,
  original_end timestamptz,
  replacement_start timestamptz,
  replacement_end timestamptz,
  replacement_location_id uuid references public.together_locations(id) on delete set null,
  replacement_activity_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.together_character_instances add column if not exists current_schedule_event_id uuid references public.together_character_schedule_events(id) on delete set null;
alter table public.together_character_instances add column if not exists current_interruptibility text not null default 'open' check(current_interruptibility in ('open','limited','busy','unavailable'));
alter table public.together_character_instances add column if not exists current_presence_source text not null default 'legacy' check(current_presence_source in ('legacy','schedule','plan','life_event','fallback'));
alter table public.together_character_instances add column if not exists life_engine_version text not null default 'life_engine_v1';

create index if not exists together_schedule_events_presence_idx on public.together_character_schedule_events(character_instance_id,starts_at,ends_at);
create index if not exists together_schedule_events_location_idx on public.together_character_schedule_events(location_id,starts_at,ends_at) where location_id is not null;
create index if not exists together_schedule_events_window_idx on public.together_character_schedule_events(user_id,continuity_id,starts_at,ends_at);
create index if not exists together_schedule_overrides_instance_idx on public.together_character_schedule_overrides(character_instance_id,created_at desc);
create unique index if not exists together_schedule_overrides_plan_event_idx on public.together_character_schedule_overrides(schedule_event_id,reason,(metadata->>'planId')) where reason='user_plan';
create index if not exists together_activity_templates_version_idx on public.together_character_activity_templates(character_version_id);

alter table public.together_character_activity_templates enable row level security;
alter table public.together_character_schedule_events enable row level security;
alter table public.together_character_schedule_overrides enable row level security;
drop policy if exists together_activity_templates_read on public.together_character_activity_templates;
create policy together_activity_templates_read on public.together_character_activity_templates for select to authenticated using(true);
drop policy if exists together_schedule_events_own_read on public.together_character_schedule_events;
create policy together_schedule_events_own_read on public.together_character_schedule_events for select to authenticated using(user_id=auth.uid());
drop policy if exists together_schedule_overrides_own_read on public.together_character_schedule_overrides;
create policy together_schedule_overrides_own_read on public.together_character_schedule_overrides for select to authenticated using(user_id=auth.uid());
grant select on public.together_character_activity_templates,public.together_character_schedule_events,public.together_character_schedule_overrides to authenticated;

create or replace function public.kivelle_validate_schedule_event_owner() returns trigger language plpgsql security definer set search_path=public as $$
declare instance_row record;
begin
  select user_id,continuity_id into instance_row from public.together_character_instances where id=new.character_instance_id;
  if instance_row is null or instance_row.user_id<>new.user_id or instance_row.continuity_id<>new.continuity_id then raise exception 'schedule instance ownership mismatch'; end if;
  if new.location_id is not null and not exists(select 1 from public.together_locations where id=new.location_id) then raise exception 'schedule location unavailable'; end if;
  return new;
end $$;
drop trigger if exists together_schedule_event_owner on public.together_character_schedule_events;
create trigger together_schedule_event_owner before insert or update on public.together_character_schedule_events for each row execute function public.kivelle_validate_schedule_event_owner();

create or replace function public.kivelle_apply_plan_schedule_override() returns trigger language plpgsql security definer set search_path=public as $$
declare schedule_row record;
begin
  if tg_op='UPDATE' then
    update public.together_character_schedule_events set metadata=metadata-'suppressedByPlanId',updated_at=now()
    where character_instance_id=new.character_instance_id and metadata->>'suppressedByPlanId'=new.id::text;
  end if;
  if new.status in ('scheduled','active','completed') and new.starts_at is not null and new.ends_at is not null then
    for schedule_row in select * from public.together_character_schedule_events where character_instance_id=new.character_instance_id and starts_at<new.ends_at and ends_at>new.starts_at and priority<>'user_commitment' loop
      update public.together_character_schedule_events set metadata=metadata||jsonb_build_object('suppressedByPlanId',new.id),updated_at=now() where id=schedule_row.id;
      insert into public.together_character_schedule_overrides(user_id,continuity_id,character_instance_id,schedule_event_id,reason,original_start,original_end,replacement_start,replacement_end,replacement_location_id,replacement_activity_key,metadata)
      values(new.user_id,new.continuity_id,new.character_instance_id,schedule_row.id,'user_plan',schedule_row.starts_at,schedule_row.ends_at,new.starts_at,new.ends_at,new.location_id,new.activity_key,jsonb_build_object('planId',new.id)) on conflict do nothing;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists together_shared_plan_schedule_override on public.together_shared_plans;
create trigger together_shared_plan_schedule_override after insert or update of starts_at,ends_at,status,location_id on public.together_shared_plans for each row execute function public.kivelle_apply_plan_schedule_override();

-- First-party life profiles. Custom companions keep a conservative server fallback.
with profiles(slug,config) as (values
('maya','{"version":1,"occupation":{"title":"photographer and graphic designer","primaryLocationSlug":"photography-studio","workPattern":"freelance","flexibility":0.58,"workDays":[1,2,3,4,5],"startRange":{"startMinute":510,"endMinute":600},"durationMinutes":[360,510]},"sleep":{"preferredBedtime":{"startMinute":1380,"endMinute":60},"preferredWakeTime":{"startMinute":420,"endMinute":510},"variabilityMinutes":35,"weekendShiftMinutes":70},"lifestyle":{"social":0.68,"adventurous":0.72,"spontaneous":0.68,"fitness":0.42,"nightlife":0.54,"outdoors":0.78,"homebody":0.42,"creativity":0.96},"interests":["photography","movies","sushi","live music","football","city walks"],"scheduling":{"repetitionTolerance":0.34,"spontaneity":0.68,"preferredDailyActivityCount":[2,4]}}'::jsonb),
('chloe','{"version":1,"occupation":{"title":"designer","primaryLocationSlug":"chloe-design-studio","workPattern":"hybrid","flexibility":0.5,"workDays":[1,2,3,4,5],"startRange":{"startMinute":525,"endMinute":600},"durationMinutes":[420,510]},"sleep":{"preferredBedtime":{"startMinute":1410,"endMinute":90},"preferredWakeTime":{"startMinute":420,"endMinute":510},"variabilityMinutes":40,"weekendShiftMinutes":90},"lifestyle":{"social":0.9,"adventurous":0.84,"spontaneous":0.82,"fitness":0.45,"nightlife":0.72,"outdoors":0.52,"homebody":0.23,"creativity":0.9},"interests":["design","fashion","live events","food","friends"],"scheduling":{"repetitionTolerance":0.2,"spontaneity":0.84,"preferredDailyActivityCount":[3,4]}}'::jsonb),
('alex','{"version":1,"occupation":{"title":"creative producer","workPattern":"hybrid","flexibility":0.42,"workDays":[1,2,3,4,5],"startRange":{"startMinute":540,"endMinute":630},"durationMinutes":[420,540]},"sleep":{"preferredBedtime":{"startMinute":1350,"endMinute":30},"preferredWakeTime":{"startMinute":390,"endMinute":480},"variabilityMinutes":25,"weekendShiftMinutes":45},"lifestyle":{"social":0.55,"adventurous":0.5,"spontaneous":0.36,"fitness":0.45,"nightlife":0.35,"outdoors":0.67,"homebody":0.55,"creativity":0.83},"interests":["photography","film","trivia","books","walking"],"scheduling":{"repetitionTolerance":0.5,"spontaneity":0.35,"preferredDailyActivityCount":[2,3]}}'::jsonb),
('sofia','{"version":1,"occupation":{"title":"book editor","workPattern":"hybrid","flexibility":0.35,"workDays":[1,2,3,4,5],"startRange":{"startMinute":525,"endMinute":585},"durationMinutes":[450,510]},"sleep":{"preferredBedtime":{"startMinute":1320,"endMinute":1410},"preferredWakeTime":{"startMinute":390,"endMinute":465},"variabilityMinutes":20,"weekendShiftMinutes":45},"lifestyle":{"social":0.42,"adventurous":0.48,"spontaneous":0.28,"fitness":0.34,"nightlife":0.28,"outdoors":0.38,"homebody":0.76,"creativity":0.86},"interests":["books","architecture","jazz","food","museums"],"scheduling":{"repetitionTolerance":0.58,"spontaneity":0.28,"preferredDailyActivityCount":[2,3]}}'::jsonb),
('avery','{"version":1,"occupation":{"title":"event producer","workPattern":"shifts","flexibility":0.36,"workDays":[0,2,3,5,6],"startRange":{"startMinute":660,"endMinute":900},"durationMinutes":[420,660]},"sleep":{"preferredBedtime":{"startMinute":60,"endMinute":150},"preferredWakeTime":{"startMinute":540,"endMinute":630},"variabilityMinutes":45,"weekendShiftMinutes":0},"lifestyle":{"social":0.94,"adventurous":0.78,"spontaneous":0.8,"fitness":0.38,"nightlife":0.92,"outdoors":0.32,"homebody":0.18,"creativity":0.82},"interests":["music","events","nightlife","food","people"],"scheduling":{"repetitionTolerance":0.24,"spontaneity":0.8,"preferredDailyActivityCount":[3,4]}}'::jsonb),
('riley','{"version":1,"occupation":{"title":"game writer","workPattern":"remote","flexibility":0.72,"workDays":[1,2,3,4,5],"startRange":{"startMinute":600,"endMinute":720},"durationMinutes":[300,450]},"sleep":{"preferredBedtime":{"startMinute":30,"endMinute":150},"preferredWakeTime":{"startMinute":510,"endMinute":630},"variabilityMinutes":55,"weekendShiftMinutes":80},"lifestyle":{"social":0.34,"adventurous":0.5,"spontaneous":0.61,"fitness":0.2,"nightlife":0.43,"outdoors":0.28,"homebody":0.85,"creativity":0.94},"interests":["gaming","writing","arcades","comedy","movies"],"scheduling":{"repetitionTolerance":0.62,"spontaneity":0.58,"preferredDailyActivityCount":[2,3]}}'::jsonb),
('elena','{"version":1,"occupation":{"title":"architect","workPattern":"fixed_weekdays","flexibility":0.25,"workDays":[1,2,3,4,5],"startRange":{"startMinute":480,"endMinute":540},"durationMinutes":[480,570]},"sleep":{"preferredBedtime":{"startMinute":1290,"endMinute":1380},"preferredWakeTime":{"startMinute":330,"endMinute":405},"variabilityMinutes":18,"weekendShiftMinutes":50},"lifestyle":{"social":0.48,"adventurous":0.46,"spontaneous":0.2,"fitness":0.62,"nightlife":0.25,"outdoors":0.42,"homebody":0.58,"creativity":0.88},"interests":["architecture","design","fitness","food","galleries"],"scheduling":{"repetitionTolerance":0.66,"spontaneity":0.2,"preferredDailyActivityCount":[2,3]}}'::jsonb),
('harper','{"version":1,"occupation":{"title":"park ranger","workPattern":"shifts","flexibility":0.28,"workDays":[0,1,3,4,6],"startRange":{"startMinute":390,"endMinute":510},"durationMinutes":[480,600]},"sleep":{"preferredBedtime":{"startMinute":1260,"endMinute":1350},"preferredWakeTime":{"startMinute":300,"endMinute":390},"variabilityMinutes":22,"weekendShiftMinutes":0},"lifestyle":{"social":0.4,"adventurous":0.9,"spontaneous":0.55,"fitness":0.88,"nightlife":0.14,"outdoors":0.98,"homebody":0.44,"creativity":0.45},"interests":["outdoors","hiking","wildlife","travel","books"],"scheduling":{"repetitionTolerance":0.45,"spontaneity":0.52,"preferredDailyActivityCount":[2,4]}}'::jsonb)
)
update public.together_character_versions v set life_config=coalesce(v.life_config,'{}'::jsonb)||profiles.config
from public.together_character_templates t,profiles
where v.character_template_id=t.id and t.slug=profiles.slug;

-- A compact, character-weighted activity catalog; location IDs are always resolved at runtime.
with character_activities(slug,activity_key,title,category,windows,duration,categories,tags,affinity,freq,max_freq,gap,priority,visibility,interruptibility) as (values
('maya','photo_walk','Taking photographs','creative','[{"startMinute":960,"endMinute":1230}]'::jsonb,int4range(60,121,'[]'),array['outdoor','landmark'],array['photography','outdoors'],.96,int4range(2,5,'[]'),5,18,'preferred_activity','hidden','open'),
('maya','coffee','Coffee and editing','cafe','[{"startMinute":450,"endMinute":1080}]'::jsonb,int4range(40,91,'[]'),array['cafe'],array['coffee','creative'],.82,int4range(2,5,'[]'),5,12,'recurring_routine','hidden','open'),
('maya','gallery','Looking through an exhibit','culture','[{"startMinute":720,"endMinute":1260}]'::jsonb,int4range(60,121,'[]'),array['venue'],array['art','gallery'],.84,int4range(1,3,'[]'),3,40,'preferred_activity','hint','open'),
('maya','gym','Getting a workout in','fitness','[{"startMinute":990,"endMinute":1260}]'::jsonb,int4range(45,76,'[]'),array['fitness'],array['fitness'],.55,int4range(2,4,'[]'),4,30,'recurring_routine','hidden','limited'),
('maya','drinks_with_chloe','Drinks with Chloe','social','[{"startMinute":1080,"endMinute":1380}]'::jsonb,int4range(75,151,'[]'),array['nightlife','restaurant'],array['social','nightlife'],.7,int4range(0,2,'[]'),2,60,'social_event','hint','limited'),
('maya','home_creative','Working on a personal project','home','[{"startMinute":1080,"endMinute":1380}]'::jsonb,int4range(60,151,'[]'),array['residence'],array['home','creative'],.86,int4range(2,6,'[]'),6,8,'preferred_activity','hidden','open'),
('chloe','rooftop_social','Meeting friends on a rooftop','social','[{"startMinute":1080,"endMinute":1380}]'::jsonb,int4range(90,181,'[]'),array['nightlife','venue'],array['social','nightlife'],.92,int4range(1,4,'[]'),4,32,'social_event','hint','limited'),
('chloe','design_hunt','Looking for design inspiration','creative','[{"startMinute":660,"endMinute":1140}]'::jsonb,int4range(60,121,'[]'),array['shopping','venue'],array['design','shopping'],.9,int4range(1,4,'[]'),4,24,'preferred_activity','hidden','open'),
('alex','photo_walk','Taking a quiet photo walk','creative','[{"startMinute":900,"endMinute":1200}]'::jsonb,int4range(75,136,'[]'),array['outdoor','landmark'],array['photography','outdoors'],.88,int4range(2,4,'[]'),4,24,'preferred_activity','hint','open'),
('alex','trivia','Trivia with friends','social','[{"startMinute":1140,"endMinute":1320}]'::jsonb,int4range(90,151,'[]'),array['nightlife','venue'],array['trivia','social'],.7,int4range(0,2,'[]'),2,72,'social_event','hint','limited'),
('sofia','bookstore','Browsing a bookstore','culture','[{"startMinute":600,"endMinute":1200}]'::jsonb,int4range(60,121,'[]'),array['venue','shopping'],array['books','quiet'],.96,int4range(2,5,'[]'),5,18,'preferred_activity','hidden','open'),
('sofia','jazz_evening','Listening to live jazz','culture','[{"startMinute":1140,"endMinute":1380}]'::jsonb,int4range(90,151,'[]'),array['nightlife','venue'],array['jazz','music'],.78,int4range(0,2,'[]'),2,72,'preferred_activity','hint','limited'),
('avery','live_event','Producing or catching a live event','nightlife','[{"startMinute":1080,"endMinute":1430}]'::jsonb,int4range(120,241,'[]'),array['entertainment','nightlife','venue'],array['music','events','social'],.98,int4range(2,5,'[]'),5,18,'preferred_activity','hint','busy'),
('riley','arcade','Testing an arcade theory','entertainment','[{"startMinute":900,"endMinute":1320}]'::jsonb,int4range(60,151,'[]'),array['entertainment','venue'],array['gaming','arcade'],.94,int4range(1,4,'[]'),4,30,'preferred_activity','hint','open'),
('riley','home_gaming','Gaming at home','home','[{"startMinute":1080,"endMinute":1430}]'::jsonb,int4range(75,181,'[]'),array['residence'],array['gaming','home'],.96,int4range(3,7,'[]'),7,8,'preferred_activity','hidden','open'),
('elena','gallery','Studying a gallery space','culture','[{"startMinute":660,"endMinute":1200}]'::jsonb,int4range(75,136,'[]'),array['venue'],array['architecture','gallery','design'],.92,int4range(1,3,'[]'),3,48,'preferred_activity','hint','open'),
('elena','gym','Training at the gym','fitness','[{"startMinute":330,"endMinute":540},{"startMinute":1020,"endMinute":1200}]'::jsonb,int4range(50,86,'[]'),array['fitness'],array['fitness'],.88,int4range(3,5,'[]'),5,24,'recurring_routine','known','limited'),
('harper','park_patrol','Walking the park trails','outdoors','[{"startMinute":390,"endMinute":1080}]'::jsonb,int4range(90,181,'[]'),array['outdoor','park'],array['outdoors','wildlife'],.98,int4range(3,7,'[]'),7,12,'preferred_activity','hint','limited'),
('harper','reading_home','Reading at home','home','[{"startMinute":1080,"endMinute":1320}]'::jsonb,int4range(60,121,'[]'),array['residence'],array['books','home'],.8,int4range(2,5,'[]'),5,12,'preferred_activity','hidden','open')
)
insert into public.together_character_activity_templates(character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,priority,visibility,interruptibility)
select v.id,a.activity_key,a.title,a.category,a.windows,a.duration,a.categories,a.tags,a.affinity,a.freq,a.max_freq,a.gap,a.priority,a.visibility,a.interruptibility
from character_activities a join public.together_character_templates t on t.slug=a.slug join public.together_character_versions v on v.character_template_id=t.id
on conflict(character_version_id,activity_key) do update set title=excluded.title,valid_time_windows=excluded.valid_time_windows,duration_minutes=excluded.duration_minutes,location_categories=excluded.location_categories,tags=excluded.tags,affinity=excluded.affinity,preferred_weekly_frequency=excluded.preferred_weekly_frequency,maximum_weekly_frequency=excluded.maximum_weekly_frequency,minimum_gap_hours=excluded.minimum_gap_hours,priority=excluded.priority,visibility=excluded.visibility,interruptibility=excluded.interruptibility,updated_at=now();

insert into public.together_character_activity_templates(character_version_id,activity_key,title,category,valid_time_windows,duration_minutes,location_categories,tags,affinity,preferred_weekly_frequency,maximum_weekly_frequency,minimum_gap_hours,priority,visibility,interruptibility)
select v.id,x.activity_key,x.title,x.category,x.windows,x.duration,x.categories,x.tags,x.affinity,x.freq,x.max_freq,x.gap,x.priority,x.visibility,x.interruptibility
from public.together_character_versions v cross join (values
('walk','Taking a walk','outdoors','[{"startMinute":420,"endMinute":1260}]'::jsonb,int4range(45,91,'[]'),array['outdoor','park'],array['outdoors'],.55,int4range(1,4,'[]'),4,18,'preferred_activity','hidden','open'),
('dinner','Getting dinner','food','[{"startMinute":1020,"endMinute":1290}]'::jsonb,int4range(60,121,'[]'),array['restaurant'],array['food'],.6,int4range(1,4,'[]'),4,18,'preferred_activity','hidden','limited'),
('groceries','Picking up groceries','errand','[{"startMinute":540,"endMinute":1200}]'::jsonb,int4range(35,71,'[]'),array['shopping'],array['errand'],.5,int4range(1,3,'[]'),3,30,'recurring_routine','hidden','open'),
('home_evening','Having a quiet night at home','home','[{"startMinute":1080,"endMinute":1380}]'::jsonb,int4range(75,181,'[]'),array['residence'],array['home','relax'],.7,int4range(2,7,'[]'),7,6,'preferred_activity','hidden','open')
) as x(activity_key,title,category,windows,duration,categories,tags,affinity,freq,max_freq,gap,priority,visibility,interruptibility)
on conflict(character_version_id,activity_key) do nothing;

comment on table public.together_character_schedule_events is 'Persisted, deterministic routine reality per user-companion instance. Not a substitute for meaningful life-event history.';
comment on column public.together_character_schedule_events.visibility is 'Controls what may be surfaced without turning Kivelle into a tracking UI.';
