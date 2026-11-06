begin;
set local search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

create table public.together_world_pulse_templates (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  slug text not null,
  repeat_identity text not null,
  scheduling_rank integer not null check (scheduling_rank >= 0),
  content_version integer not null default 1 check (content_version > 0),
  title text not null check (length(btrim(title)) >= 12),
  feed_summary text not null check (length(btrim(feed_summary)) >= 40),
  detail_body text not null check (length(btrim(detail_body)) >= 100),
  group_message text,
  event_type text not null,
  location_id uuid not null references public.together_locations(id),
  primary_character_template_id uuid not null references public.together_character_templates(id),
  significance numeric(5,4) not null default .5 check (significance between 0 and 1),
  selection_weight numeric(8,3) not null default 1 check (selection_weight > 0),
  cooldown_days integer not null default 30 check (cooldown_days >= 30),
  content_rating text not null default 'standard' check (content_rating = 'standard'),
  facts jsonb not null check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) > 0),
  active boolean not null default false,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, slug),
  unique (world_id, repeat_identity),
  unique (world_id, scheduling_rank),
  unique (id, world_id)
);

create table public.together_world_pulse_template_participants (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.together_world_pulse_templates(id) on delete cascade,
  character_template_id uuid not null references public.together_character_templates(id),
  ordinal smallint not null check (ordinal between 0 and 3),
  role_label text not null check (length(btrim(role_label)) >= 3),
  perspective_summary text not null check (length(btrim(perspective_summary)) >= 40),
  default_direct_message text not null check (length(btrim(default_direct_message)) >= 12),
  knowledge jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (template_id, character_template_id),
  unique (template_id, ordinal)
);

create table public.together_world_pulse_occurrences (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  template_id uuid not null,
  repeat_identity text not null,
  content_version integer not null,
  occurrence_key text not null unique,
  scheduling_date date not null,
  slot smallint not null check (slot between 0 and 7),
  occurred_at timestamptz not null,
  ends_at timestamptz not null check (ends_at = occurred_at + interval '24 hours'),
  status text not null default 'reserved' check (status in ('reserved','published','missed')),
  published_at timestamptz,
  location_id uuid not null references public.together_locations(id),
  title_snapshot text not null,
  feed_summary_snapshot text not null,
  detail_body_snapshot text not null,
  group_message_snapshot text,
  event_type_snapshot text not null,
  significance_snapshot numeric(5,4) not null,
  facts_snapshot jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (template_id, world_id) references public.together_world_pulse_templates(id, world_id),
  unique (world_id, scheduling_date, slot),
  constraint together_world_pulse_no_repeat_720h exclude using gist (
    world_id with =,
    repeat_identity with =,
    -- Convert with a fixed zero offset so every indexed function is immutable.
    -- timestamptz + interval is STABLE and cannot back an exclusion index.
    tsrange(pg_catalog.timezone(interval '0', occurred_at),
      pg_catalog.timezone(interval '0', occurred_at) + interval '720 hours', '[)') with &&
  )
);
create index together_world_pulse_occurrences_recent_idx on public.together_world_pulse_occurrences(world_id, occurred_at desc) where status = 'published';
create index together_world_pulse_occurrences_repeat_idx on public.together_world_pulse_occurrences(world_id, repeat_identity, occurred_at desc);

create or replace function public.kivelle_world_pulse_guard_occurrence_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.world_id,new.template_id,new.repeat_identity,new.content_version,new.occurrence_key,
      new.scheduling_date,new.slot,new.occurred_at,new.ends_at,new.location_id,new.title_snapshot,
      new.feed_summary_snapshot,new.detail_body_snapshot,new.group_message_snapshot,
      new.event_type_snapshot,new.significance_snapshot,new.facts_snapshot,new.metadata,new.created_at)
    is distinct from
    row(old.world_id,old.template_id,old.repeat_identity,old.content_version,old.occurrence_key,
      old.scheduling_date,old.slot,old.occurred_at,old.ends_at,old.location_id,old.title_snapshot,
      old.feed_summary_snapshot,old.detail_body_snapshot,old.group_message_snapshot,
      old.event_type_snapshot,old.significance_snapshot,old.facts_snapshot,old.metadata,old.created_at) then
    raise exception 'Published Pulse occurrence snapshots and times are immutable' using errcode = '23514';
  end if;
  if old.status <> 'reserved' and new.status is distinct from old.status then
    raise exception 'Pulse occurrence status is final' using errcode = '23514';
  end if;
  if old.status = 'reserved' and new.status not in ('reserved','published','missed') then
    raise exception 'Invalid Pulse publication transition' using errcode = '23514';
  end if;
  if old.published_at is not null and new.published_at is distinct from old.published_at then
    raise exception 'Pulse publication time is immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger together_world_pulse_occurrence_snapshot_guard
  before update on public.together_world_pulse_occurrences
  for each row execute function public.kivelle_world_pulse_guard_occurrence_snapshot();

