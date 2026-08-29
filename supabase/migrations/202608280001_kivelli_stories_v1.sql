begin;

create table if not exists public.together_story_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  genre text not null,
  description text not null,
  world_slug text not null,
  status text not null default 'coming_soon' check (status in ('playable','coming_soon','retired')),
  duration_minutes_min integer not null default 60 check (duration_minutes_min > 0),
  duration_minutes_max integer not null default 120 check (duration_minutes_max >= duration_minutes_min),
  artwork_key text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.together_story_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_definition_id uuid not null references public.together_story_definitions(id) on delete restrict,
  story_slug text not null,
  status text not null default 'active' check (status in ('active','midnight','completed','abandoned')),
  current_loop integer not null default 0 check (current_loop >= 0),
  current_time_minute integer not null default 1240 check (current_time_minute between 0 and 1440),
  current_location_slug text not null,
  evidence_ids text[] not null default '{}',
  deduction_ids text[] not null default '{}',
  inventory_ids text[] not null default '{}',
  persistent_flags text[] not null default '{}',
  loop_flags text[] not null default '{}',
  witnessed_event_ids text[] not null default '{}',
  loop_discovered_evidence_ids text[] not null default '{}',
  loop_visited_location_ids text[] not null default '{}',
  character_state jsonb not null default '{}'::jsonb,
  loop_history jsonb not null default '[]'::jsonb,
  discovered_ending_ids text[] not null default '{}',
  completed_ending_id text,
  pinned_evidence_id text,
  pinned_character_id text,
  pinned_event_id text,
  settings jsonb not null default '{"textSize":"medium","sound":true,"motion":true,"content":"standard"}'::jsonb,
  last_checkpoint jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  started_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists together_story_campaigns_one_active_idx
  on public.together_story_campaigns(user_id, story_slug)
  where status in ('active','midnight');
create index if not exists together_story_campaigns_user_recent_idx
  on public.together_story_campaigns(user_id, last_played_at desc);

create table if not exists public.together_story_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.together_story_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_action_id text not null check (char_length(client_action_id) between 8 and 160),
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  campaign_version integer not null,
  created_at timestamptz not null default now(),
  unique(campaign_id, client_action_id)
);
create index if not exists together_story_actions_campaign_time_idx
  on public.together_story_actions(campaign_id, created_at desc);

create table if not exists public.together_story_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.together_story_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text,
  role text not null check (role in ('user','character','system')),
  character_slug text,
  content text not null check (char_length(content) between 1 and 12000),
  loop_number integer not null check (loop_number >= 0),
  story_minute integer not null check (story_minute between 0 and 1440),
  location_slug text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists together_story_messages_client_id_idx
  on public.together_story_messages(campaign_id, client_message_id);
create index if not exists together_story_messages_campaign_time_idx
  on public.together_story_messages(campaign_id, created_at, id);

create table if not exists public.together_story_discoveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_slug text not null,
  discovery_type text not null check (discovery_type in ('ending','achievement')),
  discovery_key text not null,
  first_campaign_id uuid references public.together_story_campaigns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  unique(user_id, story_slug, discovery_type, discovery_key)
);

alter table public.together_story_definitions enable row level security;
alter table public.together_story_campaigns enable row level security;
alter table public.together_story_actions enable row level security;
alter table public.together_story_messages enable row level security;
alter table public.together_story_discoveries enable row level security;

drop policy if exists "Published Kivelli Stories are readable" on public.together_story_definitions;
create policy "Published Kivelli Stories are readable" on public.together_story_definitions
  for select using (active and status <> 'retired');

drop policy if exists "Users read their story campaigns" on public.together_story_campaigns;
create policy "Users read their story campaigns" on public.together_story_campaigns
  for select using (auth.uid() = user_id);

drop policy if exists "Users read their story actions" on public.together_story_actions;
create policy "Users read their story actions" on public.together_story_actions
  for select using (auth.uid() = user_id);

drop policy if exists "Users read their story messages" on public.together_story_messages;
create policy "Users read their story messages" on public.together_story_messages
  for select using (auth.uid() = user_id);

drop policy if exists "Users read their story discoveries" on public.together_story_discoveries;
create policy "Users read their story discoveries" on public.together_story_discoveries
  for select using (auth.uid() = user_id);

