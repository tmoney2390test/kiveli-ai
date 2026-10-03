begin;

-- A branch is an isolated Life, not a second transcript attached to the same
-- character instance.  Keep the parent Life and conversation untouched.
alter table public.together_continuities drop constraint if exists together_continuities_kind_check;
alter table public.together_continuities add constraint together_continuities_kind_check
  check(kind in ('main','alternate','branch'));

create table public.together_chat_branches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  source_continuity_id uuid references public.together_continuities(id) on delete set null,
  branch_continuity_id uuid not null unique references public.together_continuities(id) on delete cascade,
  source_conversation_id uuid references public.together_conversations(id) on delete set null,
  branch_conversation_id uuid not null unique references public.together_conversations(id) on delete cascade,
  source_character_instance_id uuid references public.together_character_instances(id) on delete set null,
  branch_character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  anchor_message_id uuid references public.together_messages(id) on delete set null,
  anchor_sequence bigint not null check(anchor_sequence > 0),
  prefix_count integer not null check(prefix_count between 1 and 150),
  created_at timestamptz not null default now(),
  unique(user_id,request_id),
  check(source_continuity_id is null or source_continuity_id <> branch_continuity_id),
  check(source_conversation_id is null or source_conversation_id <> branch_conversation_id)
);

-- Prefix rows are immutable snapshots.  Inserting copies into together_messages
-- would replay message triggers, relationship progression, and billing receipts.
create table public.together_chat_branch_prefix (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.together_chat_branches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_sequence integer not null check(conversation_sequence between 1 and 150),
  source_sequence bigint not null,
  role text not null check(role in ('user','assistant','system')),
  content text not null,
  safe_bridge text,
  content_rating text not null,
  visibility_scope text not null,
  moderation_status text not null,
  moderation_version text,
  provider_metadata jsonb not null default '{}'::jsonb,
  routing_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  unique(conversation_id,conversation_sequence),
  unique(branch_id,source_sequence)
);
create index together_chat_branch_prefix_page_idx
  on public.together_chat_branch_prefix(conversation_id,conversation_sequence desc);
create index together_chat_branch_prefix_continuity_idx
  on public.together_chat_branch_prefix(continuity_id);
create index together_chat_branch_prefix_character_idx
  on public.together_chat_branch_prefix(character_instance_id);
create index together_chat_branches_source_idx
  on public.together_chat_branches(user_id,source_conversation_id,created_at desc);
create index together_chat_branches_source_conversation_fk_idx
  on public.together_chat_branches(source_conversation_id);
create index together_chat_branches_source_continuity_fk_idx
  on public.together_chat_branches(source_continuity_id);
create index together_chat_branches_source_character_fk_idx
  on public.together_chat_branches(source_character_instance_id);
create index together_chat_branches_branch_character_fk_idx
  on public.together_chat_branches(branch_character_instance_id);
create index together_chat_branches_anchor_fk_idx
  on public.together_chat_branches(anchor_message_id);

alter table public.together_chat_branches enable row level security;
alter table public.together_chat_branch_prefix enable row level security;
revoke all on public.together_chat_branches,public.together_chat_branch_prefix from anon,authenticated;
grant all on public.together_chat_branches,public.together_chat_branch_prefix to service_role;

