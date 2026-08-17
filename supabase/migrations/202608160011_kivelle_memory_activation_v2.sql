begin;

-- Retrieval is not the same as an explicit callback. These fields let the
-- memory engine keep useful context available without making companions repeat
-- "I remember" on every turn.
alter table public.together_memories
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists valid_from timestamptz,
  add column if not exists valid_to timestamptz,
  add column if not exists supersedes_memory_id uuid references public.together_memories(id) on delete set null,
  add column if not exists last_retrieved_at timestamptz,
  add column if not exists last_mentioned_at timestamptz,
  add column if not exists retrieval_count integer not null default 0 check(retrieval_count >= 0),
  add column if not exists mention_count integer not null default 0 check(mention_count >= 0),
  add column if not exists reinforcement_count integer not null default 0 check(reinforcement_count >= 0),
  add column if not exists world_id uuid references public.together_worlds(id) on delete set null,
  add column if not exists location_id uuid references public.together_locations(id) on delete set null,
  add column if not exists participant_instance_ids uuid[] not null default '{}'::uuid[],
  add column if not exists context_tags text[] not null default '{}'::text[],
  add column if not exists learned_via text,
  add column if not exists shareability text not null default 'private';

alter table public.together_memories drop constraint if exists together_memories_source_type_check;
alter table public.together_memories add constraint together_memories_source_type_check
  check(source_type is null or source_type in('message','scene','plan','date','moment','life_event','manual'));
alter table public.together_memories drop constraint if exists together_memories_learned_via_check;
alter table public.together_memories add constraint together_memories_learned_via_check
  check(learned_via is null or learned_via in('direct_user','observed_scene','shared_by_character','system_event','inferred_pattern'));
alter table public.together_memories drop constraint if exists together_memories_shareability_check;
alter table public.together_memories add constraint together_memories_shareability_check
  check(shareability in('private','normal','social'));

update public.together_memories
set valid_from = coalesce(valid_from, created_at),
    source_type = coalesce(source_type, case when source_message_id is not null then 'message' else 'manual' end),
    learned_via = coalesce(learned_via, case when source_message_id is not null then 'direct_user' else 'system_event' end)
where valid_from is null or source_type is null or learned_via is null;

create index if not exists together_memories_character_status_importance_v2_idx
  on public.together_memories(character_instance_id,status,importance desc);
create index if not exists together_memories_character_last_mentioned_v2_idx
  on public.together_memories(character_instance_id,last_mentioned_at desc nulls last);
create index if not exists together_memories_world_v2_idx on public.together_memories(world_id) where world_id is not null;
create index if not exists together_memories_location_v2_idx on public.together_memories(location_id) where location_id is not null;
create index if not exists together_memories_context_tags_v2_idx on public.together_memories using gin(context_tags);
create index if not exists together_memories_participants_v2_idx on public.together_memories using gin(participant_instance_ids);

-- The old four-argument RPC remains for older deployed clients. New callers
-- choose a context-appropriate threshold without changing any canonical data.
create or replace function public.together_match_memories_server(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_embedding extensions.vector(1536),
  p_limit integer,
  p_min_similarity double precision
)
returns table(
  id uuid,
  memory_type text,
  canonical_text text,
  importance numeric,
  confidence numeric,
  pinned boolean,
  metadata jsonb,
  world_id uuid,
  location_id uuid,
  participant_instance_ids uuid[],
  context_tags text[],
  last_retrieved_at timestamptz,
  last_mentioned_at timestamptz,
  retrieval_count integer,
  mention_count integer,
  reinforcement_count integer,
  similarity double precision
)
language sql
stable
security definer
set search_path=public,extensions
as $$
  select m.id,m.memory_type,m.canonical_text,m.importance,m.confidence,m.pinned,m.metadata,m.world_id,m.location_id,m.participant_instance_ids,m.context_tags,m.last_retrieved_at,m.last_mentioned_at,m.retrieval_count,m.mention_count,m.reinforcement_count,
    1 - (m.embedding <=> p_embedding) as similarity
  from public.together_memories m
  where m.user_id=p_user_id and m.character_instance_id=p_character_instance_id
    and m.status='active' and m.embedding is not null
    and 1 - (m.embedding <=> p_embedding) >= greatest(.35,least(.9,p_min_similarity))
  order by m.embedding <=> p_embedding
  limit least(greatest(p_limit,1),40)
$$;
revoke all on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer,double precision) from public,anon,authenticated;
grant execute on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer,double precision) to service_role;

create or replace function public.kivelle_touch_memories(
  p_user_id uuid,
  p_memory_ids uuid[],
  p_kind text,
  p_now timestamptz default now()
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if p_kind='retrieved' then
    update public.together_memories
      set last_retrieved_at=p_now,last_recalled_at=p_now,retrieval_count=retrieval_count+1
      where user_id=p_user_id and id=any(p_memory_ids);
  elsif p_kind='mentioned' then
    update public.together_memories
      set last_mentioned_at=p_now,last_recalled_at=p_now,mention_count=mention_count+1
      where user_id=p_user_id and id=any(p_memory_ids);
  elsif p_kind='reinforced' then
    update public.together_memories
      set reinforcement_count=reinforcement_count+1,updated_at=p_now
      where user_id=p_user_id and id=any(p_memory_ids);
  else
    raise exception 'unknown memory touch kind';
  end if;
end;
$$;
revoke all on function public.kivelle_touch_memories(uuid,uuid[],text,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_touch_memories(uuid,uuid[],text,timestamptz) to service_role;

comment on column public.together_memories.last_retrieved_at is 'When Kivelle supplied a memory to a model, independent of whether it was verbalized.';
comment on column public.together_memories.last_mentioned_at is 'When the companion explicitly referenced a memory in dialogue.';

commit;
