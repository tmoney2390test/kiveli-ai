begin;

alter table public.together_relationship_places
  add column if not exists continuity_id uuid references public.together_continuities(id) on delete cascade,
  add column if not exists familiarity numeric(5,4) not null default 0,
  add column if not exists sentiment numeric(5,4) not null default 0,
  add column if not exists confidence numeric(5,4) not null default 0,
  add column if not exists opinion_summary text,
  add column if not exists opinion_tags text[] not null default '{}',
  add column if not exists favorite_details text[] not null default '{}',
  add column if not exists disliked_details text[] not null default '{}',
  add column if not exists evidence_count integer not null default 0,
  add column if not exists last_evidence_at timestamptz,
  add column if not exists last_discussed_at timestamptz;

update public.together_relationship_places place
set continuity_id=instance.continuity_id
from public.together_character_instances instance
where instance.id=place.character_instance_id
  and place.continuity_id is null;

alter table public.together_relationship_places alter column continuity_id set not null;
alter table public.together_relationship_places drop constraint if exists together_relationship_places_familiarity_check;
alter table public.together_relationship_places add constraint together_relationship_places_familiarity_check check(familiarity between 0 and 1);
alter table public.together_relationship_places drop constraint if exists together_relationship_places_sentiment_check;
alter table public.together_relationship_places add constraint together_relationship_places_sentiment_check check(sentiment between -1 and 1);
alter table public.together_relationship_places drop constraint if exists together_relationship_places_confidence_check;
alter table public.together_relationship_places add constraint together_relationship_places_confidence_check check(confidence between 0 and 1);
alter table public.together_relationship_places drop constraint if exists together_relationship_places_evidence_count_check;
alter table public.together_relationship_places add constraint together_relationship_places_evidence_count_check check(evidence_count>=0);
create index if not exists together_relationship_places_continuity_idx on public.together_relationship_places(continuity_id,character_instance_id,last_visited_at desc);

create table if not exists public.together_character_place_profiles(
  id uuid primary key default gen_random_uuid(),
  character_version_id uuid not null references public.together_character_versions(id) on delete cascade,
  location_id uuid not null references public.together_locations(id) on delete cascade,
  familiarity numeric(5,4) not null default .35 check(familiarity between 0 and 1),
  sentiment numeric(5,4) not null default 0 check(sentiment between -1 and 1),
  confidence numeric(5,4) not null default .7 check(confidence between 0 and 1),
  opinion_summary text,
  opinion_tags text[] not null default '{}',
  preferred_activities text[] not null default '{}',
  favorite_details text[] not null default '{}',
  disliked_details text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_version_id,location_id)
);
create index if not exists together_character_place_profiles_version_idx on public.together_character_place_profiles(character_version_id,location_id);

create table if not exists public.together_character_place_opinion_evidence(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  location_id uuid not null references public.together_locations(id) on delete cascade,
  source_type text not null check(source_type in('chat','scene','date','plan')),
  source_id uuid not null,
  source_conversation_id uuid references public.together_conversations(id) on delete set null,
  source_message_id uuid references public.together_messages(id) on delete set null,
  sentiment numeric(5,4) not null check(sentiment between -1 and 1),
  confidence numeric(5,4) not null check(confidence between 0 and 1),
  summary text not null check(char_length(summary) between 1 and 280),
  opinion_tags text[] not null default '{}',
  favorite_details text[] not null default '{}',
  disliked_details text[] not null default '{}',
  reasoning_code text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(character_instance_id,location_id,source_type,source_id)
);
create index if not exists together_place_opinion_evidence_context_idx on public.together_character_place_opinion_evidence(character_instance_id,location_id,created_at);

create table if not exists public.together_relationship_place_visits(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  location_id uuid not null references public.together_locations(id) on delete cascade,
  source_type text not null check(source_type in('scene','date','plan','manual')),
  source_id uuid not null,
  occurred_at timestamptz not null,
  meaning_summary text,
  moment_id uuid references public.together_moments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(character_instance_id,location_id,source_type,source_id)
);
create index if not exists together_relationship_place_visits_context_idx on public.together_relationship_place_visits(character_instance_id,location_id,occurred_at desc);

alter table public.together_character_place_profiles enable row level security;
alter table public.together_character_place_opinion_evidence enable row level security;
alter table public.together_relationship_place_visits enable row level security;