create or replace function public.kivelle_branch_remap_json(p_value jsonb,p_mapping jsonb)
returns jsonb language plpgsql immutable as $$
declare v_type text; v_result jsonb; v_key text; v_item jsonb;
begin
  if p_value is null then return null; end if;
  v_type:=jsonb_typeof(p_value);
  if v_type='string' then
    return coalesce(p_mapping->(p_value #>> '{}'),p_value);
  elsif v_type='array' then
    v_result:='[]'::jsonb;
    for v_item in select value from jsonb_array_elements(p_value) loop
      v_result:=v_result||jsonb_build_array(public.kivelle_branch_remap_json(v_item,p_mapping));
    end loop;
    return v_result;
  elsif v_type='object' then
    v_result:='{}'::jsonb;
    for v_key,v_item in select key,value from jsonb_each(p_value) loop
      v_result:=v_result||jsonb_build_object(v_key,public.kivelle_branch_remap_json(v_item,p_mapping));
    end loop;
    return v_result;
  end if;
  return p_value;
end; $$;
revoke all on function public.kivelle_branch_remap_json(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_branch_remap_json(jsonb,jsonb) to service_role;

-- Subscriber status is checked again inside the transaction, so a stale client
-- or a simultaneous subscription change cannot create a free branch.
create function public.kivelle_start_chat_branch(
  p_user_id uuid,p_source_conversation_id uuid,p_anchor_message_id uuid,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_source public.together_conversations;
  v_anchor public.together_messages;
  v_existing public.together_chat_branches;
  v_source_life public.together_continuities;
  v_branch_life uuid:=gen_random_uuid();
  v_branch_chat uuid:=gen_random_uuid();
  v_branch_instance uuid;
  v_branch_id uuid:=gen_random_uuid();
  v_prefix_count integer;
  v_summary_prefix_count integer;
  v_tier text;
  v_mapping jsonb;
  v_active_count integer;
  v_limit integer;
  v_branch_count integer;
  v_memory_count integer;
  v_source_memory_count integer;
  v_character_name text;
begin
  if p_request_id is null or p_anchor_message_id is null then raise exception 'BRANCH_REQUEST_REQUIRED'; end if;
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'BRANCH_NOT_AUTHORIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('kivelle-chat-branch:'||p_user_id::text,0));

  select * into v_existing from public.together_chat_branches where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_existing.source_conversation_id is distinct from p_source_conversation_id
      or v_existing.anchor_message_id is distinct from p_anchor_message_id then
      raise exception 'BRANCH_REQUEST_CONFLICT';
    end if;
    update public.together_profiles set active_continuity_id=v_existing.branch_continuity_id,
      active_companion_instance_id=v_existing.branch_character_instance_id,updated_at=now()
      where user_id=p_user_id;
    return jsonb_build_object('branchId',v_existing.id,'continuityId',v_existing.branch_continuity_id,
      'conversationId',v_existing.branch_conversation_id,'characterInstanceId',v_existing.branch_character_instance_id,'replayed',true);
  end if;

  select tier into v_tier from public.together_entitlements
    where user_id=p_user_id and (expires_at is null or expires_at>now());
  if v_tier not in ('kivelle_plus','kivelle_max') or v_tier is null then
    raise exception 'BRANCH_SUBSCRIPTION_REQUIRED';
  end if;
  select count(*)::integer into v_branch_count from public.together_chat_branches where user_id=p_user_id;
  if (v_tier='kivelle_max' and v_branch_count>=50)
    or (v_tier='kivelle_plus' and v_branch_count>=20) then
    raise exception 'BRANCH_LIMIT_REACHED';
  end if;
  select * into v_source from public.together_conversations
    where id=p_source_conversation_id and user_id=p_user_id and kind in ('direct','first_meeting')
      and archived_at is null and user_archived_at is null for update;
  if not found then raise exception 'BRANCH_SOURCE_UNAVAILABLE'; end if;
  if not exists(select 1 from public.together_profiles where user_id=p_user_id and active_continuity_id=v_source.continuity_id) then
    raise exception 'BRANCH_SOURCE_LIFE_INACTIVE';
  end if;
  if exists(select 1 from public.together_dialogue_turns where conversation_id=v_source.id
    and user_id=p_user_id and state in ('planning','generating')) then raise exception 'BRANCH_REPLY_IN_PROGRESS'; end if;
  if exists(select 1 from public.together_scene_sessions where user_id=p_user_id
    and character_instance_id=v_source.character_instance_id and ended_at is null) then
    raise exception 'BRANCH_ACTIVE_SCENE';
  end if;
  if exists(select 1 from public.together_character_instances where id=v_source.character_instance_id
    and life_state<>'alive') then raise exception 'BRANCH_CHARACTER_UNAVAILABLE'; end if;
  if exists(select 1 from public.together_shared_plans where user_id=p_user_id
    and continuity_id=v_source.continuity_id and status in ('proposed','scheduled','active')
    and v_source.character_instance_id=any(participant_instance_ids))
    or exists(select 1 from public.together_date_sessions where user_id=p_user_id
      and character_instance_id=v_source.character_instance_id and status in ('upcoming','active'))
    or exists(select 1 from public.together_trips where user_id=p_user_id
      and character_instance_id=v_source.character_instance_id
      and status in ('upcoming','traveling','visiting','returning')) then
    raise exception 'BRANCH_ACTIVE_COMMITMENT';
  end if;
  select * into v_anchor from public.together_messages
    where id=p_anchor_message_id and conversation_id=v_source.id and user_id=p_user_id
      and role='assistant' and delivery_status='complete' and moderation_status='approved'
      and btrim(content)<>'' and content<>'[Photo]'
      and coalesce(provider_metadata->>'uiHidden','false')<>'true';
  if not found then raise exception 'BRANCH_ANCHOR_UNAVAILABLE'; end if;
  if exists(select 1 from public.together_messages where conversation_id=v_source.id
    and conversation_sequence>v_anchor.conversation_sequence
    and coalesce(provider_metadata->>'uiHidden','false')<>'true') then
    raise exception 'BRANCH_ANCHOR_NOT_LATEST';
  end if;
  select * into v_source_life from public.together_continuities where id=v_source.continuity_id and user_id=p_user_id;
  if not found then raise exception 'BRANCH_SOURCE_LIFE_UNAVAILABLE'; end if;
  if v_source_life.kind='branch' then raise exception 'BRANCH_NESTED_UNAVAILABLE'; end if;
  select count(*)::integer into v_memory_count from public.together_memories
    where user_id=p_user_id and status='active';
  select count(*)::integer into v_source_memory_count from public.together_memories
    where user_id=p_user_id and continuity_id=v_source_life.id and status='active';
  if v_memory_count+v_source_memory_count>10000 then raise exception 'BRANCH_MEMORY_LIMIT_REACHED'; end if;
  select template.name into v_character_name from public.together_character_instances instance
    join public.together_character_templates template on template.id=instance.character_template_id
    where instance.id=v_source.character_instance_id;
  select count(*)::integer into v_active_count from public.together_conversations
    where user_id=p_user_id and archived_at is null and user_archived_at is null
      and kind in ('direct','first_meeting','group');
  v_limit:=public.kivelle_active_conversation_limit(p_user_id);
  if v_active_count>=v_limit then raise exception 'ACTIVE_CONVERSATION_LIMIT_REACHED:%',v_limit; end if;

  insert into public.together_continuities(id,user_id,persona_id,kind,title,metadata)
    values(v_branch_life,p_user_id,v_source_life.persona_id,'branch',
      left(coalesce(v_character_name,'Companion')||' · Alternate path',80),
      jsonb_build_object('createdFrom','chat_branch','sourceContinuityId',v_source_life.id,
        'sourceConversationId',v_source.id,'branchConversationId',v_branch_chat,'contextVersion',1));
  create temporary table if not exists pg_temp.kivelle_branch_instance_map(old_id uuid primary key,new_id uuid not null) on commit drop;
  truncate pg_temp.kivelle_branch_instance_map;
  insert into pg_temp.kivelle_branch_instance_map(old_id,new_id)
    select id,gen_random_uuid() from public.together_character_instances
    where user_id=p_user_id and continuity_id=v_source_life.id;
  select new_id into v_branch_instance from pg_temp.kivelle_branch_instance_map where old_id=v_source.character_instance_id;
  if v_branch_instance is null then raise exception 'BRANCH_CHARACTER_UNAVAILABLE'; end if;
  select jsonb_object_agg(old_id::text,to_jsonb(new_id::text)) into v_mapping from pg_temp.kivelle_branch_instance_map;

  insert into public.together_character_instances
    select (jsonb_populate_record(null::public.together_character_instances,
      to_jsonb(src)||jsonb_build_object('id',map.new_id,'continuity_id',v_branch_life,
      'life_state_source_message_id',null,'current_schedule_event_id',null,
      'scenario_state',null,'current_presence_source','fallback',
      'schedule_pause',null,'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_character_instances src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.id;

  insert into public.together_relationship_states
    select (jsonb_populate_record(null::public.together_relationship_states,
      to_jsonb(src)||jsonb_build_object('character_instance_id',map.new_id,'continuity_id',v_branch_life))).*
    from public.together_relationship_states src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id;

  insert into public.together_continuity_world_state
    select (jsonb_populate_record(null::public.together_continuity_world_state,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping),
      'progression_state',public.kivelle_branch_remap_json(src.progression_state,v_mapping)))).*
    from public.together_continuity_world_state src where src.continuity_id=v_source_life.id;
  insert into public.together_world_familiarity
    select (jsonb_populate_record(null::public.together_world_familiarity,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_world_familiarity src where src.continuity_id=v_source_life.id;

  -- Copy durable relationship state.  Source-message and scene references are
  -- cleared because those rows belong to the original Life.
  insert into public.together_memories
    select (jsonb_populate_record(null::public.together_memories,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'character_instance_id',map.new_id,'source_message_id',null,'source_id',null,
      'supersedes_memory_id',null,'episode_id',null,'group_conversation_id',null,
      'participant_instance_ids',public.kivelle_branch_remap_json(to_jsonb(src.participant_instance_ids),v_mapping),
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_memories src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id
    where src.status='active';
  insert into public.together_open_threads
    select (jsonb_populate_record(null::public.together_open_threads,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'character_instance_id',map.new_id,'source_message_id',null,'resolution_message_id',null,
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_open_threads src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id;

  -- Story progress and place opinions have no publication or billing triggers.
  -- Plans, Dates, Moments, media, and life events do: they are deliberately not
  -- replayed by this text-branch operation.
  insert into public.together_story_arc_instances
    select (jsonb_populate_record(null::public.together_story_arc_instances,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'character_instance_id',map.new_id,
      'state',public.kivelle_branch_remap_json(src.state,v_mapping)))).*
    from public.together_story_arc_instances src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id;
  insert into public.together_relationship_milestones
    select (jsonb_populate_record(null::public.together_relationship_milestones,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'character_instance_id',map.new_id,'source_message_id',null,
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_relationship_milestones src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id;
  insert into public.together_relationship_places
    select (jsonb_populate_record(null::public.together_relationship_places,
      to_jsonb(src)||jsonb_build_object('id',gen_random_uuid(),'continuity_id',v_branch_life,
      'character_instance_id',map.new_id,'moment_ids','[]'::jsonb,
      'metadata',public.kivelle_branch_remap_json(src.metadata,v_mapping)))).*
    from public.together_relationship_places src
    join pg_temp.kivelle_branch_instance_map map on map.old_id=src.character_instance_id;
  -- The transcript prefix is text-only in this release.  Media remain in the
  -- original chat; safe_bridge and content policy are retained independently.
  select count(*)::integer,
    count(*) filter(where conversation_sequence<=v_source.summary_through_sequence)::integer
    into v_prefix_count,v_summary_prefix_count from (
    select id,conversation_sequence from public.together_messages where conversation_id=v_source.id
      and conversation_sequence<=v_anchor.conversation_sequence and delivery_status='complete'
      and moderation_status='approved'
      and coalesce(provider_metadata->>'uiHidden','false')<>'true'
      order by conversation_sequence desc limit 150
  ) recent;
  insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title,
    message_sequence,last_message_at,last_message_preview,last_message_role,last_assistant_message_at,last_read_at,
    summary,summary_through,summary_through_sequence,
    canonical_context,safe_context,metadata)
    values(v_branch_chat,p_user_id,v_branch_life,v_branch_instance,'direct',
      left(coalesce(v_character_name,'Companion')||' · Alternate path',80),v_prefix_count,
      v_anchor.created_at,
      case when v_anchor.visibility_scope='all' and v_anchor.content_rating in ('safe','suggestive')
        then left(nullif(btrim(regexp_replace(v_anchor.content,'[[:space:]]+',' ','g')),''),160)
        else 'Private exchange' end,
      'assistant',v_anchor.created_at,now(),v_source.summary,v_source.summary_through,
      case when v_source.summary_through_sequence is null then null else v_summary_prefix_count end,
      v_source.canonical_context,v_source.safe_context,
      jsonb_build_object('chatPreferences',coalesce(v_source.metadata->'chatPreferences','{}'::jsonb),
        'branchId',v_branch_id,'branchPrefixCount',v_prefix_count,
        'branchSourceConversationId',v_source.id,
        'branchSourceContinuityId',v_source_life.id,'branchAnchorMessageId',v_anchor.id));
  insert into public.together_chat_branches(id,user_id,request_id,source_continuity_id,
    branch_continuity_id,source_conversation_id,branch_conversation_id,
    source_character_instance_id,branch_character_instance_id,anchor_message_id,
    anchor_sequence,prefix_count)
    values(v_branch_id,p_user_id,p_request_id,v_source_life.id,v_branch_life,v_source.id,
      v_branch_chat,v_source.character_instance_id,v_branch_instance,v_anchor.id,
      v_anchor.conversation_sequence,v_prefix_count);
  insert into public.together_chat_branch_prefix(branch_id,user_id,continuity_id,conversation_id,
    character_instance_id,conversation_sequence,source_sequence,role,content,safe_bridge,
    content_rating,visibility_scope,moderation_status,moderation_version,
    provider_metadata,routing_metadata,created_at)
    select v_branch_id,p_user_id,v_branch_life,v_branch_chat,v_branch_instance,
      row_number() over(order by src.conversation_sequence)::integer,src.conversation_sequence,
      src.role,case when src.content='[Photo]' then '[Photo shared in original chat]' else src.content end,
      src.safe_bridge,src.content_rating,src.visibility_scope,
      src.moderation_status,src.moderation_version,
      jsonb_build_object('branchPrefix',true,'speakerName',src.provider_metadata->>'speakerName',
        'speakerSlug',src.provider_metadata->>'speakerSlug',
        'contentPolicyVersion',src.provider_metadata->>'contentPolicyVersion',
        'privacyScope',src.provider_metadata->>'privacyScope',
        'adultEligibilityApplied',src.provider_metadata->'adultEligibilityApplied',
        'allParticipantsAdults',src.provider_metadata->'allParticipantsAdults',
        'safetyDisposition',src.provider_metadata->>'safetyDisposition'),
      jsonb_build_object('adultRouting',src.provider_metadata->'adultRouting'),src.created_at
    from (select * from public.together_messages where conversation_id=v_source.id
      and conversation_sequence<=v_anchor.conversation_sequence and delivery_status='complete'
      and moderation_status='approved'
      and coalesce(provider_metadata->>'uiHidden','false')<>'true'
      order by conversation_sequence desc limit 150) src;
  update public.together_continuities set active_companion_instance_id=v_branch_instance
    where id=v_branch_life;
  update public.together_profiles set active_continuity_id=v_branch_life,
    active_companion_instance_id=v_branch_instance,updated_at=now()
    where user_id=p_user_id;
  return jsonb_build_object('branchId',v_branch_id,'continuityId',v_branch_life,
    'conversationId',v_branch_chat,'characterInstanceId',v_branch_instance,'replayed',false);
end; $$;
revoke all on function public.kivelle_start_chat_branch(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_start_chat_branch(uuid,uuid,uuid,uuid) to service_role;

commit;
