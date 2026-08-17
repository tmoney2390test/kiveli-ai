-- Full character reset: replace one relationship instance inside its current Life.
-- This is deliberately additive. The reusable template/version and continuity remain intact;
-- deleting the instance is the ownership boundary for relationship history.
begin;

create table if not exists public.together_character_reset_operations(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_template_id uuid not null references public.together_character_templates(id) on delete restrict,
  previous_character_instance_id uuid not null,
  replacement_character_instance_id uuid references public.together_character_instances(id) on delete set null,
  request_id text not null check(char_length(request_id) between 8 and 120),
  status text not null check(status in('pending','completed','failed')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,request_id)
);
create index if not exists together_character_reset_operations_previous_idx
  on public.together_character_reset_operations(user_id,previous_character_instance_id,created_at desc);
alter table public.together_character_reset_operations enable row level security;
drop policy if exists together_character_reset_operations_own_read on public.together_character_reset_operations;
create policy together_character_reset_operations_own_read on public.together_character_reset_operations
  for select to authenticated using(user_id=auth.uid());
grant select on public.together_character_reset_operations to authenticated;

alter table public.together_destructive_action_audit
  add column if not exists request_id text,
  add column if not exists continuity_id uuid references public.together_continuities(id) on delete set null,
  add column if not exists character_template_id uuid references public.together_character_templates(id) on delete set null,
  add column if not exists replacement_character_instance_id uuid references public.together_character_instances(id) on delete set null,
  add column if not exists result jsonb not null default '{}'::jsonb;
create index if not exists together_destructive_action_audit_request_idx
  on public.together_destructive_action_audit(user_id,request_id) where request_id is not null;

