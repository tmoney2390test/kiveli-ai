begin;

create index if not exists together_memories_search_v2_idx
  on public.together_memories
  using gin(to_tsvector('simple',canonical_text));

create index if not exists together_memories_center_newest_v2_idx
  on public.together_memories(character_instance_id,status,updated_at desc,id desc);

create index if not exists together_memories_center_recalled_v2_idx
  on public.together_memories(character_instance_id,status,retrieval_count desc,updated_at desc,id desc);

create or replace function public.kivelle_memory_center_counts_v2(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid
) returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'count',count(*),
    'categories',jsonb_build_object(
      'semantic',count(*) filter(where memory_type='semantic'),
      'emotional',count(*) filter(where memory_type='emotional'),
      'preference',count(*) filter(where memory_type='preference'),
      'episodic',count(*) filter(where memory_type='episodic'),
      'relationship',count(*) filter(where memory_type='relationship'),
      'open_thread',count(*) filter(where memory_type='open_thread')
    )
  )
  from public.together_memories
  where user_id=p_user_id
    and continuity_id=p_continuity_id
    and character_instance_id=p_character_instance_id
    and status='active';
$$;

revoke all on function public.kivelle_memory_center_counts_v2(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_memory_center_counts_v2(uuid,uuid,uuid) to service_role;

create or replace function public.kivelle_memory_center_page_v2(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid,
  p_query text default null,
  p_types text[] default null,
  p_sort text default 'pinned',
  p_cursor_pinned boolean default null,
  p_cursor_retrieval_count integer default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 31
) returns table(
  id uuid,
  character_instance_id uuid,
  memory_type text,
  canonical_text text,
  importance numeric,
  confidence numeric,
  pinned boolean,
  status text,
  source_id uuid,
  source_message_id uuid,
  source_type text,
  learned_via text,
  location_id uuid,
  supersedes_memory_id uuid,
  last_retrieved_at timestamptz,
  last_mentioned_at timestamptz,
  retrieval_count integer,
  mention_count integer,
  reinforcement_count integer,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  location_name text,
  location_slug text,
  source_conversation_id uuid
)
language sql
stable
security definer
set search_path=public
as $$
  select
    memory.id,
    memory.character_instance_id,
    memory.memory_type,
    memory.canonical_text,
    memory.importance,
    memory.confidence,
    memory.pinned,
    memory.status,
    memory.source_id,
    memory.source_message_id,
    memory.source_type,
    memory.learned_via,
    memory.location_id,
    memory.supersedes_memory_id,
    memory.last_retrieved_at,
    memory.last_mentioned_at,
    memory.retrieval_count,
    memory.mention_count,
    memory.reinforcement_count,
    memory.metadata,
    memory.created_at,
    memory.updated_at,
    place.name as location_name,
    place.slug as location_slug,
    source_message.conversation_id as source_conversation_id
  from public.together_memories memory
  left join public.together_locations place on place.id=memory.location_id
  left join public.together_messages source_message on source_message.id=memory.source_message_id
  where memory.user_id=p_user_id
    and memory.continuity_id=p_continuity_id
    and memory.character_instance_id=p_character_instance_id
    and memory.status='active'
    and (p_types is null or memory.memory_type=any(p_types))
    and (
      nullif(btrim(p_query),'') is null
      or to_tsvector('simple',memory.canonical_text) @@ websearch_to_tsquery('simple',p_query)
      or memory.canonical_text ilike '%'||p_query||'%'
      or place.name ilike '%'||p_query||'%'
    )
    and (
      p_cursor_id is null
      or (p_sort='oldest' and (memory.updated_at,memory.id)>(p_cursor_updated_at,p_cursor_id))
      or (p_sort='newest' and (memory.updated_at,memory.id)<(p_cursor_updated_at,p_cursor_id))
      or (p_sort='recalled' and (memory.retrieval_count,memory.updated_at,memory.id)<(p_cursor_retrieval_count,p_cursor_updated_at,p_cursor_id))
      or (p_sort='pinned' and ((case when memory.pinned then 1 else 0 end),memory.updated_at,memory.id)<((case when p_cursor_pinned then 1 else 0 end),p_cursor_updated_at,p_cursor_id))
    )
  order by
    case when p_sort='pinned' then (case when memory.pinned then 1 else 0 end) end desc,
    case when p_sort='recalled' then memory.retrieval_count end desc,
    case when p_sort in('pinned','newest','recalled') then memory.updated_at end desc,
    case when p_sort='oldest' then memory.updated_at end asc,
    case when p_sort in('pinned','newest','recalled') then memory.id end desc,
    case when p_sort='oldest' then memory.id end asc
  limit greatest(1,least(coalesce(p_limit,31),101));
$$;

revoke all on function public.kivelle_memory_center_page_v2(uuid,uuid,uuid,text,text[],text,boolean,integer,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.kivelle_memory_center_page_v2(uuid,uuid,uuid,text,text[],text,boolean,integer,timestamptz,uuid,integer) to service_role;

create or replace function public.kivelle_edit_memory_v2(
  p_user_id uuid,
  p_continuity_id uuid,
  p_memory_id uuid,
  p_canonical_text text
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  previous public.together_memories%rowtype;
  replacement public.together_memories%rowtype;
  now_at timestamptz:=clock_timestamp();
begin
  if nullif(btrim(p_canonical_text),'') is null or char_length(p_canonical_text)>2000 then
    raise exception 'invalid memory text';
  end if;

  select * into previous
  from public.together_memories
  where id=p_memory_id and user_id=p_user_id and continuity_id=p_continuity_id and status='active'
  for update;
  if not found then raise exception 'memory not found'; end if;

  -- Lock every currently active version of this subject before replacing it.
  -- This keeps old duplicate facts from surviving a user correction.
  perform id
  from public.together_memories
  where user_id=previous.user_id
    and continuity_id=previous.continuity_id
    and character_instance_id=previous.character_instance_id
    and subject_key=previous.subject_key
    and status='active'
  for update;

  update public.together_memories
  set status='superseded',valid_to=now_at,embedding=null,pinned=false,updated_at=now_at
  where user_id=previous.user_id
    and continuity_id=previous.continuity_id
    and character_instance_id=previous.character_instance_id
    and subject_key=previous.subject_key
    and status='active';

  insert into public.together_memories(
    user_id,continuity_id,character_instance_id,memory_type,canonical_text,dedupe_key,subject_key,
    importance,confidence,source_message_id,sensitivity_category,status,pinned,metadata,
    source_type,source_id,valid_from,supersedes_memory_id,last_retrieved_at,last_mentioned_at,
    retrieval_count,mention_count,reinforcement_count,world_id,location_id,participant_instance_ids,
    context_tags,learned_via,shareability,visibility,group_conversation_id,learned_conversation_sequence
  ) values(
    previous.user_id,previous.continuity_id,previous.character_instance_id,previous.memory_type,btrim(p_canonical_text),
    'user-edit:'||gen_random_uuid()::text,previous.subject_key,
    greatest(previous.importance,.8),1,previous.source_message_id,previous.sensitivity_category,'active',previous.pinned,
    coalesce(previous.metadata,'{}'::jsonb)||jsonb_build_object('userEditedAt',now_at,'editedFromMemoryId',previous.id),
    'manual',previous.source_id,now_at,previous.id,previous.last_retrieved_at,previous.last_mentioned_at,
    previous.retrieval_count,previous.mention_count,previous.reinforcement_count,previous.world_id,previous.location_id,
    previous.participant_instance_ids,previous.context_tags,'direct_user',previous.shareability,
    previous.visibility,previous.group_conversation_id,previous.learned_conversation_sequence
  ) returning * into replacement;

  return to_jsonb(replacement);
end $$;

revoke all on function public.kivelle_edit_memory_v2(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelle_edit_memory_v2(uuid,uuid,uuid,text) to service_role;

commit;