drop policy if exists together_character_place_profiles_read on public.together_character_place_profiles;
create policy together_character_place_profiles_read on public.together_character_place_profiles for select to authenticated using(
  exists(
    select 1
    from public.together_character_versions version
    join public.together_character_templates template on template.id=version.character_template_id
    where version.id=character_version_id
      and (version.published_at is not null or template.creator_id=auth.uid())
  )
);
drop policy if exists together_place_opinion_evidence_own_read on public.together_character_place_opinion_evidence;
create policy together_place_opinion_evidence_own_read on public.together_character_place_opinion_evidence for select to authenticated using(user_id=auth.uid());
drop policy if exists together_relationship_place_visits_own_read on public.together_relationship_place_visits;
create policy together_relationship_place_visits_own_read on public.together_relationship_place_visits for select to authenticated using(user_id=auth.uid());
grant select on public.together_character_place_profiles,public.together_character_place_opinion_evidence,public.together_relationship_place_visits to authenticated;

create or replace function public.kivelle_record_relationship_place_visit(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_location_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_occurred_at timestamptz,
  p_meaning_summary text default null,
  p_moment_id uuid default null
) returns public.together_relationship_places
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_instance public.together_character_instances%rowtype;
  v_inserted uuid;
  v_result public.together_relationship_places%rowtype;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'forbidden'; end if;
  if p_source_type not in('scene','date','plan','manual') then raise exception 'invalid visit source'; end if;
  select * into v_instance from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id;
  if not found then raise exception 'character unavailable'; end if;
  if not exists(select 1 from public.together_locations where id=p_location_id) then raise exception 'location unavailable'; end if;

  insert into public.together_relationship_place_visits(user_id,continuity_id,character_instance_id,location_id,source_type,source_id,occurred_at,meaning_summary,moment_id)
  values(p_user_id,v_instance.continuity_id,p_character_instance_id,p_location_id,p_source_type,p_source_id,p_occurred_at,left(nullif(trim(p_meaning_summary),''),600),p_moment_id)
  on conflict(character_instance_id,location_id,source_type,source_id) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    insert into public.together_relationship_places(user_id,continuity_id,character_instance_id,location_id,visit_count,first_visited_at,last_visited_at,meaning_summary,familiarity,updated_at)
    values(p_user_id,v_instance.continuity_id,p_character_instance_id,p_location_id,1,p_occurred_at,p_occurred_at,left(nullif(trim(p_meaning_summary),''),600),.18,now())
    on conflict(character_instance_id,location_id) do update set
      visit_count=public.together_relationship_places.visit_count+1,
      first_visited_at=least(coalesce(public.together_relationship_places.first_visited_at,excluded.first_visited_at),excluded.first_visited_at),
      last_visited_at=greatest(coalesce(public.together_relationship_places.last_visited_at,excluded.last_visited_at),excluded.last_visited_at),
      meaning_summary=coalesce(excluded.meaning_summary,public.together_relationship_places.meaning_summary),
      familiarity=least(1,public.together_relationship_places.familiarity+.12),
      moment_ids=case when p_moment_id is not null and not p_moment_id=any(public.together_relationship_places.moment_ids) then array_append(public.together_relationship_places.moment_ids,p_moment_id) else public.together_relationship_places.moment_ids end,
      updated_at=now();
  end if;

  select * into v_result from public.together_relationship_places where character_instance_id=p_character_instance_id and location_id=p_location_id;
  return v_result;