create table public.together_world_pulse_occurrence_participants (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.together_world_pulse_occurrences(id) on delete cascade,
  character_template_id uuid not null references public.together_character_templates(id),
  ordinal smallint not null check (ordinal between 0 and 3),
  primary_participant boolean not null default false,
  role_label_snapshot text not null,
  perspective_snapshot text not null,
  default_direct_message_snapshot text not null,
  knowledge_snapshot jsonb not null default '{}'::jsonb,
  unique (occurrence_id, character_template_id),
  unique (occurrence_id, ordinal)
);
create or replace function public.kivelle_world_pulse_guard_occurrence_participant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Pulse participant snapshots are immutable' using errcode = '23514';
  end if;
  if not exists (select 1 from public.together_world_pulse_occurrences
    where id = new.occurrence_id and status = 'reserved') then
    raise exception 'Pulse participants can only be captured during reservation' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger together_world_pulse_participant_snapshot_guard
  before insert or update on public.together_world_pulse_occurrence_participants
  for each row execute function public.kivelle_world_pulse_guard_occurrence_participant();

create table public.together_world_pulse_engagements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  occurrence_id uuid not null references public.together_world_pulse_occurrences(id),
  opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  messaged_character_template_ids uuid[] not null default '{}',
  group_conversation_id uuid references public.together_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, continuity_id, occurrence_id)
);
create index together_world_pulse_engagements_owner_idx on public.together_world_pulse_engagements(user_id, continuity_id, updated_at desc);

create table public.together_world_pulse_conversation_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  occurrence_id uuid not null references public.together_world_pulse_occurrences(id),
  target_character_template_ids uuid[] not null,
  context_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  active_until timestamptz not null default (now() + interval '7 days'),
  unique (user_id, continuity_id, conversation_id, occurrence_id)
);
create index together_world_pulse_links_conversation_idx on public.together_world_pulse_conversation_links(conversation_id, active_until desc);
create unique index together_world_pulse_unique_active_group on public.together_conversations
  (user_id, continuity_id, (metadata->>'worldPulseOccurrenceId'))
  where kind = 'group' and archived_at is null and user_archived_at is null
    and metadata ? 'worldPulseOccurrenceId';

create table public.together_world_pulse_settings (
  world_id uuid primary key references public.together_worlds(id) on delete cascade,
  enabled boolean not null default false,
  last_reserved_at timestamptz,
  last_published_at timestamptz,
  last_shortage_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.together_world_pulse_schedule_audit (
  id bigint generated always as identity primary key,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  scheduling_date date not null,
  expected_count smallint not null,
  reserved_count smallint not null,
  published_count smallint not null default 0,
  shortage_count smallint not null,
  status text not null check (status in ('planned','degraded','published')),
  checked_at timestamptz not null default now(),
  unique (world_id, scheduling_date)
);

create or replace function public.kivelle_world_pulse_check_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_continuity_user uuid; v_conversation_user uuid; v_conversation_continuity uuid;
begin
  select user_id into v_continuity_user from public.together_continuities where id = new.continuity_id;
  if v_continuity_user is distinct from new.user_id then raise exception 'Pulse continuity owner mismatch' using errcode = '23514'; end if;
  if tg_table_name = 'together_world_pulse_conversation_links' then
    select user_id, continuity_id into v_conversation_user, v_conversation_continuity
      from public.together_conversations where id = new.conversation_id;
    if v_conversation_user is distinct from new.user_id or v_conversation_continuity is distinct from new.continuity_id then
      raise exception 'Pulse conversation owner mismatch' using errcode = '23514';
    end if;
    if new.active_until > new.created_at + interval '7 days' then raise exception 'Pulse context may not exceed seven days' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger together_world_pulse_engagement_owner before insert or update on public.together_world_pulse_engagements
  for each row execute function public.kivelle_world_pulse_check_owner();
create trigger together_world_pulse_link_owner before insert or update on public.together_world_pulse_conversation_links
  for each row execute function public.kivelle_world_pulse_check_owner();

alter table public.together_world_pulse_templates enable row level security;
alter table public.together_world_pulse_template_participants enable row level security;
alter table public.together_world_pulse_occurrences enable row level security;
alter table public.together_world_pulse_occurrence_participants enable row level security;
alter table public.together_world_pulse_engagements enable row level security;
alter table public.together_world_pulse_conversation_links enable row level security;
alter table public.together_world_pulse_settings enable row level security;
alter table public.together_world_pulse_schedule_audit enable row level security;

revoke all on public.together_world_pulse_templates, public.together_world_pulse_template_participants,
  public.together_world_pulse_occurrences, public.together_world_pulse_occurrence_participants,
  public.together_world_pulse_engagements, public.together_world_pulse_conversation_links,
  public.together_world_pulse_settings, public.together_world_pulse_schedule_audit from public, anon, authenticated;
grant select, insert, update, delete on public.together_world_pulse_templates,
  public.together_world_pulse_template_participants, public.together_world_pulse_occurrences,
  public.together_world_pulse_occurrence_participants, public.together_world_pulse_engagements,
  public.together_world_pulse_conversation_links, public.together_world_pulse_settings,
  public.together_world_pulse_schedule_audit to service_role;
grant usage, select on sequence public.together_world_pulse_schedule_audit_id_seq to service_role;
grant select on public.together_world_pulse_engagements, public.together_world_pulse_conversation_links to authenticated;
create policy together_world_pulse_engagement_owner_read on public.together_world_pulse_engagements
  for select to authenticated using (user_id = (select auth.uid()));
create policy together_world_pulse_link_owner_read on public.together_world_pulse_conversation_links
  for select to authenticated using (user_id = (select auth.uid()));

comment on table public.together_world_pulse_occurrences is 'Global immutable Pulse event snapshots; reservations can become published or missed, never redated.';
comment on table public.together_world_pulse_conversation_links is 'Owner/Life-scoped seven-day grounding, not global character or relationship state.';

commit;
