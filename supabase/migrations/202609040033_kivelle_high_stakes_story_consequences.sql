begin;

-- The original participant validator referenced a world_id column that does
-- not exist on character templates. World membership belongs to the versioned
-- presence table, so validate against that canonical source instead.
create or replace function public.kivelle_validate_world_event_participant()
returns trigger language plpgsql set search_path=public as $$
declare
  v_event_user uuid;
  v_event_continuity uuid;
  v_event_world uuid;
  v_character_user uuid;
  v_character_continuity uuid;
  v_character_version uuid;
  v_has_world_presence boolean;
begin
  select user_id,continuity_id,world_id
    into v_event_user,v_event_continuity,v_event_world
  from public.together_world_event_instances
  where id=new.world_event_instance_id;

  select user_id,continuity_id,character_version_id
    into v_character_user,v_character_continuity,v_character_version
  from public.together_character_instances
  where id=new.character_instance_id;

  select exists(
    select 1 from public.together_character_world_presence presence
    where presence.character_version_id=v_character_version
      and presence.world_id=v_event_world
  ) into v_has_world_presence;

  if v_event_user is null or v_character_user is null
    or v_event_user<>new.user_id or v_character_user<>new.user_id
    or v_event_continuity<>new.continuity_id
    or v_character_continuity<>new.continuity_id
    or not coalesce(v_has_world_presence,false)
  then
    raise exception 'world event participant must remain inside one user continuity and an established character world';
  end if;
  return new;
end;
$$

-- High-stakes decisions use the existing continuity-scoped World Pulse event
-- ledger. This inactive template is a foreign-key anchor only; the recurring
-- materializer must never schedule it on its own.
insert into public.together_world_event_templates(
  world_id,slug,title,summary,event_type,weekdays,start_minute,duration_minutes,
  probability,knowledge_scope,significance,topic_tags,activity_tags,
  participant_selector,plan_affordances,weight,active,metadata
)
select
  world.id,'emergent-high-stakes','A turning point',
  'A consequential decision is changing this world.','story_consequence',
  '{}'::smallint[],0,1440,0,'public',1,
  array['turning-point','consequence']::text[],'{}'::text[],
  '{}'::jsonb,'{}'::jsonb,0,false,
  '{"source":"dialogue_consequence_v1","materializeAutomatically":false}'::jsonb
from public.together_worlds world
on conflict(world_id,slug) do update set
  event_type=excluded.event_type,
  probability=0,
  weight=0,
  active=false,
  metadata=public.together_world_event_templates.metadata||excluded.metadata,
  updated_at=now();

create index if not exists together_world_event_instances_narrative_source_idx
  on public.together_world_event_instances(continuity_id,((metadata->>'sourceAssistantMessageId')))
  where metadata->>'source'='dialogue_consequence_v1';

comment on index public.together_world_event_instances_narrative_source_idx is
  'Audits idempotent high-stakes decisions without indexing message or prompt contents.';

commit;