create or replace function public.apply_together_story_action(
  p_campaign_id uuid,
  p_user_id uuid,
  p_expected_version integer,
  p_client_action_id text,
  p_action_type text,
  p_action_payload jsonb,
  p_status text,
  p_current_loop integer,
  p_current_time_minute integer,
  p_current_location_slug text,
  p_evidence_ids text[],
  p_deduction_ids text[],
  p_inventory_ids text[],
  p_persistent_flags text[],
  p_loop_flags text[],
  p_witnessed_event_ids text[],
  p_loop_discovered_evidence_ids text[],
  p_loop_visited_location_ids text[],
  p_character_state jsonb,
  p_loop_history jsonb,
  p_discovered_ending_ids text[],
  p_completed_ending_id text,
  p_pinned_evidence_id text,
  p_pinned_character_id text,
  p_pinned_event_id text,
  p_settings jsonb,
  p_action_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.together_story_campaigns%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  select action.result into v_existing
  from public.together_story_actions action
  where action.campaign_id = p_campaign_id
    and action.user_id = p_user_id
    and action.client_action_id = p_client_action_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_campaign
  from public.together_story_campaigns campaign
  where campaign.id = p_campaign_id and campaign.user_id = p_user_id
  for update;
  if not found then raise exception 'STORY_CAMPAIGN_NOT_FOUND' using errcode = 'P0002'; end if;

  select action.result into v_existing
  from public.together_story_actions action
  where action.campaign_id = p_campaign_id
    and action.user_id = p_user_id
    and action.client_action_id = p_client_action_id;
  if v_existing is not null then return v_existing; end if;

  if v_campaign.version <> p_expected_version then
    raise exception 'STORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.together_story_campaigns set
    status = p_status,
    current_loop = p_current_loop,
    current_time_minute = p_current_time_minute,
    current_location_slug = p_current_location_slug,
    evidence_ids = p_evidence_ids,
    deduction_ids = p_deduction_ids,
    inventory_ids = p_inventory_ids,
    persistent_flags = p_persistent_flags,
    loop_flags = p_loop_flags,
    witnessed_event_ids = p_witnessed_event_ids,
    loop_discovered_evidence_ids = p_loop_discovered_evidence_ids,
    loop_visited_location_ids = p_loop_visited_location_ids,
    character_state = p_character_state,
    loop_history = p_loop_history,
    discovered_ending_ids = p_discovered_ending_ids,
    completed_ending_id = p_completed_ending_id,
    pinned_evidence_id = p_pinned_evidence_id,
    pinned_character_id = p_pinned_character_id,
    pinned_event_id = p_pinned_event_id,
    settings = p_settings,
    last_checkpoint = p_action_result,
    version = version + 1,
    last_played_at = now(),
    completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
    updated_at = now()
  where id = p_campaign_id and user_id = p_user_id
  returning * into v_campaign;

  v_result := p_action_result || jsonb_build_object('campaign', to_jsonb(v_campaign));
  insert into public.together_story_actions(campaign_id,user_id,client_action_id,action_type,action_payload,result,campaign_version)
  values (p_campaign_id,p_user_id,p_client_action_id,p_action_type,coalesce(p_action_payload,'{}'::jsonb),v_result,v_campaign.version);
  return v_result;
end;
$$;

revoke all on function public.apply_together_story_action(uuid,uuid,integer,text,text,jsonb,text,integer,integer,text,text[],text[],text[],text[],text[],text[],text[],text[],jsonb,jsonb,text[],text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.apply_together_story_action(uuid,uuid,integer,text,text,jsonb,text,integer,integer,text,text[],text[],text[],text[],text[],text[],text[],text[],jsonb,jsonb,text[],text,text,text,text,jsonb,jsonb) to service_role;

insert into public.together_story_definitions(slug,title,genre,description,world_slug,status,duration_minutes_min,duration_minutes_max,artwork_key,metadata,active)
values
  ('the-last-night-in-vespormoor','The Last Night in Vespormoor','Gothic Time-Loop Mystery','At 8:40 p.m., the bell tower rings thirteen times. At midnight, Vespormoor forgets the night—and you are the only person who remembers.','vespormoor','playable',60,120,'stories/last-night-in-vespormoor',jsonb_build_object('evidenceCount',40,'endingCount',4,'expectedLoops','5–7'),true),
  ('ghost-signal-neon-kyo','Ghost Signal: Neon Kyo','Cyberpunk Mystery','A dead signal begins answering questions no living person has asked yet.','neon-kyo','coming_soon',60,120,'stories/ghost-signal-neon-kyo','{}'::jsonb,true),
  ('the-vanishing-at-port-vervelle','The Vanishing at Port Vervelle','Coastal Thriller','A missing guest, a sealed hotel ledger, and one tide that returns what the town buried.','port-vervelle','coming_soon',60,120,'stories/vanishing-port-vervelle','{}'::jsonb,true),
  ('the-juniper-house','The Juniper House','Psychological Mystery','Every guest remembers the house differently—and one remembers you arriving before you did.','juniper-city','coming_soon',60,120,'stories/juniper-house','{}'::jsonb,true)
on conflict(slug) do update set
  title=excluded.title,genre=excluded.genre,description=excluded.description,world_slug=excluded.world_slug,status=excluded.status,
  duration_minutes_min=excluded.duration_minutes_min,duration_minutes_max=excluded.duration_minutes_max,artwork_key=excluded.artwork_key,
  metadata=excluded.metadata,active=excluded.active,updated_at=now();

comment on table public.together_story_campaigns is 'Namespaced deterministic Kivelli Stories state. It never writes normal companion memory or relationship state.';
comment on table public.together_story_messages is 'Private story-mode transcript. Story dialogue is intentionally separate from canonical relationship-simulator messages.';

commit;
