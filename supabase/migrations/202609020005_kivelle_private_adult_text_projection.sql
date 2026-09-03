-- Treat verified private adult dialogue as private text on every client surface
-- while preserving the separate web-only boundary for explicit media and any
-- unclassified legacy content.
create or replace function public.kivelle_apply_message_policy() returns trigger
language plpgsql set search_path=public as $$
declare
  v_rating text:=lower(coalesce(new.provider_metadata->>'contentRating',''));
  v_scope text:=lower(coalesce(new.provider_metadata->>'visibilityScope',''));
  v_version text:=nullif(new.provider_metadata->>'moderationVersion','');
  v_private_adult_text boolean:=false;
begin
  if v_rating not in('safe','suggestive','explicit') then
    if lower(coalesce(new.provider_metadata->>'contentMode',''))='explicit'
       or lower(coalesce(new.provider_metadata->>'provider','')) in('xai','venice')
       or lower(coalesce(new.provider_metadata->>'adultAuthorized',''))='true' then
      v_rating:='explicit';
    elsif new.moderation_status='approved' then
      v_rating:=case when lower(coalesce(new.provider_metadata->>'contentMode','')) in('mature','romance') then 'suggestive' else 'safe' end;
    else v_rating:=null;
    end if;
  end if;
  v_private_adult_text:=v_rating='explicit' and v_scope='all'
    and v_version='private-adult-text-v1'
    and new.provider_metadata->>'contentPolicyVersion'='private-adult-text-v1'
    and new.provider_metadata->>'privacyScope'='private'
    and new.provider_metadata->>'adultEligibilityApplied'='true'
    and new.provider_metadata->>'allParticipantsAdults'='true'
    and new.provider_metadata->>'safetyDisposition'='allowed';
  new.content_rating:=v_rating;
  new.visibility_scope:=case
    when v_private_adult_text then 'all'
    when v_scope='all' and v_rating in('safe','suggestive') then 'all'
    when v_rating in('safe','suggestive') and v_scope='' then 'all'
    else 'web_adult'
  end;
  new.moderation_version:=coalesce(v_version,case when v_rating is null then 'unclassified' else 'server-policy-v1' end);
  if (new.visibility_scope='web_adult' or v_private_adult_text) and new.safe_bridge is null then
    new.safe_bridge:='You and your companion shared a more intimate moment and grew closer.';
  end if;
  return new;
end $$;

create or replace function public.kivelle_apply_open_thread_policy() returns trigger
language plpgsql set search_path=public as $$
declare v_message public.together_messages%rowtype;v_private_adult_text boolean:=false;
begin
  if new.source_message_id is not null then
    select * into v_message from public.together_messages where id=new.source_message_id;
    if found then
      v_private_adult_text:=v_message.visibility_scope='all' and v_message.content_rating='explicit'
        and v_message.moderation_version='private-adult-text-v1'
        and v_message.provider_metadata->>'contentPolicyVersion'='private-adult-text-v1';
      new.content_rating:=v_message.content_rating;
      new.visibility_scope:=case when v_private_adult_text or (v_message.visibility_scope='all' and v_message.content_rating in('safe','suggestive')) then 'all' else 'web_adult' end;
      new.moderation_version:=coalesce(nullif(v_message.moderation_version,''),'thread-source-v1');
    end if;
  elsif new.content_rating is null then
    new.visibility_scope:='web_adult';new.moderation_version:='unclassified';
  end if;
  return new;
end $$;

create or replace function public.kivelle_apply_memory_policy() returns trigger
language plpgsql set search_path=public as $$
declare v_message public.together_messages%rowtype;v_previous public.together_memories%rowtype;v_private_adult_text boolean:=false;
begin
  if new.source_message_id is not null then
    select * into v_message from public.together_messages where id=new.source_message_id;
    if found then
      v_private_adult_text:=v_message.visibility_scope='all' and v_message.content_rating='explicit'
        and v_message.moderation_version='private-adult-text-v1'
        and v_message.provider_metadata->>'contentPolicyVersion'='private-adult-text-v1';
      new.content_rating:=v_message.content_rating;
      new.visibility_scope:=case when v_private_adult_text or (v_message.visibility_scope='all' and v_message.content_rating in('safe','suggestive')) then 'all' else 'web_adult' end;
      new.moderation_version:=coalesce(nullif(v_message.moderation_version,''),'memory-source-v1');
    end if;
  elsif new.supersedes_memory_id is not null then
    select * into v_previous from public.together_memories where id=new.supersedes_memory_id;
    if found then new.content_rating:=v_previous.content_rating;new.visibility_scope:=v_previous.visibility_scope;new.moderation_version:=v_previous.moderation_version;end if;
  elsif new.content_rating is null then
    new.content_rating:='safe';new.visibility_scope:='all';new.moderation_version:='server-safe-memory-v1';
  end if;
  if new.content_rating is null then new.visibility_scope:='web_adult';new.moderation_version:='unclassified';end if;
  return new;
