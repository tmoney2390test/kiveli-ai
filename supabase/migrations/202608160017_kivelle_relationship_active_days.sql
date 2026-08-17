begin;

alter table public.together_relationship_states
  add column if not exists days_known integer not null default 1,
  add column if not exists last_spoken_local_date date;

alter table public.together_relationship_states
  drop constraint if exists together_relationship_states_days_known_check;
alter table public.together_relationship_states
  add constraint together_relationship_states_days_known_check
  check(days_known >= 1);

comment on column public.together_relationship_states.days_known is
  'Distinct relationship days with a canonical first-meeting day. Time passing alone never increments this value.';
comment on column public.together_relationship_states.last_spoken_local_date is
  'The user-experience local date of the latest user message to this character.';

create table if not exists public.together_relationship_active_days(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  local_date date not null,
  first_message_id uuid references public.together_messages(id) on delete set null,
  first_interaction_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(character_instance_id,local_date)
);

create index if not exists together_relationship_active_days_life_idx
  on public.together_relationship_active_days(user_id,continuity_id,local_date desc);

alter table public.together_relationship_active_days enable row level security;
drop policy if exists together_relationship_active_days_own_read on public.together_relationship_active_days;
create policy together_relationship_active_days_own_read
  on public.together_relationship_active_days for select to authenticated
  using(user_id=auth.uid());
grant select on public.together_relationship_active_days to authenticated;

-- Day one is the canonical first meeting. A full character reset creates a new
-- instance and relationship row, so the old ledger cascades away and this seed
-- creates exactly one new day for the replacement relationship.
create or replace function public.kivelle_seed_relationship_active_day()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare
  instance_row public.together_character_instances%rowtype;
  timezone_name text := 'UTC';
  started_at timestamptz;
  started_on date;
begin
  select instance.* into instance_row
  from public.together_character_instances instance
  where instance.id=new.character_instance_id and instance.user_id=new.user_id;
  if instance_row.id is null then return new; end if;

  select coalesce(profile.experience_timezone,'UTC') into timezone_name
  from public.together_profiles profile where profile.user_id=new.user_id;
  timezone_name:=coalesce(timezone_name,'UTC');
  started_at:=coalesce(instance_row.met_at,instance_row.introduced_at,instance_row.contact_added_at,instance_row.created_at,now());
  begin
    started_on:=public.kivelle_relationship_local_date(started_at,timezone_name);
  exception when others then
    started_on:=(started_at at time zone 'UTC')::date;
  end;

  insert into public.together_relationship_active_days(
    user_id,continuity_id,character_instance_id,local_date,first_interaction_at,metadata
  ) values(
    new.user_id,new.continuity_id,new.character_instance_id,started_on,started_at,jsonb_build_object('source','first_meeting')
  ) on conflict(character_instance_id,local_date) do nothing;

  update public.together_relationship_states relationship
  set days_known=greatest(1,(
    select count(*)::integer from public.together_relationship_active_days day
    where day.character_instance_id=new.character_instance_id
  ))
  where relationship.character_instance_id=new.character_instance_id;
  return new;
end $$;

drop trigger if exists together_relationship_seed_active_day on public.together_relationship_states;
create trigger together_relationship_seed_active_day
after insert on public.together_relationship_states
for each row execute function public.kivelle_seed_relationship_active_day();

-- Preserve current relationships without preserving the old elapsed-time bug.
-- Existing history is reconstructed from actual user-message dates plus the
-- relationship's original first-meeting day.
insert into public.together_relationship_active_days(
  user_id,continuity_id,character_instance_id,local_date,first_interaction_at,metadata
)
select
  relationship.user_id,
  relationship.continuity_id,
  relationship.character_instance_id,
  public.kivelle_relationship_local_date(
    coalesce(instance.met_at,instance.introduced_at,instance.contact_added_at,instance.created_at),
    coalesce(profile.experience_timezone,'UTC')
  ),
  coalesce(instance.met_at,instance.introduced_at,instance.contact_added_at,instance.created_at),
  jsonb_build_object('source','first_meeting','backfilled',true)
from public.together_relationship_states relationship
join public.together_character_instances instance on instance.id=relationship.character_instance_id
left join public.together_profiles profile on profile.user_id=relationship.user_id
on conflict(character_instance_id,local_date) do nothing;

