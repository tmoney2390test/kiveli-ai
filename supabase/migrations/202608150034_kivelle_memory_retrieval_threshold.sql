begin;

-- Semantic recall should return nothing when the user's message is not meaningfully
-- related to a stored memory. Ranking alone made the nearest memories look relevant
-- even when every candidate was a weak match.
create or replace function public.together_match_memories_server(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_embedding extensions.vector(1536),
  p_limit integer default 8
)
returns table(
  id uuid,
  memory_type text,
  canonical_text text,
  importance numeric,
  confidence numeric,
  similarity double precision
)
language sql
stable
security definer
set search_path=public,extensions
as $$
  select
    m.id,
    m.memory_type,
    m.canonical_text,
    m.importance,
    m.confidence,
    1 - (m.embedding <=> p_embedding) as similarity
  from public.together_memories m
  where m.user_id = p_user_id
    and m.character_instance_id = p_character_instance_id
    and m.status = 'active'
    and m.embedding is not null
    and 1 - (m.embedding <=> p_embedding) >= 0.55
  order by m.embedding <=> p_embedding
  limit least(greatest(p_limit, 1), 20)
$$;

revoke all on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer) to service_role;

comment on function public.together_match_memories_server(uuid,uuid,extensions.vector,integer)
is 'Returns only semantically relevant companion memories; weak nearest-neighbor matches are intentionally omitted.';

commit;
