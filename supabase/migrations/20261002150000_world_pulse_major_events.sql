begin;
set local search_path = public, extensions;

alter table public.together_world_pulse_occurrences drop constraint if exists together_world_pulse_occurrences_slot_check;
alter table public.together_world_pulse_occurrences add constraint together_world_pulse_occurrences_slot_check check (slot between 0 and 8);
alter table public.together_world_pulse_occurrences drop constraint together_world_pulse_no_repeat_720h;
alter table public.together_world_pulse_occurrences add constraint together_world_pulse_no_repeat_720h exclude using gist (
  world_id with =, repeat_identity with =,
  tsrange(pg_catalog.timezone(interval '0', occurred_at),
    pg_catalog.timezone(interval '0', occurred_at) +
      case when metadata->>'pulseTier' = 'major' then interval '1440 hours' else interval '720 hours' end, '[)') with &&
);

create or replace function public.kivelle_world_pulse_catalog_ready(p_world_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
with resident as (
  select distinct t.id
  from public.together_character_world_presence presence
  join public.together_character_versions version on version.id = presence.character_version_id
  join public.together_character_templates t on t.id = version.character_template_id
    and t.current_published_version = version.version
  where presence.world_id = p_world_id and presence.presence_type = 'resident'
    and t.published and t.lifecycle_status = 'published' and t.visibility = 'public' and t.creator_id is null
), valid_template as (
  select template.id, template.primary_character_template_id, template.scheduling_rank,
    count(participant.id) as participants,
    bool_or(participant.character_template_id = template.primary_character_template_id) as has_primary
  from public.together_world_pulse_templates template
  join public.together_locations location on location.id = template.location_id and location.world_id = p_world_id
  left join public.together_world_pulse_template_participants participant on participant.template_id = template.id
  where template.world_id = p_world_id and template.active and coalesce(template.metadata->>'pulseTier', 'routine') = 'routine' and template.cooldown_days >= 30
    and not exists (select 1 from jsonb_array_elements(template.facts) fact
      where jsonb_typeof(fact->'id') is distinct from 'string'
        or jsonb_typeof(fact->'text') is distinct from 'string'
        or jsonb_typeof(fact->'userVisible') is distinct from 'boolean'
        or jsonb_typeof(fact->'knownByCharacterTemplateIds') is distinct from 'array')
  group by template.id
  having count(participant.id) between 1 and 4
    and bool_or(participant.character_template_id = template.primary_character_template_id)
    and (count(participant.id) = 1 or max(length(coalesce(template.group_message, ''))) >= 12)
), coverage as (
  select resident.id,
    count(distinct participant.template_id) filter (where valid_template.id is not null) as appearances,
    count(distinct valid_template.id) filter (where valid_template.primary_character_template_id = resident.id) as leads
  from resident
  left join public.together_world_pulse_template_participants participant on participant.character_template_id = resident.id
  left join valid_template on valid_template.id = participant.template_id
  group by resident.id
)
select (select count(*) >= 200 from valid_template)
  and not exists (select 1 from generate_series(0, 199) required_rank
    where not exists (select 1 from valid_template where scheduling_rank = required_rank))
  and not exists (
    select 1 from generate_series(1, 4) required_size
    where (select count(*) from valid_template where participants = required_size) < 10
  )
  and not exists (select 1 from coverage where appearances < 8 or leads < 2)
  and not exists (
    select 1 from public.together_world_pulse_template_participants participant
    join public.together_world_pulse_templates template on template.id = participant.template_id
    where template.world_id = p_world_id and template.active and coalesce(template.metadata->>'pulseTier', 'routine') = 'routine'
      and not exists (select 1 from resident where resident.id = participant.character_template_id)
  )
  and (select count(*) from resident) > 0
$$;
revoke all on function public.kivelle_world_pulse_catalog_ready(uuid) from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_catalog_ready(uuid) to service_role;

create or replace function public.kivelle_world_pulse_reserve_world(
  p_world_id uuid, p_start_date date default (now() at time zone 'UTC')::date, p_days integer default 60
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_world public.together_worlds%rowtype;
  v_day date; v_cycle integer; v_budget integer; v_slot integer; v_ordinal integer;
  v_at timestamptz; v_key text; v_template public.together_world_pulse_templates%rowtype;
  v_occurrence_id uuid; v_reserved integer := 0; v_shortages integer := 0;
  v_day_reserved integer; v_day_shortages integer; v_prior_shortage integer; v_catalog_ready boolean;
begin
  if p_days < 1 or p_days > 90 then raise exception 'Pulse horizon must be 1–90 days'; end if;
  select * into v_world from public.together_worlds where id = p_world_id and published;
  if not found then raise exception 'Pulse world is unpublished'; end if;
  if not exists (select 1 from public.together_world_pulse_settings where world_id = p_world_id and enabled) then
    return jsonb_build_object('worldId', p_world_id, 'disabled', true, 'reserved', 0);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-pulse-v2:' || p_world_id::text, 0));
  v_catalog_ready := public.kivelle_world_pulse_catalog_ready(p_world_id);
  if not v_catalog_ready then
    raise warning 'World Pulse V2 catalog is not ready for world %', p_world_id;
    update public.together_world_pulse_settings set last_shortage_at = now(), updated_at = now() where world_id = p_world_id;
  end if;
  for v_day in select generate_series(p_start_date, p_start_date + p_days - 1, interval '1 day')::date loop
    v_cycle := ((v_day - date '2026-10-01') % 30 + 30) % 30;
    v_budget := case when v_cycle = any(array[2,8,14,20,26]) then 8
      when v_cycle = any(array[0,3,6,9,12,15,18,21,24,27]) then 7 else 6 end;
    v_day_reserved := 0; v_day_shortages := 0;
    for v_slot in 0..v_budget - 1 loop
      v_key := 'world-pulse-v2:' || p_world_id::text || ':' || v_day::text || ':' || v_slot::text;
      if exists (select 1 from public.together_world_pulse_occurrences where occurrence_key = v_key) then
        v_day_reserved := v_day_reserved + 1;
        continue;
      end if;
      v_at := (v_day::timestamp at time zone 'UTC') +
        (array[75,285,495,705,915,1125,1275,1395])[v_slot + 1] * interval '1 minute';
      select coalesce(sum(case when day_no = any(array[2,8,14,20,26]) then 8
        when day_no = any(array[0,3,6,9,12,15,18,21,24,27]) then 7 else 6 end), 0)::integer + v_slot
        into v_ordinal from generate_series(0, v_cycle - 1) day_no;
      select template.* into v_template from public.together_world_pulse_templates template
      where template.world_id = p_world_id and template.active and coalesce(template.metadata->>'pulseTier', 'routine') = 'routine'
        and (template.scheduling_rank = v_ordinal or template.scheduling_rank >= 200)
        and template.cooldown_days >= 30
        and exists (select 1 from public.together_locations location
          where location.id = template.location_id and location.world_id = p_world_id)
        and (select count(*) from public.together_world_pulse_template_participants participant
          where participant.template_id = template.id) between 1 and 4
        and ((select count(*) from public.together_world_pulse_template_participants participant
          where participant.template_id = template.id) = 1 or length(coalesce(template.group_message, '')) >= 12)
        and not exists (select 1 from jsonb_array_elements(template.facts) fact
          where jsonb_typeof(fact->'id') is distinct from 'string'
            or jsonb_typeof(fact->'text') is distinct from 'string'
            or jsonb_typeof(fact->'userVisible') is distinct from 'boolean'
            or jsonb_typeof(fact->'knownByCharacterTemplateIds') is distinct from 'array')
        and exists (select 1 from public.together_world_pulse_template_participants participant
          where participant.template_id = template.id and participant.character_template_id = template.primary_character_template_id)
        and not exists (select 1 from public.together_world_pulse_template_participants participant
          where participant.template_id = template.id and not exists (
            select 1 from public.together_character_world_presence presence
            join public.together_character_versions version on version.id = presence.character_version_id
            join public.together_character_templates resident on resident.id = version.character_template_id
              and resident.current_published_version = version.version
            where presence.world_id = p_world_id and presence.presence_type = 'resident'
              and resident.id = participant.character_template_id and resident.published
              and resident.lifecycle_status = 'published' and resident.visibility = 'public' and resident.creator_id is null))
        and not exists (
        select 1 from public.together_world_pulse_occurrences prior
        where prior.world_id = p_world_id and prior.repeat_identity = template.repeat_identity
          and prior.occurred_at > v_at - (template.cooldown_days * 24) * interval '1 hour'
          and prior.occurred_at < v_at + (template.cooldown_days * 24) * interval '1 hour'
      )
      order by case when template.scheduling_rank = v_ordinal then 0 else 1 end,
        template.scheduling_rank
      limit 1;
      if not found then
        v_shortages := v_shortages + 1; v_day_shortages := v_day_shortages + 1;
        continue;
      end if;
      insert into public.together_world_pulse_occurrences (
        world_id, template_id, repeat_identity, content_version, occurrence_key,
        scheduling_date, slot, occurred_at, ends_at, location_id,
        title_snapshot, feed_summary_snapshot, detail_body_snapshot, group_message_snapshot,
        event_type_snapshot, significance_snapshot, facts_snapshot, metadata
      ) values (
        p_world_id, v_template.id, v_template.repeat_identity, v_template.content_version, v_key,
        v_day, v_slot, v_at, v_at + interval '24 hours', v_template.location_id,
        v_template.title, v_template.feed_summary, v_template.detail_body, v_template.group_message,
        v_template.event_type, v_template.significance, v_template.facts,
        jsonb_build_object('templateSlug', v_template.slug)
      ) returning id into v_occurrence_id;
      insert into public.together_world_pulse_occurrence_participants (
        occurrence_id, character_template_id, ordinal, primary_participant,
        role_label_snapshot, perspective_snapshot, default_direct_message_snapshot, knowledge_snapshot
      ) select v_occurrence_id, participant.character_template_id, participant.ordinal,
        participant.character_template_id = v_template.primary_character_template_id,
        participant.role_label, participant.perspective_summary, participant.default_direct_message, participant.knowledge
      from public.together_world_pulse_template_participants participant
      where participant.template_id = v_template.id order by participant.ordinal;
      v_reserved := v_reserved + 1; v_day_reserved := v_day_reserved + 1;
    end loop;
    select shortage_count into v_prior_shortage from public.together_world_pulse_schedule_audit
      where world_id = p_world_id and scheduling_date = v_day;
    insert into public.together_world_pulse_schedule_audit (world_id, scheduling_date, expected_count, reserved_count, shortage_count, status)
      values (p_world_id, v_day, v_budget, v_day_reserved, v_day_shortages,
        case when v_day_shortages > 0 or not v_catalog_ready then 'degraded' else 'planned' end)
    on conflict (world_id, scheduling_date) do update set
      expected_count = excluded.expected_count, reserved_count = excluded.reserved_count,
      shortage_count = excluded.shortage_count, status = excluded.status, checked_at = now();
    if v_day_shortages > 0 and v_prior_shortage is distinct from v_day_shortages then
      raise warning 'World Pulse V2 shortage: world %, UTC day %, expected %, reserved %, missing %',
        p_world_id, v_day, v_budget, v_day_reserved, v_day_shortages;
    end if;
  end loop;
  update public.together_world_pulse_settings set last_reserved_at = now(),
    last_shortage_at = case when v_shortages > 0 then now() else last_shortage_at end,
    updated_at = now() where world_id = p_world_id;
  return jsonb_build_object('worldId', p_world_id, 'reserved', v_reserved, 'shortages', v_shortages,
    'degraded', v_shortages > 0 or not v_catalog_ready, 'catalogReady', v_catalog_ready);
end $$;
revoke all on function public.kivelle_world_pulse_reserve_world(uuid,date,integer) from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_reserve_world(uuid,date,integer) to service_role;

create or replace function public.kivelle_world_pulse_operational_audit()
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'worldId', world.id, 'worldSlug', world.slug, 'enabled', coalesce(settings.enabled, false),
  'catalogReady', public.kivelle_world_pulse_catalog_ready(world.id),
  'templateCount', (select count(*) from public.together_world_pulse_templates t where t.world_id = world.id and coalesce(t.metadata->>'pulseTier', 'routine') = 'routine'),
  'activePool', (select count(*) from public.together_world_pulse_templates t where t.world_id = world.id and t.active and coalesce(t.metadata->>'pulseTier', 'routine') = 'routine'),
  'recentCooldownIdentities', (select count(distinct o.repeat_identity) from public.together_world_pulse_occurrences o
    where o.world_id = world.id and coalesce(o.metadata->>'pulseTier', 'routine') = 'routine' and o.occurred_at <= now() and o.occurred_at > now() - interval '720 hours'),
  'futureReservations', (select count(*) from public.together_world_pulse_occurrences o
    where o.world_id = world.id and coalesce(o.metadata->>'pulseTier', 'routine') = 'routine' and o.status = 'reserved' and o.occurred_at > now()),
  'lastPublication', settings.last_published_at,
  'todayPublished', (select count(*) from public.together_world_pulse_occurrences o
    where o.world_id = world.id and coalesce(o.metadata->>'pulseTier', 'routine') = 'routine' and o.status = 'published' and o.scheduling_date = (now() at time zone 'UTC')::date),
  'projectedBaselineDays', (select count(*) from public.together_world_pulse_schedule_audit audit
    where audit.world_id = world.id and audit.scheduling_date between (now() at time zone 'UTC')::date and (now() at time zone 'UTC')::date + 59
      and audit.reserved_count >= 6),
  'degradedDays', (select count(*) from public.together_world_pulse_schedule_audit audit
    where audit.world_id = world.id and audit.scheduling_date between (now() at time zone 'UTC')::date and (now() at time zone 'UTC')::date + 59
      and audit.status = 'degraded'),
  'lastShortageAt', settings.last_shortage_at
) order by world.slug), '[]'::jsonb)
from public.together_worlds world
left join public.together_world_pulse_settings settings on settings.world_id = world.id
where world.published
$$;
revoke all on function public.kivelle_world_pulse_operational_audit() from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_operational_audit() to service_role;