with spoken_days as(
  select distinct on(message.character_instance_id,local_date.local_date)
    message.user_id,
    conversation.continuity_id,
    message.character_instance_id,
    local_date.local_date,
    message.id as first_message_id,
    message.created_at as first_interaction_at
  from public.together_messages message
  join public.together_conversations conversation on conversation.id=message.conversation_id
  left join public.together_profiles profile on profile.user_id=message.user_id
  cross join lateral(
    select public.kivelle_relationship_local_date(message.created_at,coalesce(profile.experience_timezone,'UTC')) as local_date
  ) local_date
  where message.role='user'
  order by message.character_instance_id,local_date.local_date,message.created_at,message.id
)
insert into public.together_relationship_active_days(
  user_id,continuity_id,character_instance_id,local_date,first_message_id,first_interaction_at,metadata
)
select user_id,continuity_id,character_instance_id,local_date,first_message_id,first_interaction_at,
  jsonb_build_object('source','conversation','backfilled',true)
from spoken_days
on conflict(character_instance_id,local_date) do update
set first_message_id=coalesce(together_relationship_active_days.first_message_id,excluded.first_message_id),
    metadata=together_relationship_active_days.metadata||jsonb_build_object('hasConversation',true);

update public.together_relationship_states relationship
set days_known=greatest(1,day_summary.day_count),
    last_spoken_local_date=day_summary.last_spoken_date
from(
  select day.character_instance_id,count(*)::integer as day_count,
    max(day.local_date) filter(where day.first_message_id is not null) as last_spoken_date
  from public.together_relationship_active_days day
  group by day.character_instance_id
) day_summary
where relationship.character_instance_id=day_summary.character_instance_id;

create or replace function public.kivelle_record_relationship_active_day()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare
  continuity_id_value uuid;
  timezone_name text := 'UTC';
  spoken_on date;
  day_count integer;
begin
  if new.role<>'user' then return new; end if;

  select conversation.continuity_id into continuity_id_value
  from public.together_conversations conversation
  where conversation.id=new.conversation_id
    and conversation.user_id=new.user_id
    and conversation.character_instance_id=new.character_instance_id;
  if continuity_id_value is null then return new; end if;

  select coalesce(profile.experience_timezone,'UTC') into timezone_name
  from public.together_profiles profile where profile.user_id=new.user_id;
  timezone_name:=coalesce(timezone_name,'UTC');
  begin
    spoken_on:=public.kivelle_relationship_local_date(new.created_at,timezone_name);
  exception when others then
    spoken_on:=(new.created_at at time zone 'UTC')::date;
  end;

  insert into public.together_relationship_active_days(
    user_id,continuity_id,character_instance_id,local_date,first_message_id,first_interaction_at,metadata
  ) values(
    new.user_id,continuity_id_value,new.character_instance_id,spoken_on,new.id,new.created_at,
    jsonb_build_object('source','conversation')
  ) on conflict(character_instance_id,local_date) do update
  set first_message_id=coalesce(together_relationship_active_days.first_message_id,excluded.first_message_id),
      metadata=together_relationship_active_days.metadata||jsonb_build_object('hasConversation',true);

  select count(*)::integer into day_count
  from public.together_relationship_active_days day
  where day.character_instance_id=new.character_instance_id;

  update public.together_relationship_states relationship
  set days_known=greatest(1,day_count),
      last_spoken_local_date=spoken_on,
      updated_at=greatest(relationship.updated_at,new.created_at)
  where relationship.character_instance_id=new.character_instance_id
    and relationship.user_id=new.user_id
    and relationship.continuity_id=continuity_id_value;
  return new;
end $$;

drop trigger if exists together_messages_record_relationship_day on public.together_messages;
create trigger together_messages_record_relationship_day
after insert on public.together_messages
for each row execute function public.kivelle_record_relationship_active_day();

comment on table public.together_relationship_active_days is
  'Canonical distinct relationship-day ledger. One first-meeting seed plus at most one row for each local calendar day the user talks to this character.';
comment on function public.kivelle_record_relationship_active_day() is
  'Counts a relationship day once per user-local calendar date when the user sends a message to that character.';

commit;
