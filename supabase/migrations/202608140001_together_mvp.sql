begin;

create extension if not exists vector with schema extensions;

create table if not exists public.together_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  age_verified_at timestamptz not null,
  interests text[] not null default '{}',
  experience_goals text[] not null default '{}',
  onboarding_completed_at timestamptz,
  memory_categories jsonb not null default '{"semantic":true,"preference":true,"episodic":true,"relationship":true,"emotional":true,"open_thread":true}'::jsonb,
  privacy_settings jsonb not null default '{"personalization":true,"analytics":true}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_worlds(
  id uuid primary key,name text not null unique,slug text not null unique,description text not null,
  hero_asset_key text,theme jsonb not null default '{}'::jsonb,metadata jsonb not null default '{}'::jsonb,
  published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_locations(
  id uuid primary key,world_id uuid not null references public.together_worlds(id) on delete cascade,
  name text not null,slug text not null,description text not null,category text not null,visual_asset_key text,
  hours jsonb,possible_activities text[] not null default '{}',metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(world_id,slug)
);

create table if not exists public.together_character_templates(
  id uuid primary key,name text not null unique,slug text not null unique,age integer not null check(age>=18),occupation text not null,
  biography text not null,creator_id uuid references auth.users(id) on delete set null,current_published_version integer not null default 1,
  published boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_character_versions(
  id uuid primary key,character_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  version integer not null,personality_config jsonb not null,values_config jsonb not null,interests text[] not null default '{}',
  communication_style jsonb not null,appearance_config jsonb not null,voice_config jsonb not null default '{}'::jsonb,
  boundaries text[] not null default '{}',default_social_graph jsonb not null default '[]'::jsonb,portrait_asset_key text,
  published_at timestamptz,created_at timestamptz not null default now(),unique(character_template_id,version)
);

create table if not exists public.together_character_relationship_edges(
  id uuid primary key default gen_random_uuid(),world_id uuid not null references public.together_worlds(id) on delete cascade,
  source_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  target_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  relationship_type text not null,affinity smallint not null default 50 check(affinity between 0 and 100),trust smallint not null default 50 check(trust between 0 and 100),
  history text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(world_id,source_template_id,target_template_id),check(source_template_id<>target_template_id)
);

create table if not exists public.together_schedule_templates(
  id uuid primary key default gen_random_uuid(),character_version_id uuid not null references public.together_character_versions(id) on delete cascade,
  day_of_week smallint not null check(day_of_week between 0 and 6),start_minute smallint not null check(start_minute between 0 and 1439),
  end_minute smallint not null check(end_minute between 1 and 1440),location_id uuid references public.together_locations(id) on delete set null,
  activity text not null,availability text not null check(availability in('available','limited','busy')),
  energy_delta smallint not null default 0 check(energy_delta between -3 and 3),mood_influence text,variation_weight numeric(5,4) not null default 1,
  metadata jsonb not null default '{}'::jsonb,check(end_minute>start_minute),unique(character_version_id,day_of_week,start_minute)
);

create table if not exists public.together_event_templates(
  id uuid primary key,name text not null unique,event_type text not null,world_id uuid references public.together_worlds(id) on delete cascade,
  default_location_id uuid references public.together_locations(id) on delete set null,participant_template_ids uuid[] not null default '{}',
  significance numeric(5,4) not null check(significance between 0 and 1),probability numeric(5,4) not null check(probability between 0 and 1),
  duration_minutes integer not null default 60 check(duration_minutes>0),narrative_summary text not null,state_effects jsonb not null default '{}'::jsonb,
  user_visibility text not null default 'contextual' check(user_visibility in('hidden','contextual','visible')),
  proactive_eligible boolean not null default false,metadata jsonb not null default '{}'::jsonb,active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_character_instances(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_template_id uuid not null references public.together_character_templates(id),character_version_id uuid not null references public.together_character_versions(id),
  relationship_stage text not null default 'stranger' check(relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  current_mood text not null default 'curious',current_location_id uuid references public.together_locations(id),current_activity text not null default 'going about the day',
  current_energy text not null default 'medium' check(current_energy in('low','medium','high')),contact_added_at timestamptz,introduced_at timestamptz,
  last_simulated_at timestamptz not null default now(),simulation_seed text not null default encode(extensions.gen_random_bytes(12),'hex'),metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,character_template_id)
);

create table if not exists public.together_relationship_states(
  character_instance_id uuid primary key references public.together_character_instances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,trust smallint not null default 8,comfort smallint not null default 6,
  attraction smallint not null default 8,affinity smallint not null default 8,familiarity smallint not null default 0,respect smallint not null default 10,
  conflict smallint not null default 0,romantic_interest smallint not null default 0,commitment smallint not null default 0,
  conversation_count integer not null default 0 check(conversation_count>=0),active_major_conflict boolean not null default false,
  recent_direction text not null default 'new',updated_at timestamptz not null default now(),
  check(trust between 0 and 100),check(comfort between 0 and 100),check(attraction between 0 and 100),check(affinity between 0 and 100),
  check(familiarity between 0 and 100),check(respect between 0 and 100),check(conflict between 0 and 100),
  check(romantic_interest between 0 and 100),check(commitment between 0 and 100)
);

create table if not exists public.together_conversations(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  kind text not null default 'direct' check(kind in('first_meeting','direct','date','introduction')),
  title text,last_message_at timestamptz,archived_at timestamptz,metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_messages(
  id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  role text not null check(role in('user','assistant','system')),content text not null check(char_length(content) between 1 and 12000),
  client_request_id text,delivery_status text not null default 'complete' check(delivery_status in('pending','streaming','complete','failed')),
  moderation_status text not null default 'approved' check(moderation_status in('pending','approved','blocked','reported')),
  provider_metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(conversation_id,client_request_id)
);

create table if not exists public.together_memories(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  memory_type text not null check(memory_type in('semantic','preference','episodic','relationship','emotional','open_thread')),
  canonical_text text not null check(char_length(canonical_text) between 1 and 2000),dedupe_key text not null,importance numeric(5,4) not null default .5 check(importance between 0 and 1),
  confidence numeric(5,4) not null default .5 check(confidence between 0 and 1),last_recalled_at timestamptz,source_message_id uuid references public.together_messages(id) on delete set null,
  sensitivity_category text not null default 'none' check(sensitivity_category in('none','personal','sensitive')),
  embedding extensions.vector(1536),status text not null default 'active' check(status in('active','forgotten','superseded')),
  pinned boolean not null default false,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(character_instance_id,dedupe_key)
);

create table if not exists public.together_open_threads(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,topic text not null,
  expected_at timestamptz,importance numeric(5,4) not null default .5 check(importance between 0 and 1),source_message_id uuid references public.together_messages(id) on delete set null,
  follow_up_eligible boolean not null default false,resolved_at timestamptz,resolution_message_id uuid references public.together_messages(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_life_events(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  event_template_id uuid references public.together_event_templates(id) on delete set null,event_type text not null,title text not null,narrative_summary text not null,
  participant_instance_ids uuid[] not null default '{}',location_id uuid references public.together_locations(id) on delete set null,
  significance numeric(5,4) not null default .5 check(significance between 0 and 1),starts_at timestamptz not null,ends_at timestamptz,
  resulting_state_changes jsonb not null default '{}'::jsonb,user_should_know boolean not null default false,proactive_message_appropriate boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

create table if not exists public.together_knowledge_transfers(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null references public.together_memories(id) on delete cascade,from_character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  to_character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,life_event_id uuid not null references public.together_life_events(id) on delete cascade,
  reason text not null,created_at timestamptz not null default now(),unique(memory_id,to_character_instance_id),check(from_character_instance_id<>to_character_instance_id)
);

create table if not exists public.together_date_templates(
  id uuid primary key,name text not null unique,slug text not null unique,world_id uuid not null references public.together_worlds(id),
  location_id uuid not null references public.together_locations(id),description text not null,hero_asset_key text,
  phases jsonb not null,unlock_rules jsonb not null,entitlement_key text not null,active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_date_sessions(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,date_template_id uuid not null references public.together_date_templates(id),
  status text not null default 'locked' check(status in('locked','unlocked','upcoming','active','completed','deferred')),
  current_phase text not null default 'arrival' check(current_phase in('arrival','ordering','early_conversation','personal_conversation','unexpected_moment','dessert','after_date','resolution')),
  phase_index smallint not null default 0 check(phase_index between 0 and 7),scheduled_for timestamptz,started_at timestamptz,completed_at timestamptz,
  state jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,character_instance_id,date_template_id)
);

create table if not exists public.together_date_choices(
  id uuid primary key default gen_random_uuid(),date_session_id uuid not null references public.together_date_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,phase text not null,choice_id text not null,choice_text text not null,
  relationship_impact jsonb not null default '{}'::jsonb,narrative_result text,created_at timestamptz not null default now(),unique(date_session_id,phase)
);

create table if not exists public.together_moments(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,title text not null,occurred_at timestamptz not null,
  location_id uuid references public.together_locations(id) on delete set null,summary text not null,participant_instance_ids uuid[] not null default '{}',
  linked_memory_ids uuid[] not null default '{}',relationship_impact jsonb not null default '{}'::jsonb,media jsonb not null default '[]'::jsonb,
  moment_type text not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_proactive_messages(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  life_event_id uuid references public.together_life_events(id) on delete set null,open_thread_id uuid references public.together_open_threads(id) on delete set null,
  content text not null,reason text not null,status text not null default 'queued' check(status in('queued','sent','opened','cancelled','failed')),
  eligible_at timestamptz not null,expires_at timestamptz,conversation_id uuid references public.together_conversations(id) on delete set null,
  sent_message_id uuid references public.together_messages(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_notification_preferences(
  user_id uuid primary key references auth.users(id) on delete cascade,push_enabled boolean not null default false,
  character_initiated_messages boolean not null default true,quiet_hours_start time not null default '23:00',quiet_hours_end time not null default '08:00',
  timezone text not null default 'UTC',updated_at timestamptz not null default now()
);

create table if not exists public.together_push_tokens(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,platform text not null check(platform in('ios','android')),device_id text,
  active boolean not null default true,last_registered_at timestamptz not null default now(),created_at timestamptz not null default now(),
  unique(user_id,expo_push_token)
);

create table if not exists public.together_entitlements(
  user_id uuid primary key references auth.users(id) on delete cascade,tier text not null default 'free' check(tier in('free','together_plus','unlimited')),
  entitlement_keys text[] not null default array['maya_relationship','text_basic','memory_basic','city_life','dinner_juniper'],
  revenuecat_app_user_id text,store_customer_id text,expires_at timestamptz,metadata jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now()
);

create table if not exists public.together_analytics_events(
  id bigint generated always as identity primary key,user_id uuid references auth.users(id) on delete set null,event_name text not null,
  properties jsonb not null default '{}'::jsonb,session_id text,created_at timestamptz not null default now()
);

create table if not exists public.together_safety_reports(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,message_id uuid references public.together_messages(id) on delete set null,
  reason text not null,detail text,status text not null default 'open' check(status in('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.together_safety_events(
  id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,character_instance_id uuid references public.together_character_instances(id) on delete set null,
  direction text not null check(direction in('input','output','system')),categories text[] not null default '{}',action text not null,
  metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);

create index if not exists together_instances_user_idx on public.together_character_instances(user_id,updated_at desc);
create index if not exists together_messages_conversation_idx on public.together_messages(conversation_id,created_at desc);
create index if not exists together_memories_active_idx on public.together_memories(character_instance_id,memory_type,importance desc) where status='active';
create index if not exists together_memories_embedding_idx on public.together_memories using hnsw(embedding extensions.vector_cosine_ops) where embedding is not null;
create index if not exists together_threads_due_idx on public.together_open_threads(character_instance_id,expected_at) where resolved_at is null;
create index if not exists together_life_events_instance_idx on public.together_life_events(character_instance_id,starts_at desc);
create index if not exists together_dates_user_idx on public.together_date_sessions(user_id,status,updated_at desc);
create index if not exists together_moments_user_idx on public.together_moments(user_id,occurred_at desc);
create index if not exists together_proactive_due_idx on public.together_proactive_messages(status,eligible_at) where status='queued';

create or replace function public.together_owns_instance(p_instance_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.together_character_instances i where i.id=p_instance_id and i.user_id=auth.uid())
$$;
revoke all on function public.together_owns_instance(uuid) from public;
grant execute on function public.together_owns_instance(uuid) to authenticated;

create or replace function public.together_match_memories(p_character_instance_id uuid,p_embedding extensions.vector(1536),p_limit integer default 8)
returns table(id uuid,memory_type text,canonical_text text,importance numeric,confidence numeric,similarity double precision)
language sql stable security definer set search_path=public,extensions as $$
  select m.id,m.memory_type,m.canonical_text,m.importance,m.confidence,1-(m.embedding<=>p_embedding) similarity
  from public.together_memories m where m.character_instance_id=p_character_instance_id and m.user_id=auth.uid() and m.status='active' and m.embedding is not null
  order by m.embedding<=>p_embedding limit least(greatest(p_limit,1),20)
$$;
revoke all on function public.together_match_memories(uuid,extensions.vector,integer) from public;
grant execute on function public.together_match_memories(uuid,extensions.vector,integer) to authenticated;

create or replace function public.together_match_memories_server(p_user_id uuid,p_character_instance_id uuid,p_embedding extensions.vector(1536),p_limit integer default 8)
returns table(id uuid,memory_type text,canonical_text text,importance numeric,confidence numeric,similarity double precision)
language sql stable security definer set search_path=public,extensions as $$
  select m.id,m.memory_type,m.canonical_text,m.importance,m.confidence,1-(m.embedding<=>p_embedding) similarity
  from public.together_memories m where m.user_id=p_user_id and m.character_instance_id=p_character_instance_id and m.status='active' and m.embedding is not null
  order by m.embedding<=>p_embedding limit least(greatest(p_limit,1),20)
$$;
revoke all on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer) to service_role;

alter table public.together_profiles enable row level security;
alter table public.together_worlds enable row level security;
alter table public.together_locations enable row level security;
alter table public.together_character_templates enable row level security;
alter table public.together_character_versions enable row level security;
alter table public.together_character_relationship_edges enable row level security;
alter table public.together_schedule_templates enable row level security;
alter table public.together_event_templates enable row level security;
alter table public.together_character_instances enable row level security;
alter table public.together_relationship_states enable row level security;
alter table public.together_conversations enable row level security;
alter table public.together_messages enable row level security;
alter table public.together_memories enable row level security;
alter table public.together_open_threads enable row level security;
alter table public.together_life_events enable row level security;
alter table public.together_knowledge_transfers enable row level security;
alter table public.together_date_templates enable row level security;
alter table public.together_date_sessions enable row level security;
alter table public.together_date_choices enable row level security;
alter table public.together_moments enable row level security;
alter table public.together_proactive_messages enable row level security;
alter table public.together_notification_preferences enable row level security;
alter table public.together_push_tokens enable row level security;
alter table public.together_entitlements enable row level security;
alter table public.together_analytics_events enable row level security;
alter table public.together_safety_reports enable row level security;
alter table public.together_safety_events enable row level security;

create policy together_worlds_read on public.together_worlds for select using(published);
create policy together_locations_read on public.together_locations for select using(exists(select 1 from public.together_worlds w where w.id=world_id and w.published));
create policy together_templates_read on public.together_character_templates for select using(published);
create policy together_versions_read on public.together_character_versions for select using(published_at is not null);
create policy together_edges_read on public.together_character_relationship_edges for select using(true);
create policy together_schedules_read on public.together_schedule_templates for select using(true);
create policy together_event_templates_read on public.together_event_templates for select using(active);
create policy together_date_templates_read on public.together_date_templates for select using(active);

create policy together_profiles_own_read on public.together_profiles for select to authenticated using(user_id=auth.uid());
create policy together_profiles_own_insert on public.together_profiles for insert to authenticated with check(user_id=auth.uid());
create policy together_profiles_own_update on public.together_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy together_instances_own_read on public.together_character_instances for select to authenticated using(user_id=auth.uid());
create policy together_relationships_own_read on public.together_relationship_states for select to authenticated using(user_id=auth.uid());
create policy together_conversations_own_read on public.together_conversations for select to authenticated using(user_id=auth.uid());
create policy together_messages_own_read on public.together_messages for select to authenticated using(user_id=auth.uid());
create policy together_memories_own_read on public.together_memories for select to authenticated using(user_id=auth.uid());
create policy together_memories_own_update on public.together_memories for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy together_memories_own_delete on public.together_memories for delete to authenticated using(user_id=auth.uid());
create policy together_threads_own_read on public.together_open_threads for select to authenticated using(user_id=auth.uid());
create policy together_life_events_own_read on public.together_life_events for select to authenticated using(user_id=auth.uid());
create policy together_transfers_own_read on public.together_knowledge_transfers for select to authenticated using(user_id=auth.uid());
create policy together_date_sessions_own_read on public.together_date_sessions for select to authenticated using(user_id=auth.uid());
create policy together_date_choices_own_read on public.together_date_choices for select to authenticated using(user_id=auth.uid());
create policy together_moments_own_read on public.together_moments for select to authenticated using(user_id=auth.uid());
create policy together_proactive_own_read on public.together_proactive_messages for select to authenticated using(user_id=auth.uid());
create policy together_notification_own_all on public.together_notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy together_push_tokens_own_read on public.together_push_tokens for select to authenticated using(user_id=auth.uid());
create policy together_entitlements_own_read on public.together_entitlements for select to authenticated using(user_id=auth.uid());
create policy together_analytics_own_insert on public.together_analytics_events for insert to authenticated with check(user_id=auth.uid());
create policy together_reports_own_read on public.together_safety_reports for select to authenticated using(user_id=auth.uid());
create policy together_reports_own_insert on public.together_safety_reports for insert to authenticated with check(user_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('together-user-media','together-user-media',false,10485760,array['image/jpeg','image/png','image/webp','audio/m4a','audio/mp4']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy together_media_own_read on storage.objects for select to authenticated using(bucket_id='together-user-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy together_media_own_insert on storage.objects for insert to authenticated with check(bucket_id='together-user-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy together_media_own_update on storage.objects for update to authenticated using(bucket_id='together-user-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='together-user-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy together_media_own_delete on storage.objects for delete to authenticated using(bucket_id='together-user-media' and (storage.foldername(name))[1]=auth.uid()::text);

insert into public.together_worlds(id,name,slug,description,hero_asset_key,theme,metadata,published) values
('10000000-0000-4000-8000-000000000001','City Life','city-life','A city full of people, places, and stories.','city-life-hero',jsonb_build_object('accent','#F1679A','violet','#9A68FF'),jsonb_build_object('timezone','America/New_York'),true)
on conflict(id) do update set name=excluded.name,description=excluded.description,hero_asset_key=excluded.hero_asset_key,theme=excluded.theme,metadata=excluded.metadata,published=true;

insert into public.together_locations(id,world_id,name,slug,description,category,visual_asset_key,hours,possible_activities,metadata) values
('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Juniper Café','juniper-cafe','A warm neighborhood café where the city slows down just enough for conversations to matter.','cafe','juniper-cafe',jsonb_build_object('open','07:00','close','23:00'),array['coffee','dinner','open mic','conversation'],jsonb_build_object('signature','cardamom latte')),
('11000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',E'Maya\'s Apartment','maya-apartment',E'Maya\'s lived-in apartment, full of contact sheets, plants, and half-finished playlists.','home','maya-apartment',null,array['rest','edit photos','watch movies'],jsonb_build_object('private',true)),
('11000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Skyline Rooftop','skyline-rooftop','A rooftop hideaway for movie nights, trivia, and long views over City Life.','entertainment','skyline-rooftop',jsonb_build_object('open','17:00','close','01:00'),array['movie night','trivia','drinks'],jsonb_build_object()),
('11000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Northside Bar','northside-bar','A relaxed neighborhood bar known for live music and fiercely competitive trivia.','bar','northside-bar',jsonb_build_object('open','16:00','close','02:00'),array['live music','trivia','drinks'],jsonb_build_object('age_requirement',21)),
('11000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Riverwalk','riverwalk','A tree-lined path beside the water, best at dusk when the city lights come on.','outdoors','riverwalk',null,array['walk','photo walk','talk'],jsonb_build_object()),
('11000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Photography Studio','photography-studio','A bright working studio where Maya shoots, edits, and occasionally argues with impossible clients.','work','photography-studio',jsonb_build_object('open','08:00','close','19:00'),array['client shoot','editing','planning'],jsonb_build_object())
on conflict(id) do update set description=excluded.description,visual_asset_key=excluded.visual_asset_key,hours=excluded.hours,possible_activities=excluded.possible_activities,metadata=excluded.metadata;

insert into public.together_character_templates(id,name,slug,age,occupation,biography,current_published_version,published) values
('12000000-0000-4000-8000-000000000001','Maya','maya',26,'Photographer','A playful, independent city photographer who notices small details, values sincerity, and warms gradually through shared history.',1,true),
('12000000-0000-4000-8000-000000000002','Chloe','chloe',27,'Designer','Maya''s adventurous, witty, outgoing close friend. She is perceptive, spontaneous, and impossible to bluff.',1,true),
('12000000-0000-4000-8000-000000000003','Alex','alex',28,'Creative Producer','A thoughtful, curious creative with a dry sense of humor and a habit of taking long photo walks.',1,true)
on conflict(id) do update set biography=excluded.biography,current_published_version=1,published=true;

insert into public.together_character_versions(id,character_template_id,version,personality_config,values_config,interests,communication_style,appearance_config,voice_config,boundaries,default_social_graph,portrait_asset_key,published_at) values
('13000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',1,'{"playful":0.78,"creative":0.92,"sarcastic":0.58,"empathetic":0.84,"independent":0.9,"warmth_after_familiarity":0.88}','{"honesty":0.9,"autonomy":0.92,"kindness":0.82,"curiosity":0.86}',array['photography','movies','sushi','live music','football','exploring the city'],'{"length":"short_to_medium","emoji_frequency":"occasional","teasing":true,"generic_questions":"avoid","callback_frequency":"natural"}','{"age_appearance":26,"style":"creative city professional","asset":"maya-portrait"}','{"provider":"future","voice_id":null}',array['fictional AI disclosure when asked','no coercive dependency','no instant romantic obsession','respect user boundaries'],'[{"character":"chloe","relationship":"close friends"},{"character":"alex","relationship":"friends"}]','maya-portrait',now()),
('13000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002',1,'{"adventurous":0.92,"witty":0.84,"outgoing":0.9,"perceptive":0.88,"spontaneous":0.86}','{"loyalty":0.9,"candor":0.86,"fun":0.88}',array['design','rooftops','live music','travel','food'],'{"length":"short_to_medium","emoji_frequency":"light","direct":true}','{"age_appearance":27,"style":"bold contemporary","asset":"chloe-portrait"}','{}',array['fictional AI disclosure when asked','respect user boundaries'],'[{"character":"maya","relationship":"close friends"}]','chloe-portrait',now()),
('13000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003',1,'{"thoughtful":0.9,"curious":0.84,"calm":0.92,"dry_humor":0.76}','{"patience":0.9,"craft":0.82,"honesty":0.84}',array['street photography','films','coffee','architecture'],'{"length":"short_to_medium","emoji_frequency":"rare","dry_humor":true}','{"age_appearance":28,"style":"understated creative","asset":"alex-portrait"}','{}',array['fictional AI disclosure when asked','respect user boundaries'],'[{"character":"maya","relationship":"friends"}]','alex-portrait',now())
on conflict(id) do update set personality_config=excluded.personality_config,values_config=excluded.values_config,interests=excluded.interests,communication_style=excluded.communication_style,boundaries=excluded.boundaries,portrait_asset_key=excluded.portrait_asset_key,published_at=excluded.published_at;

insert into public.together_character_relationship_edges(world_id,source_template_id,target_template_id,relationship_type,affinity,trust,history,metadata) values
('10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','close_friends',91,94,'They met through a chaotic student photo shoot and stayed close.',jsonb_build_object('can_share_personal_context',true)),
('10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001','close_friends',93,92,'Chloe is one of the few people who can call Maya out without starting a fight.',jsonb_build_object('can_share_personal_context',true)),
('10000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003','friends',64,68,'They overlap through City Life''s creative scene and occasional photo walks.',jsonb_build_object('can_share_personal_context',false))
on conflict(world_id,source_template_id,target_template_id) do update set relationship_type=excluded.relationship_type,affinity=excluded.affinity,trust=excluded.trust,history=excluded.history,metadata=excluded.metadata;

insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence) 
select '13000000-0000-4000-8000-000000000001'::uuid,d,0,450,'11000000-0000-4000-8000-000000000002','sleeping','busy',-1,'resting' from generate_series(0,6)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000001'::uuid,d,450,540,'11000000-0000-4000-8000-000000000002','getting ready and answering messages','limited',0,'quiet' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000001'::uuid,d,540,1050,'11000000-0000-4000-8000-000000000006','working on a client shoot','busy',1,'focused' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000001'::uuid,d,1050,1200,'11000000-0000-4000-8000-000000000001','having coffee and editing photos','available',0,'playful' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000001'::uuid,d,1200,1440,'11000000-0000-4000-8000-000000000002','winding down at home','available',-1,'warm' from generate_series(0,6)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence) values
('13000000-0000-4000-8000-000000000001',0,540,1050,'11000000-0000-4000-8000-000000000005','taking a slow photo walk','limited',1,'curious'),
('13000000-0000-4000-8000-000000000001',6,540,1050,'11000000-0000-4000-8000-000000000001','meeting Chloe for coffee','available',1,'playful') on conflict do nothing;

insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000002'::uuid,d,0,510,'11000000-0000-4000-8000-000000000002','offline for the night','busy',-1,'resting' from generate_series(0,6)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000002'::uuid,d,510,1050,'11000000-0000-4000-8000-000000000006','working through a design sprint','busy',1,'focused' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000002'::uuid,d,1050,1440,'11000000-0000-4000-8000-000000000003','meeting friends on the rooftop','available',0,'adventurous' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000003'::uuid,d,0,480,'11000000-0000-4000-8000-000000000002','offline for the night','busy',-1,'resting' from generate_series(0,6)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000003'::uuid,d,480,1020,'11000000-0000-4000-8000-000000000006','producing a creative project','busy',1,'thoughtful' from generate_series(1,5)d on conflict do nothing;
insert into public.together_schedule_templates(character_version_id,day_of_week,start_minute,end_minute,location_id,activity,availability,energy_delta,mood_influence)
select '13000000-0000-4000-8000-000000000003'::uuid,d,1020,1440,'11000000-0000-4000-8000-000000000005','finishing a photo walk','limited',0,'curious' from generate_series(1,5)d on conflict do nothing;

insert into public.together_event_templates(id,name,event_type,world_id,default_location_id,participant_template_ids,significance,probability,duration_minutes,narrative_summary,state_effects,user_visibility,proactive_eligible) values
('14000000-0000-4000-8000-000000000001','Coffee with Chloe','social','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',array['12000000-0000-4000-8000-000000000001'::uuid,'12000000-0000-4000-8000-000000000002'::uuid],.72,.18,75,'Maya caught up with Chloe over coffee.','{"mood":{"playful":1}}','contextual',true),
('14000000-0000-4000-8000-000000000002','Client cancels shoot','work','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000006',array['12000000-0000-4000-8000-000000000001'::uuid],.58,.1,20,'A client canceled at the last minute, leaving Maya annoyed but unexpectedly free.','{"mood":{"frustrated":1},"availability":"available"}','contextual',true),
('14000000-0000-4000-8000-000000000003','Old camera discovery','discovery','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002',array['12000000-0000-4000-8000-000000000001'::uuid],.65,.08,30,'Maya found an old camera while reorganizing her apartment.','{"mood":{"nostalgic":1}}','contextual',true),
('14000000-0000-4000-8000-000000000004','Trivia invitation','social','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000004',array['12000000-0000-4000-8000-000000000001'::uuid,'12000000-0000-4000-8000-000000000003'::uuid],.6,.12,120,'Alex invited the group to Northside trivia.','{"mood":{"curious":1}}','visible',true),
('14000000-0000-4000-8000-000000000005','Stressful client interaction','work','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000006',array['12000000-0000-4000-8000-000000000001'::uuid],.7,.08,90,'A demanding client tested Maya''s patience during a shoot.','{"mood":{"stressed":2},"energy":-1}','contextual',true),
('14000000-0000-4000-8000-000000000006','Successful photo shoot','work','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000006',array['12000000-0000-4000-8000-000000000001'::uuid],.76,.14,180,'Maya finished a shoot she is genuinely proud of.','{"mood":{"energized":2},"energy":1}','visible',true),
('14000000-0000-4000-8000-000000000007','Rain changes plans','world','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',array['12000000-0000-4000-8000-000000000001'::uuid],.48,.16,60,'Rain pushed Maya''s plans indoors at Juniper Café.','{"location":"juniper-cafe"}','contextual',false),
('14000000-0000-4000-8000-000000000008','Reminder of the user','relationship','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000005',array['12000000-0000-4000-8000-000000000001'::uuid],.62,.08,10,'Something on Maya''s photo walk reminded her of a shared conversation.','{"relationship":{"affinity":1}}','contextual',true)
on conflict(id) do update set narrative_summary=excluded.narrative_summary,state_effects=excluded.state_effects,active=true;

insert into public.together_date_templates(id,name,slug,world_id,location_id,description,hero_asset_key,phases,unlock_rules,entitlement_key,active) values
('15000000-0000-4000-8000-000000000001','Dinner at Juniper','dinner-at-juniper','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','An intimate dinner where callbacks, curiosity, and small choices shape the night.','maya-portrait',
'[{"id":"arrival","title":"Arrival","choices":[{"id":"ask-day","label":"Ask about her day"},{"id":"airport-callback","label":"Tease her about the airport joke"}]},{"id":"ordering","title":"Ordering","choices":[{"id":"listen-recommendation","label":"Let Maya choose"},{"id":"share-favorite","label":"Share your favorite"}]},{"id":"early_conversation","title":"Easy Conversation","choices":[{"id":"ask-photography","label":"Ask about her photography"},{"id":"tell-weekend","label":"Tell her about your weekend"}]},{"id":"personal_conversation","title":"Something Real","choices":[{"id":"listen-carefully","label":"Listen without fixing it"},{"id":"share-honestly","label":"Open up too"}]},{"id":"unexpected_moment","title":"The Spicy Roll","choices":[{"id":"gentle-tease","label":"Try not to laugh"},{"id":"order-rescue","label":"Order a rescue drink"}]},{"id":"dessert","title":"Dessert","choices":[{"id":"share-dessert","label":"Order dessert to share"},{"id":"skip-dessert","label":"Keep talking"}]},{"id":"after_date","title":"After Dinner","choices":[{"id":"riverwalk","label":"Suggest a Riverwalk stroll"},{"id":"goodnight","label":"End on a warm note"}]},{"id":"resolution","title":"A New Memory","choices":[]}]',
'{"familiarity":28,"trust":24,"attraction":22,"conversation_count":5,"allowed_stages":["friend","flirting"],"no_major_conflict":true}','dinner_juniper',true)
on conflict(id) do update set phases=excluded.phases,unlock_rules=excluded.unlock_rules,active=true;

do $$ begin
  alter publication supabase_realtime add table public.together_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.together_character_instances;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.together_proactive_messages;
exception when duplicate_object then null; end $$;

commit;