end $$;
revoke all on function public.kivelle_record_relationship_place_visit(uuid,uuid,uuid,text,uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_record_relationship_place_visit(uuid,uuid,uuid,text,uuid,timestamptz,text,uuid) to service_role;

insert into public.together_relationship_place_visits(user_id,continuity_id,character_instance_id,location_id,source_type,source_id,occurred_at,meaning_summary,moment_id,metadata)
select episode.user_id,episode.continuity_id,episode.character_instance_id,episode.location_id,'scene',episode.id,episode.ended_at,episode.summary,episode.moment_id,jsonb_build_object('backfilled',true,'sceneSessionId',episode.scene_session_id)
from public.together_scene_episodes episode
where episode.location_id is not null
on conflict(character_instance_id,location_id,source_type,source_id) do nothing;

with visit_rollup as (
  select visit.user_id,visit.continuity_id,visit.character_instance_id,visit.location_id,count(*)::integer visit_count,min(visit.occurred_at) first_visited_at,max(visit.occurred_at) last_visited_at,(array_agg(visit.meaning_summary order by visit.occurred_at desc) filter(where visit.meaning_summary is not null))[1] meaning_summary,array_remove(array_agg(distinct visit.moment_id),null) moment_ids
  from public.together_relationship_place_visits visit
  group by visit.user_id,visit.continuity_id,visit.character_instance_id,visit.location_id
)
insert into public.together_relationship_places(user_id,continuity_id,character_instance_id,location_id,visit_count,first_visited_at,last_visited_at,meaning_summary,moment_ids,familiarity,updated_at)
select user_id,continuity_id,character_instance_id,location_id,visit_count,first_visited_at,last_visited_at,meaning_summary,moment_ids,least(1,.06+visit_count*.12),now()
from visit_rollup
on conflict(character_instance_id,location_id) do update set visit_count=greatest(public.together_relationship_places.visit_count,excluded.visit_count),first_visited_at=least(coalesce(public.together_relationship_places.first_visited_at,excluded.first_visited_at),excluded.first_visited_at),last_visited_at=greatest(coalesce(public.together_relationship_places.last_visited_at,excluded.last_visited_at),excluded.last_visited_at),meaning_summary=coalesce(excluded.meaning_summary,public.together_relationship_places.meaning_summary),moment_ids=coalesce((select array_agg(distinct item.value) from unnest(public.together_relationship_places.moment_ids||excluded.moment_ids) as item(value)),'{}'::uuid[]),familiarity=greatest(public.together_relationship_places.familiarity,excluded.familiarity),updated_at=now();

with seeds(character_slug,location_slug,familiarity,sentiment,confidence,opinion_summary,opinion_tags,preferred_activities,favorite_details,disliked_details) as (values
  ('maya','riverwalk',.86,.82,.92,'The Riverwalk is one of her favorite places to slow down, notice changing light, and talk without forcing the conversation.',array['photography','quiet','outdoors'],array['photo walk','talk'],array['dusk reflections','quieter overlooks'],array[]::text[]),
  ('maya','photography-studio',1,.48,.96,'She is proud of the work she does here, even if client days can make the studio feel more demanding than inspiring.',array['work','creative','complicated'],array['client shoot','editing'],array['north-facing windows','contact-sheet wall'],array['interruptions during a shoot']),
  ('maya','velvet-hour',.62,.58,.82,'She likes Velvet Hour when the piano is playing and the room is quiet enough for a real conversation.',array['music','quiet','cocktails'],array['music','conversation'],array['piano-side booths'],array['the room when it gets crowded']),
  ('chloe','skyline-rooftop',.82,.84,.9,'She likes that the rooftop can turn an ordinary night into an event without needing much of a plan.',array['social','spontaneous','nightlife'],array['movie night','drinks'],array['open skyline','last-minute screenings'],array['overplanned evenings']),
  ('chloe','northside-bar',.76,.68,.84,'Northside works for her when the room has energy, especially if there is music or something competitive happening.',array['social','music','competitive'],array['live music','trivia'],array['small stage','trivia crowd'],array['slow early evenings']),
  ('chloe','paper-trail',.34,.12,.72,'She respects the shop more than she naturally gravitates toward it; the staff notes entertain her more than quiet browsing does.',array['design','quiet','mixed'],array['browse'],array['handwritten staff notes'],array['staying quiet for too long']),
  ('alex','riverwalk',.88,.8,.91,'The Riverwalk suits his habit of taking the long route and noticing details that disappear when people rush.',array['photography','walking','quiet'],array['photo walk','talk'],array['dusk light','long path'],array[]::text[]),
  ('alex','paper-trail',.7,.62,.84,'He likes the back corner and the fact that nobody expects a quick opinion about anything there.',array['books','quiet','coffee'],array['browse','coffee'],array['rainy-day chair','back corner'],array['busy reading events']),
  ('alex','static-house',.55,.52,.78,'He likes the immediacy of the small stage, but only when the crowd is listening instead of performing for itself.',array['music','creative','observant'],array['live music'],array['low stage'],array['people talking through a set'])
)
insert into public.together_character_place_profiles(character_version_id,location_id,familiarity,sentiment,confidence,opinion_summary,opinion_tags,preferred_activities,favorite_details,disliked_details,metadata)
select version.id,location.id,seeds.familiarity,seeds.sentiment,seeds.confidence,seeds.opinion_summary,seeds.opinion_tags,seeds.preferred_activities,seeds.favorite_details,seeds.disliked_details,jsonb_build_object('source','authored_content','version',1)
from seeds
join public.together_character_templates template on template.slug=seeds.character_slug
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
join public.together_worlds world on world.slug='juniper-city'
join public.together_locations location on location.world_id=world.id and location.slug=seeds.location_slug
on conflict(character_version_id,location_id) do update set familiarity=excluded.familiarity,sentiment=excluded.sentiment,confidence=excluded.confidence,opinion_summary=excluded.opinion_summary,opinion_tags=excluded.opinion_tags,preferred_activities=excluded.preferred_activities,favorite_details=excluded.favorite_details,disliked_details=excluded.disliked_details,metadata=excluded.metadata,updated_at=now();

comment on table public.together_character_place_profiles is 'Content-authored starting perspective for a CharacterVersion at a canonical location.';
comment on table public.together_character_place_opinion_evidence is 'Validated evidence for opinions a character forms through canonical dialogue and shared experiences.';
comment on table public.together_relationship_place_visits is 'Idempotent ledger of shared visits used to build relationship-specific place history.';

commit;