create or replace function public.kivelle_world_pulse_publish_due()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_published integer; v_missed integer;
begin
  update public.together_world_pulse_occurrences occurrence set status = 'missed'
    where status = 'reserved' and occurred_at < now() - interval '24 hours'
      and exists (select 1 from public.together_world_pulse_settings settings
        where settings.world_id = occurrence.world_id and settings.enabled);
  get diagnostics v_missed = row_count;
  update public.together_world_pulse_occurrences occurrence set status = 'published', published_at = now()
    where status = 'reserved' and occurred_at <= now() and occurred_at >= now() - interval '24 hours'
      and exists (select 1 from public.together_world_pulse_settings settings
        where settings.world_id = occurrence.world_id and settings.enabled);
  get diagnostics v_published = row_count;
  update public.together_world_pulse_settings settings set last_published_at = now(), updated_at = now()
    where enabled and exists (select 1 from public.together_world_pulse_occurrences occurrence
      where occurrence.world_id = settings.world_id and occurrence.published_at >= now() - interval '1 minute');
  update public.together_world_pulse_schedule_audit audit set
    published_count = (select count(*) from public.together_world_pulse_occurrences occurrence
      where occurrence.world_id = audit.world_id and occurrence.scheduling_date = audit.scheduling_date and occurrence.status = 'published' and coalesce(occurrence.metadata->>'pulseTier', 'routine') = 'routine'),
    status = case when audit.shortage_count > 0 or audit.status = 'degraded' then 'degraded' else 'published' end,
    checked_at = now()
    where audit.scheduling_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date;
  return jsonb_build_object('published', v_published, 'missed', v_missed);
