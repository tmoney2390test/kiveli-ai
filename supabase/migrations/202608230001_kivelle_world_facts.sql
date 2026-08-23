-- Retrieval-driven authored world depth. These tables are intentionally
-- server-owned: the app receives only facts selected for an eligible turn.

create table if not exists public.together_world_facts(
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  slug text not null,
  title text not null,
  fact_text text not null,
  category text not null check(category in('history','law','adult','romance','dating','culture','custom','scandal','rumor','folklore','crime','politics','technology','economy','nightlife','privacy','social','institution','relationship','local_knowledge')),
  truth_mode text not null check(truth_mode in('canonical','disputed','rumor','secret')),
  knowledge_scope text not null check(knowledge_scope in('public','visitor','local','insider','private','story')),
  content_level text not null default 'standard' check(content_level in('standard','romance','mature','explicit')),
  district_location_id uuid references public.together_locations(id) on delete set null,
  location_id uuid references public.together_locations(id) on delete set null,
  topic_tags text[] not null default '{}',
  trigger_terms text[] not null default '{}',
  dayparts text[] not null default '{}',
  relationship_stages text[] not null default '{}',
  min_world_familiarity integer not null default 0 check(min_world_familiarity between 0 and 100),
  required_story_slug text,
  event_template_slug text,
  interactive boolean not null default false,
  weight numeric not null default 1 check(weight > 0),
  cooldown_turns integer not null default 20 check(cooldown_turns >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id,slug)
);

create index if not exists together_world_facts_world_category_idx on public.together_world_facts(world_id,active,category);
create index if not exists together_world_facts_location_idx on public.together_world_facts(world_id,location_id) where active;
create index if not exists together_world_facts_district_idx on public.together_world_facts(world_id,district_location_id) where active;
create index if not exists together_world_facts_topic_tags_idx on public.together_world_facts using gin(topic_tags);
create index if not exists together_world_facts_trigger_terms_idx on public.together_world_facts using gin(trigger_terms);