create or replace function public.kivelle_start_over_character(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_request_id text
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  target public.together_character_instances%rowtype;
  continuity public.together_continuities%rowtype;
  template public.together_character_templates%rowtype;
  version_row public.together_character_versions%rowtype;
  meeting jsonb := '{}'::jsonb;
  selected_location uuid;
  meeting_world uuid;
  fallback_location uuid;
  replacement_id uuid;
  conversation_id uuid;
  storage_paths text[] := array[]::text[];
  counts jsonb;
  result jsonb;
  became_active boolean := false;
  now_at timestamptz := now();
  operation_result jsonb;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if p_request_id is null or char_length(btrim(p_request_id))<8 then raise exception 'invalid reset request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':character-reset:'||btrim(p_request_id),0));

  select operation.result into operation_result
  from public.together_character_reset_operations operation
  where operation.user_id=p_user_id and operation.request_id=btrim(p_request_id) and operation.status='completed';
  if operation_result is not null then return operation_result; end if;

  select instance.* into target
  from public.together_character_instances instance
  join public.together_continuities life on life.id=instance.continuity_id and life.user_id=p_user_id
  join public.together_profiles profile on profile.user_id=p_user_id and profile.active_continuity_id=life.id
  where instance.id=p_character_instance_id
  for update;
  if target.id is null then raise exception 'character is not in the active Life'; end if;

  select * into continuity from public.together_continuities where id=target.continuity_id and user_id=p_user_id for update;
  became_active := continuity.active_companion_instance_id=target.id
    or exists(select 1 from public.together_profiles profile where profile.user_id=p_user_id and profile.active_continuity_id=target.continuity_id and profile.active_companion_instance_id=target.id);
  select * into template from public.together_character_templates where id=target.character_template_id;
  if template.id is null then raise exception 'character template not found'; end if;
  select * into version_row
  from public.together_character_versions version
  where version.character_template_id=template.id
    and (version.version=template.current_published_version or version.published_at is not null)
  order by (version.version=template.current_published_version) desc, version.published_at desc nulls last, version.version desc
  limit 1;
  if version_row.id is null then raise exception 'character version not found'; end if;
  meeting := coalesce(template.first_meeting,'{}'::jsonb);

  begin selected_location := nullif(meeting->>'location_id','')::uuid; exception when invalid_text_representation then selected_location:=null; end;
  if selected_location is not null and not exists(select 1 from public.together_locations where id=selected_location) then selected_location:=null; end if;
  if selected_location is not null then select world_id into meeting_world from public.together_locations where id=selected_location; end if;
  if meeting_world is null then
    begin meeting_world := nullif(meeting->>'world_id','')::uuid; exception when invalid_text_representation then meeting_world:=null; end;
  end if;
  if meeting_world is null then
    select presence.world_id into meeting_world
    from public.together_character_world_presence presence
    where presence.character_version_id=version_row.id and presence.presence_type<>'unavailable'
    order by (presence.presence_type='resident') desc, presence.updated_at desc limit 1;
  end if;
  if selected_location is null and meeting_world is not null then
    select presence.home_location_id into selected_location
    from public.together_character_world_presence presence
    where presence.character_version_id=version_row.id and presence.world_id=meeting_world
      and presence.presence_type<>'unavailable' and presence.home_location_id is not null
    order by (presence.presence_type='resident') desc, presence.updated_at desc limit 1;
    if selected_location is null then select world.default_arrival_location_id into selected_location from public.together_worlds world where world.id=meeting_world; end if;
  end if;
  if selected_location is null then
    select presence.home_location_id into selected_location
    from public.together_character_world_presence presence
    where presence.character_version_id=version_row.id and presence.presence_type<>'unavailable' and presence.home_location_id is not null
    order by (presence.presence_type='resident') desc, presence.updated_at desc limit 1;
  end if;
  if selected_location is null then
    select world.default_arrival_location_id into selected_location
    from public.together_worlds world where world.id=meeting_world;
  end if;
  if selected_location is null then raise exception 'RESET_NO_FIRST_MEETING'; end if;

  counts := jsonb_build_object(
    'conversations',(select count(*) from public.together_conversations where user_id=p_user_id and character_instance_id=target.id),
    'memories',(select count(*) from public.together_memories where user_id=p_user_id and character_instance_id=target.id),
    'upcomingPlans',(select count(*) from public.together_shared_plans where user_id=p_user_id and character_instance_id=target.id and status in('proposed','scheduled','active')),
    'historicalPlans',(select count(*) from public.together_shared_plans where user_id=p_user_id and character_instance_id=target.id and status in('completed','missed','cancelled')),
    'dates',(select count(*) from public.together_date_sessions where user_id=p_user_id and character_instance_id=target.id),
    'moments',(select count(*) from public.together_moments where user_id=p_user_id and (character_instance_id=target.id or target.id=any(participant_instance_ids))),
    'photos',(select count(*) from public.together_generated_media where user_id=p_user_id and character_instance_id=target.id),
    'stories',(select count(*) from public.together_story_arc_instances where user_id=p_user_id and character_instance_id=target.id)
  );
  select coalesce(array_agg(distinct storage_path) filter(where storage_path is not null),array[]::text[]) into storage_paths
  from public.together_generated_media where user_id=p_user_id and character_instance_id=target.id;

  -- Participant arrays have no foreign key, so remove shared records before the instance cascade.
  delete from public.together_life_events where user_id=p_user_id and (character_instance_id=target.id or target.id=any(participant_instance_ids));
  delete from public.together_moments where user_id=p_user_id and (character_instance_id=target.id or target.id=any(participant_instance_ids));
  delete from public.together_character_instances where id=target.id and user_id=p_user_id;

  insert into public.together_character_instances(
    user_id,continuity_id,character_template_id,character_version_id,relationship_stage,current_mood,current_location_id,current_activity,current_energy,
    contact_added_at,introduced_at,last_simulated_at,metadata
  ) values(
    p_user_id,target.continuity_id,template.id,version_row.id,'stranger',coalesce(nullif(meeting->>'mood',''),'curious'),selected_location,
    coalesce(nullif(meeting->>'companion_activity',''),'going about the day'),'medium',null,now_at,now_at,
    jsonb_build_object('firstMeetingTitle',nullif(meeting->>'title',''),'resetAt',now_at)
  ) returning id into replacement_id;
  insert into public.together_relationship_states(character_instance_id,user_id,continuity_id)
    values(replacement_id,p_user_id,target.continuity_id);
  insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title,last_read_at,metadata)
    values(p_user_id,target.continuity_id,replacement_id,'first_meeting',coalesce(nullif(meeting->>'title',''),'First conversation'),now_at,jsonb_build_object('reset',true))
    returning id into conversation_id;
  if nullif(btrim(meeting->>'opening_line'),'') is not null then
    insert into public.together_messages(user_id,character_instance_id,conversation_id,role,content,delivery_status,moderation_status)
      values(p_user_id,replacement_id,conversation_id,'assistant',btrim(meeting->>'opening_line'),'complete','approved');
  end if;
  if became_active then
    update public.together_continuities set active_companion_instance_id=replacement_id,updated_at=now_at where id=target.continuity_id;
    update public.together_profiles set active_companion_instance_id=replacement_id,updated_at=now_at where user_id=p_user_id and active_continuity_id=target.continuity_id;
  end if;

  result := jsonb_build_object(
    'previousCharacterInstanceId',target.id,
    'newCharacterInstanceId',replacement_id,
    'conversationId',conversation_id,
    'characterHandle',coalesce(nullif(template.public_handle,''),template.slug),
    'becameActive',became_active,
    'removedCounts',counts,
    'storagePaths',to_jsonb(storage_paths)
  );
  insert into public.together_character_reset_operations(user_id,continuity_id,character_template_id,previous_character_instance_id,replacement_character_instance_id,request_id,status,result,updated_at)
    values(p_user_id,target.continuity_id,template.id,target.id,replacement_id,btrim(p_request_id),'completed',result,now_at);
  insert into public.together_destructive_action_audit(user_id,character_instance_id,action_type,result_status,request_id,continuity_id,character_template_id,replacement_character_instance_id,result)
    values(p_user_id,target.id,'companion_full_reset','completed',btrim(p_request_id),target.continuity_id,template.id,replacement_id,result-'storagePaths');
  return result;
end $$;

revoke all on function public.kivelle_start_over_character(uuid,uuid,text) from public,anon;
grant execute on function public.kivelle_start_over_character(uuid,uuid,text) to authenticated,service_role;
comment on table public.together_character_reset_operations is 'Idempotent, content-free audit/result ledger for replacing one relationship CharacterInstance.';
comment on function public.kivelle_start_over_character(uuid,uuid,text) is 'Atomically removes one continuity-scoped relationship and creates a fresh instance using canonical character content.';
commit;