end $$;

-- Repair rows written by the private-text implementation before this trigger
-- definition is installed. Legacy web-adult and unclassified rows stay closed.
update public.together_messages
set visibility_scope='all',moderation_version='private-adult-text-v1'
where content_rating='explicit'
  and provider_metadata->>'visibilityScope'='all'
  and provider_metadata->>'moderationVersion'='private-adult-text-v1'
  and provider_metadata->>'contentPolicyVersion'='private-adult-text-v1'
  and provider_metadata->>'privacyScope'='private'
  and provider_metadata->>'adultEligibilityApplied'='true'
  and provider_metadata->>'allParticipantsAdults'='true'
  and provider_metadata->>'safetyDisposition'='allowed';

update public.together_memories memory
set content_rating=message.content_rating,visibility_scope='all',moderation_version='private-adult-text-v1'
from public.together_messages message
where memory.source_message_id=message.id and message.visibility_scope='all'
  and message.content_rating='explicit' and message.moderation_version='private-adult-text-v1';

update public.together_open_threads thread
set content_rating=message.content_rating,visibility_scope='all',moderation_version='private-adult-text-v1'
from public.together_messages message
where thread.source_message_id=message.id and message.visibility_scope='all'
  and message.content_rating='explicit' and message.moderation_version='private-adult-text-v1';

drop function if exists public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean,boolean);
drop function if exists public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean);
create function public.kivelle_match_memories_for_projection(
  p_user_id uuid,p_character_instance_id uuid,p_embedding extensions.vector(1536),
  p_limit integer,p_min_similarity double precision,p_include_restricted boolean,
  p_include_private_adult_text boolean
) returns table(
  id uuid,memory_type text,canonical_text text,importance numeric,confidence numeric,pinned boolean,metadata jsonb,
  world_id uuid,location_id uuid,participant_instance_ids uuid[],context_tags text[],last_retrieved_at timestamptz,
  last_mentioned_at timestamptz,retrieval_count integer,mention_count integer,reinforcement_count integer,
  content_rating text,visibility_scope text,similarity double precision
) language sql stable security definer set search_path=public,extensions as $$
  select m.id,m.memory_type,m.canonical_text,m.importance,m.confidence,m.pinned,m.metadata,m.world_id,m.location_id,
    m.participant_instance_ids,m.context_tags,m.last_retrieved_at,m.last_mentioned_at,m.retrieval_count,m.mention_count,
    m.reinforcement_count,m.content_rating,m.visibility_scope,1-(m.embedding<=>p_embedding) similarity
  from public.together_memories m
  where m.user_id=p_user_id and m.character_instance_id=p_character_instance_id and m.status='active' and m.embedding is not null
    and (
      p_include_restricted
      or (m.visibility_scope='all' and m.content_rating in('safe','suggestive'))
      or (p_include_private_adult_text and m.visibility_scope='all' and m.content_rating='explicit' and m.moderation_version='private-adult-text-v1')
    )
    and 1-(m.embedding<=>p_embedding)>=greatest(.35,least(.9,p_min_similarity))
  order by m.embedding<=>p_embedding limit least(greatest(p_limit,1),40)
$$;
revoke all on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean,boolean) from public,anon,authenticated;
grant execute on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean,boolean) to service_role;

-- Preserve the existing six-argument contract for an in-flight old Edge
-- deployment. It remains safe-only unless that caller already has the separate
-- web-restricted authorization represented by p_include_restricted.
create function public.kivelle_match_memories_for_projection(
  p_user_id uuid,p_character_instance_id uuid,p_embedding extensions.vector(1536),
  p_limit integer,p_min_similarity double precision,p_include_restricted boolean default false
) returns table(
  id uuid,memory_type text,canonical_text text,importance numeric,confidence numeric,pinned boolean,metadata jsonb,
  world_id uuid,location_id uuid,participant_instance_ids uuid[],context_tags text[],last_retrieved_at timestamptz,
  last_mentioned_at timestamptz,retrieval_count integer,mention_count integer,reinforcement_count integer,
  content_rating text,visibility_scope text,similarity double precision
) language sql stable security definer set search_path=public,extensions as $$
  select * from public.kivelle_match_memories_for_projection(
    p_user_id,p_character_instance_id,p_embedding,p_limit,p_min_similarity,p_include_restricted,false
  )
$$;
revoke all on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean) from public,anon,authenticated;
grant execute on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean) to service_role;
