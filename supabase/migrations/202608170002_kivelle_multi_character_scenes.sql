begin;

alter table public.together_conversations drop constraint if exists together_conversations_kind_check;
alter table public.together_conversations add constraint together_conversations_kind_check check(kind in('first_meeting','direct','date','introduction','shared_scene'));

alter table public.together_messages
  add column if not exists scene_session_id uuid references public.together_scene_sessions(id) on delete set null,
  add column if not exists speaker_character_instance_id uuid references public.together_character_instances(id) on delete set null,
  add column if not exists scene_sequence bigint;
create index if not exists together_messages_scene_sequence_idx on public.together_messages(scene_session_id,scene_sequence) where scene_session_id is not null;

create table if not exists public.together_scene_participants(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  scene_session_id uuid not null references public.together_scene_sessions(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  role text not null check(role in('primary_companion','participant','guest')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  witnessed_from_sequence bigint not null default 1,
  witnessed_to_sequence bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scene_session_id,character_instance_id),
  check(left_at is null or left_at>=joined_at),
  check(witnessed_to_sequence is null or witnessed_to_sequence>=witnessed_from_sequence)
);
create unique index if not exists together_scene_participant_one_active_idx on public.together_scene_participants(character_instance_id) where left_at is null;
create index if not exists together_scene_participants_scene_active_idx on public.together_scene_participants(scene_session_id,joined_at) where left_at is null;

create table if not exists public.together_scene_messages(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  scene_session_id uuid not null references public.together_scene_sessions(id) on delete cascade,
  message_id uuid not null unique references public.together_messages(id) on delete cascade,
  role text not null check(role in('user','character')),
  character_instance_id uuid references public.together_character_instances(id) on delete set null,
  sequence bigint not null,
  witnessed_by_instance_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(scene_session_id,sequence),
  check((role='user' and character_instance_id is null) or (role='character' and character_instance_id is not null))
);
create index if not exists together_scene_messages_scene_idx on public.together_scene_messages(scene_session_id,sequence);

create or replace function public.kivelle_validate_scene_participant() returns trigger language plpgsql set search_path=public as $$
declare
  scene_user uuid;
  scene_continuity uuid;
  scene_world uuid;
  scene_location uuid;
  scene_ended_at timestamptz;
  instance_user uuid;
  instance_continuity uuid;
  instance_world uuid;
  instance_location uuid;
begin
  select user_id,continuity_id,world_id,location_id,ended_at into scene_user,scene_continuity,scene_world,scene_location,scene_ended_at from public.together_scene_sessions where id=new.scene_session_id;
  select instance.user_id,instance.continuity_id,location.world_id,instance.current_location_id into instance_user,instance_continuity,instance_world,instance_location
  from public.together_character_instances instance left join public.together_locations location on location.id=instance.current_location_id where instance.id=new.character_instance_id;
  if scene_user is null or scene_user<>new.user_id or scene_continuity<>new.continuity_id then raise exception 'scene participant must belong to its scene user and Life'; end if;
  if instance_user is null or instance_user<>new.user_id or instance_continuity<>new.continuity_id then raise exception 'scene participant character must belong to the same user and Life'; end if;
  -- Active scenes require genuine present-tense co-presence. Historical scene
  -- backfills preserve where the encounter happened even after a character
  -- has naturally moved elsewhere.
  if scene_ended_at is null and instance_world is distinct from scene_world then raise exception 'scene participant must be present in the same world'; end if;
  if scene_ended_at is null and instance_location is distinct from scene_location then raise exception 'scene participant must be present at the same location'; end if;
  return new;
end;
$$;

create or replace function public.kivelle_validate_scene_message() returns trigger language plpgsql set search_path=public as $$
declare
  scene_user uuid;
  scene_continuity uuid;
  message_user uuid;
  message_scene uuid;
begin
  select user_id,continuity_id into scene_user,scene_continuity from public.together_scene_sessions where id=new.scene_session_id;
  select user_id,scene_session_id into message_user,message_scene from public.together_messages where id=new.message_id;
  if scene_user is null or scene_user<>new.user_id or scene_continuity<>new.continuity_id then raise exception 'scene message must belong to its scene user and Life'; end if;
  if message_user is null or message_user<>new.user_id or message_scene is distinct from new.scene_session_id then raise exception 'scene message mapping must match the canonical message'; end if;
  if new.role='character' and not exists(select 1 from public.together_scene_participants participant where participant.scene_session_id=new.scene_session_id and participant.character_instance_id=new.character_instance_id and participant.left_at is null) then raise exception 'scene speaker must be an active participant'; end if;
  return new;
end;
$$;

drop trigger if exists together_scene_participants_validate on public.together_scene_participants;
create trigger together_scene_participants_validate before insert or update of user_id,continuity_id,scene_session_id,character_instance_id on public.together_scene_participants for each row execute function public.kivelle_validate_scene_participant();
drop trigger if exists together_scene_messages_validate on public.together_scene_messages;
create constraint trigger together_scene_messages_validate after insert or update on public.together_scene_messages deferrable initially deferred for each row execute function public.kivelle_validate_scene_message();

insert into public.together_scene_participants(user_id,continuity_id,scene_session_id,character_instance_id,role,joined_at,witnessed_from_sequence,metadata)
select scene.user_id,scene.continuity_id,scene.id,scene.character_instance_id,'primary_companion',scene.started_at,1,jsonb_build_object('backfilled',true)
from public.together_scene_sessions scene
join public.together_character_instances instance on instance.id=scene.character_instance_id
where scene.ended_at is not null or instance.current_location_id=scene.location_id
on conflict(scene_session_id,character_instance_id) do nothing;

alter table public.together_scene_participants enable row level security;
alter table public.together_scene_messages enable row level security;
drop policy if exists together_scene_participants_own_read on public.together_scene_participants;
create policy together_scene_participants_own_read on public.together_scene_participants for select to authenticated using(user_id=auth.uid());
drop policy if exists together_scene_messages_own_read on public.together_scene_messages;
create policy together_scene_messages_own_read on public.together_scene_messages for select to authenticated using(user_id=auth.uid());
grant select on public.together_scene_participants,together_scene_messages to authenticated;

alter table public.together_knowledge_transfers alter column life_event_id drop not null;
alter table public.together_knowledge_transfers
  add column if not exists scene_session_id uuid references public.together_scene_sessions(id) on delete cascade,
  add column if not exists source_type text not null default 'life_event' check(source_type in('life_event','episode','scene','conversation'));
alter table public.together_knowledge_transfers add constraint together_knowledge_transfer_source_check check(life_event_id is not null or scene_session_id is not null) not valid;
alter table public.together_knowledge_transfers validate constraint together_knowledge_transfer_source_check;

comment on table public.together_scene_participants is 'Canonical character participation and witness interval for one shared in-world scene.';
comment on table public.together_scene_messages is 'Speaker attribution and witness scope over the one canonical shared-scene timeline.';

commit;