end $$;
revoke all on function public.kivelle_world_pulse_publish_due() from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_publish_due() to service_role;


-- Major incidents use the same global occurrence and publication pipeline as
-- ordinary Pulse, but an independent 70-day/15-template rotation. Monday
-- anchors ensure each UTC week receives one or two incidents; no pair is
-- closer than three days and a repeated identity is seventy days apart.
create or replace function public.kivelle_world_pulse_reserve_major_world(
  p_world_id uuid, p_start_date date default (now() at time zone 'UTC')::date, p_days integer default 70
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_day date; v_cycle integer; v_index integer; v_at timestamptz; v_key text;
  v_template public.together_world_pulse_templates%rowtype;
  v_occurrence_id uuid; v_reserved integer := 0; v_shortages integer := 0;
  v_count integer; v_ready boolean;
begin
  if p_days < 1 or p_days > 90 then raise exception 'Major Pulse horizon must be 1–90 days'; end if;
  if not exists (select 1 from public.together_worlds where id = p_world_id and published) then
    raise exception 'Major Pulse world is unpublished';
  end if;
  if not exists (select 1 from public.together_world_pulse_settings where world_id = p_world_id and enabled) then
    return jsonb_build_object('worldId', p_world_id, 'disabled', true, 'reserved', 0);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-pulse-v2:' || p_world_id::text, 0));
  select count(*) into v_count from public.together_world_pulse_templates
    where world_id = p_world_id and active and metadata->>'pulseTier' = 'major';
  if v_count = 0 then
    return jsonb_build_object('worldId', p_world_id, 'notConfigured', true, 'reserved', 0);
  end if;
  v_ready := v_count = 15 and not exists (
    select 1 from generate_series(200, 214) rank
    where not exists (select 1 from public.together_world_pulse_templates template
      where template.world_id = p_world_id and template.active
        and template.metadata->>'pulseTier' = 'major' and template.scheduling_rank = rank
        and template.cooldown_days >= 60)
  );
  if not v_ready then
    raise warning 'Major Pulse catalog incomplete for world %: % active of 15', p_world_id, v_count;
    update public.together_world_pulse_settings set last_shortage_at = now(), updated_at = now()
      where world_id = p_world_id;
    return jsonb_build_object('worldId', p_world_id, 'degraded', true, 'catalogReady', false, 'reserved', 0);
  end if;
  for v_day in select generate_series(p_start_date, p_start_date + p_days - 1, interval '1 day')::date loop
    if v_day < date '2026-10-05' then continue; end if;
    v_cycle := ((v_day - date '2026-10-05') % 70 + 70) % 70;
    v_index := array_position(array[0,4,7,14,18,21,28,32,35,42,46,49,56,60,63], v_cycle);
    if v_index is null then continue; end if;
    v_key := 'world-pulse-major:' || p_world_id::text || ':' || v_day::text;
    if exists (select 1 from public.together_world_pulse_occurrences where occurrence_key = v_key) then
      continue;
    end if;
    v_at := (v_day::timestamp at time zone 'UTC') + interval '18 hours 30 minutes';
    select template.* into v_template from public.together_world_pulse_templates template
    where template.world_id = p_world_id and template.active
      and template.metadata->>'pulseTier' = 'major'
      and template.scheduling_rank = 199 + v_index and template.cooldown_days >= 60
      and exists (select 1 from public.together_locations location
        where location.id = template.location_id and location.world_id = p_world_id)
      and (select count(*) from public.together_world_pulse_template_participants participant
        where participant.template_id = template.id) between 1 and 4
      and exists (select 1 from public.together_world_pulse_template_participants participant
        where participant.template_id = template.id and participant.character_template_id = template.primary_character_template_id)
      and not exists (select 1 from public.together_world_pulse_template_participants participant
        where participant.template_id = template.id and not exists (
          select 1 from public.together_character_world_presence presence
          join public.together_character_versions version on version.id = presence.character_version_id
          join public.together_character_templates resident on resident.id = version.character_template_id
            and resident.current_published_version = version.version
          where presence.world_id = p_world_id and presence.presence_type = 'resident'
            and resident.id = participant.character_template_id and resident.published
            and resident.lifecycle_status = 'published' and resident.visibility = 'public' and resident.creator_id is null))
      and not exists (select 1 from public.together_world_pulse_occurrences prior
        where prior.world_id = p_world_id and prior.repeat_identity = template.repeat_identity
          and prior.occurred_at > v_at - interval '60 days'
          and prior.occurred_at < v_at + interval '60 days')
    limit 1;
    if not found then
      v_shortages := v_shortages + 1;
      raise warning 'Major Pulse shortage: world %, UTC day %, rank %', p_world_id, v_day, 199 + v_index;
      continue;
    end if;
    insert into public.together_world_pulse_occurrences (
      world_id, template_id, repeat_identity, content_version, occurrence_key,
      scheduling_date, slot, occurred_at, ends_at, location_id,
      title_snapshot, feed_summary_snapshot, detail_body_snapshot, group_message_snapshot,
      event_type_snapshot, significance_snapshot, facts_snapshot, metadata
    ) values (
      p_world_id, v_template.id, v_template.repeat_identity, v_template.content_version, v_key,
      v_day, 8, v_at, v_at + interval '24 hours', v_template.location_id,
      v_template.title, v_template.feed_summary, v_template.detail_body, v_template.group_message,
      v_template.event_type, v_template.significance, v_template.facts,
      jsonb_build_object('templateSlug', v_template.slug, 'pulseTier', 'major')
    ) returning id into v_occurrence_id;
    insert into public.together_world_pulse_occurrence_participants (
      occurrence_id, character_template_id, ordinal, primary_participant,
      role_label_snapshot, perspective_snapshot, default_direct_message_snapshot, knowledge_snapshot
    ) select v_occurrence_id, participant.character_template_id, participant.ordinal,
      participant.character_template_id = v_template.primary_character_template_id,
      participant.role_label, participant.perspective_summary, participant.default_direct_message,
      participant.knowledge
    from public.together_world_pulse_template_participants participant
    where participant.template_id = v_template.id order by participant.ordinal;
    v_reserved := v_reserved + 1;
  end loop;
  if v_shortages > 0 then
    update public.together_world_pulse_settings set last_shortage_at = now(), updated_at = now()
      where world_id = p_world_id;
  end if;
  return jsonb_build_object('worldId', p_world_id, 'reserved', v_reserved,
    'shortages', v_shortages, 'catalogReady', true, 'degraded', v_shortages > 0);
end $$;
revoke all on function public.kivelle_world_pulse_reserve_major_world(uuid,date,integer) from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_reserve_major_world(uuid,date,integer) to service_role;

create or replace function public.kivelle_world_pulse_reserve_major_all()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_world record; v_results jsonb := '[]'::jsonb;
begin
  for v_world in select distinct settings.world_id from public.together_world_pulse_settings settings
    join public.together_worlds world on world.id = settings.world_id and world.published
    join public.together_world_pulse_templates template on template.world_id = world.id
      and template.metadata->>'pulseTier' = 'major'
    where settings.enabled loop
    v_results := v_results || jsonb_build_array(public.kivelle_world_pulse_reserve_major_world(
      v_world.world_id, (now() at time zone 'UTC')::date, 70));
  end loop;
  return v_results;
end $$;
revoke all on function public.kivelle_world_pulse_reserve_major_all() from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_reserve_major_all() to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute 'select cron.schedule($1,$2,$3)' using 'kivelle-world-pulse-major-reserve', '11 0 * * *',
      'select public.kivelle_world_pulse_reserve_major_all()';
  end if;
end $$;

create or replace function public.kivelle_world_pulse_major_operational_audit()
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object(
  'worldId', world.id, 'worldSlug', world.slug,
  'activeTemplates', (select count(*) from public.together_world_pulse_templates template
    where template.world_id = world.id and template.active and template.metadata->>'pulseTier' = 'major'),
  'nextReservedAt', (select min(occurrence.occurred_at) from public.together_world_pulse_occurrences occurrence
    where occurrence.world_id = world.id and occurrence.status = 'reserved'
      and occurrence.metadata->>'pulseTier' = 'major' and occurrence.occurred_at >= now()),
  'lastPublishedAt', (select max(occurrence.occurred_at) from public.together_world_pulse_occurrences occurrence
    where occurrence.world_id = world.id and occurrence.status = 'published'
      and occurrence.metadata->>'pulseTier' = 'major'),
  'lastShortageAt', settings.last_shortage_at
) order by world.slug), '[]'::jsonb)
from public.together_worlds world
join public.together_world_pulse_settings settings on settings.world_id = world.id
where world.published and exists (select 1 from public.together_world_pulse_templates template
  where template.world_id = world.id and template.metadata->>'pulseTier' = 'major')
$$;
revoke all on function public.kivelle_world_pulse_major_operational_audit() from public, anon, authenticated;
grant execute on function public.kivelle_world_pulse_major_operational_audit() to service_role;

commit;



