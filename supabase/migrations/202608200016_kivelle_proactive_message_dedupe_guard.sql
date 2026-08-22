begin;

-- Keep proactive delivery identity deterministic at the database boundary.
-- Application writers should still provide dedupe_key explicitly, but SQL
-- triggers and future writers cannot violate the table invariant when they
-- have a canonical life event or open thread.
create or replace function public.kivelle_proactive_message_dedupe_key(
  p_life_event_id uuid,
  p_open_thread_id uuid,
  p_character_instance_id uuid,
  p_conversation_id uuid,
  p_content text,
  p_eligible_at timestamptz
) returns text
language sql
immutable
set search_path=public
as $$
  select case
    when p_life_event_id is not null then 'event:' || p_life_event_id::text
    when p_open_thread_id is not null then 'thread:' || p_open_thread_id::text
    else 'proactive:' || md5(concat_ws(
      '|',
      p_character_instance_id::text,
      p_conversation_id::text,
      coalesce(p_content,''),
      coalesce(p_eligible_at::text,'')
    ))
  end
$$;

create or replace function public.kivelle_ensure_proactive_message_dedupe()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.dedupe_key is null or btrim(new.dedupe_key)='' then
    new.dedupe_key:=public.kivelle_proactive_message_dedupe_key(
      new.life_event_id,
      new.open_thread_id,
      new.character_instance_id,
      new.conversation_id,
      new.content,
      new.eligible_at
    );
  end if;
  return new;
end
$$;

drop trigger if exists together_proactive_messages_ensure_dedupe
  on public.together_proactive_messages;
create trigger together_proactive_messages_ensure_dedupe
before insert or update of dedupe_key,life_event_id,open_thread_id
on public.together_proactive_messages
for each row execute function public.kivelle_ensure_proactive_message_dedupe();

-- Repair the commitment waiting writer that originally omitted dedupe_key.
-- ON CONFLICT also makes repeated plan-state transitions safely idempotent,
-- including when an earlier waiting message was cancelled after arrival.
create or replace function public.kivelle_sync_commitment_life_beats()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  location_name text;
  waiting_event_id uuid;
  conversation_id uuid;
begin
  if new.starts_at is null then return new; end if;
  select name into location_name from public.together_locations where id=new.location_id;

  if new.status='scheduled' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_prep','Getting ready for '||new.title,'getting ready for '||new.title,array[new.character_instance_id],new.location_id,.58,new.starts_at-interval '60 minutes',new.starts_at-interval '20 minutes','{}'::jsonb,false,false,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','prep'),'commitment:prep:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,metadata=excluded.metadata;

    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_en_route','Heading to '||new.title,'heading to '||coalesce(location_name,new.title),array[new.character_instance_id],new.location_id,.64,new.starts_at-interval '20 minutes',new.starts_at,'{}'::jsonb,false,false,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','en_route'),'commitment:en-route:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,metadata=excluded.metadata;
  end if;

  if new.status='active' and new.participation_mode='live' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_waiting','Waiting for you','waiting for you at '||coalesce(location_name,new.title),array[new.character_instance_id],new.location_id,.92,new.starts_at,coalesce(new.grace_ends_at,new.starts_at+make_interval(mins=>new.grace_minutes)),'{}'::jsonb,true,true,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','waiting'),'commitment:waiting:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,location_id=excluded.location_id,narrative_summary=excluded.narrative_summary,user_should_know=true,metadata=excluded.metadata
    returning id into waiting_event_id;

    if waiting_event_id is null then
      select id into waiting_event_id
      from public.together_life_events
      where character_instance_id=new.character_instance_id
        and simulation_key='commitment:waiting:'||new.id::text;
    end if;

    select id into conversation_id
    from public.together_conversations
    where user_id=new.user_id
      and character_instance_id=new.character_instance_id
      and archived_at is null
    order by last_message_at desc nulls last,created_at desc
    limit 1;

    if conversation_id is not null then
      insert into public.together_proactive_messages(
        user_id,character_instance_id,life_event_id,dedupe_key,content,reason,
        status,eligible_at,expires_at,conversation_id
      )
      values(
        new.user_id,new.character_instance_id,waiting_event_id,
        'event:'||waiting_event_id::text,
        'Are you still coming?','Waiting at '||coalesce(location_name,new.title),
        'queued',new.starts_at+interval '15 minutes',
        coalesce(new.grace_ends_at,new.starts_at+make_interval(mins=>new.grace_minutes)),
        conversation_id
      )
      on conflict(character_instance_id,dedupe_key) do nothing;
    end if;
  end if;

  if new.companion_state='late' then
    insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,simulation_key)
    values(new.user_id,new.continuity_id,new.character_instance_id,'commitment_late','Running late',coalesce(new.companion_reason,'running late for '||new.title),array[new.character_instance_id],new.location_id,.78,greatest(now(),new.starts_at-interval '30 minutes'),coalesce(new.companion_eta_at,new.starts_at+interval '30 minutes'),'{}'::jsonb,true,true,jsonb_build_object('canonicalPlanId',new.id,'commitmentBeat','late','eta',new.companion_eta_at),'commitment:late:'||new.id::text)
    on conflict(character_instance_id,simulation_key) do update set ends_at=excluded.ends_at,narrative_summary=excluded.narrative_summary,user_should_know=true,metadata=excluded.metadata;

    if new.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(new.user_id,new.continuity_id,new.character_instance_id,new.source_conversation_id,'plan_late','shared_plan',new.id,jsonb_build_object('title',new.title,'eta',new.companion_eta_at,'reason',new.companion_reason))
      on conflict do nothing;
    end if;
  end if;

  return new;
end
$$;

comment on function public.kivelle_proactive_message_dedupe_key(uuid,uuid,uuid,uuid,text,timestamptz)
  is 'Produces stable proactive-message identity from its canonical event, thread, or delivery context.';

commit;