create table if not exists public.together_dialogue_opportunities(
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  slug text not null,
  topic text not null,
  angle text not null,
  framing text not null default '',
  location_id uuid references public.together_locations(id) on delete set null,
  district_location_id uuid references public.together_locations(id) on delete set null,
  topic_tags text[] not null default '{}',
  trigger_terms text[] not null default '{}',
  character_tags text[] not null default '{}',
  occupation_tags text[] not null default '{}',
  min_relationship_stage text check(min_relationship_stage is null or min_relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  max_relationship_stage text check(max_relationship_stage is null or max_relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  content_level text not null default 'standard' check(content_level in('standard','romance','mature','explicit')),
  min_spice_level integer check(min_spice_level is null or min_spice_level between 1 and 3),
  required_fact_slug text,
  required_story_slug text,
  dayparts text[] not null default '{}',
  interaction_modes text[] not null default '{}',
  weight numeric not null default 1 check(weight > 0),
  cooldown_turns integer not null default 24 check(cooldown_turns >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(world_id,slug)
);

create index if not exists together_dialogue_opportunities_world_idx on public.together_dialogue_opportunities(world_id,active);
create index if not exists together_dialogue_opportunities_location_idx on public.together_dialogue_opportunities(world_id,location_id) where active;
create index if not exists together_dialogue_opportunities_district_idx on public.together_dialogue_opportunities(world_id,district_location_id) where active;
create index if not exists together_dialogue_opportunities_topic_tags_idx on public.together_dialogue_opportunities using gin(topic_tags);
create index if not exists together_dialogue_opportunities_trigger_terms_idx on public.together_dialogue_opportunities using gin(trigger_terms);

create table if not exists public.together_scene_interaction_beats(
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  slug text not null,
  title text not null,
  location_id uuid references public.together_locations(id) on delete set null,
  district_location_id uuid references public.together_locations(id) on delete set null,
  interaction_type text not null check(interaction_type in('social','flirt','romance','adult','privacy','confession','vulnerability','humor','conflict','jealousy_context','mistake','interruption','environment','discovery','law','custom','history','mystery','group','character_character','relationship_choice')),
  seed text not null,
  affordances jsonb not null default '[]'::jsonb check(jsonb_typeof(affordances) in('array','object')),
  topic_tags text[] not null default '{}',
  character_tags text[] not null default '{}',
  min_relationship_stage text check(min_relationship_stage is null or min_relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  max_relationship_stage text check(max_relationship_stage is null or max_relationship_stage in('stranger','acquaintance','friend','flirting','dating','exclusive','long_term')),
  content_level text not null default 'standard' check(content_level in('standard','romance','mature','explicit')),
  min_spice_level integer check(min_spice_level is null or min_spice_level between 1 and 3),
  required_fact_slug text,
  required_story_slug text,
  interaction_modes text[] not null default '{}',
  co_present_required boolean not null default true,
  required_participant_count integer not null default 1 check(required_participant_count between 1 and 6),
  maximum_participant_count integer not null default 2 check(maximum_participant_count between 1 and 6),
  dayparts text[] not null default '{}',
  activity_tags text[] not null default '{}',
  weight numeric not null default 1 check(weight > 0),
  cooldown_hours integer not null default 24 check(cooldown_hours >= 0),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint together_scene_interaction_beats_participant_bounds check(required_participant_count <= maximum_participant_count),
  unique(world_id,slug)
);

create index if not exists together_scene_interaction_beats_world_idx on public.together_scene_interaction_beats(world_id,active,interaction_type);
create index if not exists together_scene_interaction_beats_location_idx on public.together_scene_interaction_beats(world_id,location_id) where active;
create index if not exists together_scene_interaction_beats_district_idx on public.together_scene_interaction_beats(world_id,district_location_id) where active;
create index if not exists together_scene_interaction_beats_topic_tags_idx on public.together_scene_interaction_beats using gin(topic_tags);
create index if not exists together_scene_interaction_beats_activity_tags_idx on public.together_scene_interaction_beats using gin(activity_tags);

alter table public.together_content_usage add column if not exists continuity_id uuid references public.together_continuities(id) on delete cascade;
alter table public.together_content_usage add column if not exists conversation_id uuid references public.together_conversations(id) on delete cascade;
alter table public.together_content_usage add column if not exists conversation_turn bigint;
alter table public.together_content_usage drop constraint if exists together_content_usage_content_kind_check;
alter table public.together_content_usage add constraint together_content_usage_content_kind_check check(content_kind in('event','arc','date','trip','photo','proactive','world_fact','dialogue_opportunity','interaction_beat'));
create index if not exists together_content_usage_conversation_kind_idx on public.together_content_usage(user_id,conversation_id,content_kind,used_at desc);
create unique index if not exists together_content_usage_authored_turn_uidx on public.together_content_usage(user_id,character_instance_id,conversation_id,content_kind,content_key,conversation_turn);

create or replace function public.kivelle_world_fact_candidates(
  p_world_id uuid,p_location_id uuid,p_district_id uuid,p_terms text[],p_categories text[],p_limit integer default 20
) returns setof public.together_world_facts
language sql stable security definer set search_path=public as $$
  select fact.* from public.together_world_facts fact
  where fact.world_id=p_world_id and fact.active
    and (
      (p_location_id is not null and fact.location_id=p_location_id)
      or (p_district_id is not null and fact.district_location_id=p_district_id)
      or fact.trigger_terms && coalesce(p_terms,'{}'::text[])
      or fact.topic_tags && coalesce(p_terms,'{}'::text[])
      or fact.category=any(coalesce(p_categories,'{}'::text[]))
      or (coalesce(cardinality(p_terms),0)=0 and fact.category in('culture','social','local_knowledge') and fact.knowledge_scope='public')
    )
  order by
    case when p_location_id is not null and fact.location_id=p_location_id then 4 else 0 end+
    case when p_district_id is not null and fact.district_location_id=p_district_id then 3 else 0 end+
    case when fact.trigger_terms && coalesce(p_terms,'{}'::text[]) then 2 else 0 end+
    case when fact.topic_tags && coalesce(p_terms,'{}'::text[]) then 1 else 0 end desc,
    fact.weight desc,fact.slug
  limit least(greatest(coalesce(p_limit,20),0),20)
$$;

create or replace function public.kivelle_dialogue_opportunity_candidates(
  p_world_id uuid,p_location_id uuid,p_district_id uuid,p_terms text[],p_limit integer default 15
) returns setof public.together_dialogue_opportunities
language sql stable security definer set search_path=public as $$
  select opportunity.* from public.together_dialogue_opportunities opportunity
  where opportunity.world_id=p_world_id and opportunity.active
    and (
      (p_location_id is not null and opportunity.location_id=p_location_id)
      or (p_district_id is not null and opportunity.district_location_id=p_district_id)
      or opportunity.trigger_terms && coalesce(p_terms,'{}'::text[])
      or opportunity.topic_tags && coalesce(p_terms,'{}'::text[])
    )
  order by
    case when opportunity.trigger_terms && coalesce(p_terms,'{}'::text[]) then 4 else 0 end+
    case when opportunity.topic_tags && coalesce(p_terms,'{}'::text[]) then 2 else 0 end+
    case when p_location_id is not null and opportunity.location_id=p_location_id then 1 else 0 end desc,
    opportunity.weight desc,opportunity.slug
  limit least(greatest(coalesce(p_limit,15),0),15)
$$;

create or replace function public.kivelle_scene_beat_candidates(
  p_world_id uuid,p_location_id uuid,p_district_id uuid,p_terms text[],p_interaction_modes text[],p_limit integer default 15
) returns setof public.together_scene_interaction_beats
language sql stable security definer set search_path=public as $$
  select beat.* from public.together_scene_interaction_beats beat
  where beat.world_id=p_world_id and beat.active
    and (cardinality(beat.interaction_modes)=0 or beat.interaction_modes && coalesce(p_interaction_modes,'{}'::text[]))
    and (
      (p_location_id is not null and beat.location_id=p_location_id)
      or (p_district_id is not null and beat.district_location_id=p_district_id)
      or beat.topic_tags && coalesce(p_terms,'{}'::text[])
      or beat.activity_tags && coalesce(p_terms,'{}'::text[])
    )
  order by
    case when p_location_id is not null and beat.location_id=p_location_id then 4 else 0 end+
    case when p_district_id is not null and beat.district_location_id=p_district_id then 3 else 0 end+
    case when beat.activity_tags && coalesce(p_terms,'{}'::text[]) then 2 else 0 end+
    case when beat.topic_tags && coalesce(p_terms,'{}'::text[]) then 1 else 0 end desc,
    beat.weight desc,beat.slug
  limit least(greatest(coalesce(p_limit,15),0),15)
$$;

create or replace function public.together_touch_authored_depth_updated_at() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at=now();return new;end
$$;

drop trigger if exists together_world_facts_touch_updated_at on public.together_world_facts;
create trigger together_world_facts_touch_updated_at before update on public.together_world_facts for each row execute function public.together_touch_authored_depth_updated_at();
drop trigger if exists together_dialogue_opportunities_touch_updated_at on public.together_dialogue_opportunities;
create trigger together_dialogue_opportunities_touch_updated_at before update on public.together_dialogue_opportunities for each row execute function public.together_touch_authored_depth_updated_at();
drop trigger if exists together_scene_interaction_beats_touch_updated_at on public.together_scene_interaction_beats;
create trigger together_scene_interaction_beats_touch_updated_at before update on public.together_scene_interaction_beats for each row execute function public.together_touch_authored_depth_updated_at();

alter table public.together_world_facts enable row level security;
alter table public.together_dialogue_opportunities enable row level security;
alter table public.together_scene_interaction_beats enable row level security;

revoke all on public.together_world_facts from anon,authenticated;
revoke all on public.together_dialogue_opportunities from anon,authenticated;
revoke all on public.together_scene_interaction_beats from anon,authenticated;
revoke execute on function public.kivelle_world_fact_candidates(uuid,uuid,uuid,text[],text[],integer) from public,anon,authenticated;
revoke execute on function public.kivelle_dialogue_opportunity_candidates(uuid,uuid,uuid,text[],integer) from public,anon,authenticated;
revoke execute on function public.kivelle_scene_beat_candidates(uuid,uuid,uuid,text[],text[],integer) from public,anon,authenticated;
grant select,insert,update,delete on public.together_world_facts to service_role;
grant select,insert,update,delete on public.together_dialogue_opportunities to service_role;
grant select,insert,update,delete on public.together_scene_interaction_beats to service_role;
grant execute on function public.kivelle_world_fact_candidates(uuid,uuid,uuid,text[],text[],integer) to service_role;
grant execute on function public.kivelle_dialogue_opportunity_candidates(uuid,uuid,uuid,text[],integer) to service_role;
grant execute on function public.kivelle_scene_beat_candidates(uuid,uuid,uuid,text[],text[],integer) to service_role;

comment on table public.together_world_facts is 'Server-owned canonical, disputed, rumored, and restricted facts selected through bounded deterministic retrieval.';
comment on table public.together_dialogue_opportunities is 'Server-owned conversational possibilities; never prewritten companion dialogue.';
comment on table public.together_scene_interaction_beats is 'Server-owned scene affordances that never declare user actions or directly mutate relationship state.';
