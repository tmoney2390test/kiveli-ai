-- Authored content may be corrected before a reserved occurrence is published.
-- Once published, the captured event and its participants remain immutable.
create or replace function public.kivelle_world_pulse_guard_occurrence_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'reserved' and row(new.world_id,new.template_id,new.repeat_identity,new.content_version,new.occurrence_key,
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
  if old.status = 'reserved' and row(new.world_id,new.template_id,new.repeat_identity,new.occurrence_key,
      new.scheduling_date,new.slot,new.occurred_at,new.ends_at,new.created_at)
    is distinct from row(old.world_id,old.template_id,old.repeat_identity,old.occurrence_key,
      old.scheduling_date,old.slot,old.occurred_at,old.ends_at,old.created_at) then
    raise exception 'Reserved Pulse identity and times are immutable' using errcode = '23514';
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

create or replace function public.kivelle_world_pulse_guard_occurrence_participant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.together_world_pulse_occurrences
    where id = new.occurrence_id and status = 'reserved') then
    raise exception 'Pulse participants can only be revised before publication' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and row(new.occurrence_id,new.character_template_id,new.ordinal,new.primary_participant)
    is distinct from row(old.occurrence_id,old.character_template_id,old.ordinal,old.primary_participant) then
    raise exception 'Pulse participant identity and order are immutable' using errcode = '23514';
  end if;
  return new;
end $$;
