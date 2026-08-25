begin;

-- Direct and group timelines share one monotonic cursor.  Older direct rows
-- predate conversation_sequence, so backfill them deterministically before the
-- generalized insert trigger is enabled.
with affected as (
  select distinct conversation_id from public.together_messages where conversation_sequence is null
), ranked as (
  select message.id,row_number() over(partition by message.conversation_id order by message.created_at,message.id)::bigint as sequence
  from public.together_messages message join affected using(conversation_id)
)
update public.together_messages message
set conversation_sequence=ranked.sequence
from ranked where ranked.id=message.id;

update public.together_conversations conversation
set message_sequence=greatest(
  coalesce(conversation.message_sequence,0),
  coalesce((select max(message.conversation_sequence) from public.together_messages message where message.conversation_id=conversation.id),0)
);

create or replace function public.kivelle_assign_group_message_sequence() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_sequence bigint;
begin
  if new.conversation_sequence is not null then return new; end if;
  update public.together_conversations set message_sequence=message_sequence+1
  where id=new.conversation_id and user_id=new.user_id and archived_at is null
  returning message_sequence into v_sequence;
  if v_sequence is null then raise exception 'CONVERSATION_UNAVAILABLE'; end if;
  new.conversation_sequence:=v_sequence;
  return new;
end;
$$;

create index if not exists together_messages_sequence_page_idx
  on public.together_messages(conversation_id,conversation_sequence desc,id desc);
create unique index if not exists together_messages_conversation_sequence_uidx
  on public.together_messages(conversation_id,conversation_sequence)
  where conversation_sequence is not null;

alter table public.together_conversations
  add column if not exists summary_through_sequence bigint;

update public.together_conversations conversation
set summary_through_sequence=(
  select max(message.conversation_sequence)
  from public.together_messages message
  where message.conversation_id=conversation.id
    and conversation.summary_through is not null
    and message.created_at<=conversation.summary_through
)
where conversation.summary_through is not null
  and conversation.summary_through_sequence is null;

create table if not exists public.together_conversation_episodes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  conversation_kind text not null check(conversation_kind in('direct','first_meeting','group')),
  hierarchy_level smallint not null default 0 check(hierarchy_level in(0,1)),
  start_sequence bigint not null check(start_sequence>0),
  end_sequence bigint not null check(end_sequence>=start_sequence),
  start_message_id uuid not null references public.together_messages(id) on delete cascade,
  end_message_id uuid not null references public.together_messages(id) on delete cascade,
  message_count integer not null check(message_count between 1 and 5000),
  title text not null,
  summary text not null,
  attributed_summary text not null,
  topic_terms text[] not null default '{}',
  participant_character_instance_ids uuid[] not null default '{}',
  source_episode_ids uuid[] not null default '{}',
  embedding extensions.vector(1536),
  status text not null default 'active' check(status in('active','superseded')),
  metadata jsonb not null default '{}',
  search_vector tsvector generated always as (
    to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(attributed_summary,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conversation_id,start_sequence,hierarchy_level)
);

create index if not exists together_conversation_episodes_range_idx
  on public.together_conversation_episodes(conversation_id,hierarchy_level,end_sequence desc)
  where status='active';
create index if not exists together_conversation_episodes_user_idx
  on public.together_conversation_episodes(user_id,continuity_id,conversation_id);
create index if not exists together_conversation_episodes_search_idx
  on public.together_conversation_episodes using gin(search_vector);
-- Vector ranking is intentionally exact *inside one conversation*. A global
-- HNSW index would post-filter by conversation and can miss relevant rows;
-- chapters keep the exact candidate set bounded without that write/storage cost.

alter table public.together_conversation_episodes enable row level security;
revoke all on public.together_conversation_episodes from anon,authenticated;
grant all on public.together_conversation_episodes to service_role;

create or replace function public.kivelle_match_conversation_episodes_server(
  p_user_id uuid,
  p_continuity_id uuid,
  p_conversation_id uuid,
  p_query text,
  p_embedding extensions.vector(1536) default null,
  p_min_sequence bigint default 1,
  p_limit integer default 6
) returns table(
  id uuid,title text,summary text,attributed_summary text,topic_terms text[],
  start_sequence bigint,end_sequence bigint,start_message_id uuid,end_message_id uuid,
  participant_character_instance_ids uuid[],created_at timestamptz,relevance double precision
) language sql stable security definer set search_path=public,extensions as $$
  with request as (
    select websearch_to_tsquery('simple',coalesce(p_query,'')) as terms
  ), chapter_scores as (
    select chapter.start_sequence,chapter.end_sequence,
      ts_rank_cd(chapter.search_vector,request.terms)::double precision as lexical_score,
      case when p_embedding is null or chapter.embedding is null then 0::double precision
        else (1-(chapter.embedding <=> p_embedding))::double precision end as semantic_score
    from public.together_conversation_episodes chapter cross join request
    where chapter.user_id=p_user_id and chapter.continuity_id=p_continuity_id
      and chapter.conversation_id=p_conversation_id and chapter.status='active'
      and chapter.hierarchy_level=1 and chapter.start_sequence>=greatest(1,p_min_sequence)
  ), selected_chapters as (
    select start_sequence,end_sequence from chapter_scores
    where lexical_score>0 or p_embedding is not null
    order by greatest(lexical_score,semantic_score*.82) desc,end_sequence desc limit 3
  ), chapter_boundary as (
    select max(end_sequence) as end_sequence from chapter_scores
  ), scored as (
    select episode.*,
      ts_rank_cd(episode.search_vector,request.terms)::double precision as lexical_score,
      case when p_embedding is null or episode.embedding is null then 0::double precision
        else (1-(episode.embedding <=> p_embedding))::double precision end as semantic_score
    from public.together_conversation_episodes episode cross join request
    where episode.user_id=p_user_id
      and episode.continuity_id=p_continuity_id
      and episode.conversation_id=p_conversation_id
      and episode.status='active'
      and episode.hierarchy_level=0
      and episode.start_sequence>=greatest(1,p_min_sequence)
      and (episode.search_vector@@request.terms or (p_embedding is not null and episode.embedding is not null))
      and (
        episode.search_vector@@request.terms
        or not exists(select 1 from chapter_scores)
        or episode.start_sequence>coalesce((select end_sequence from chapter_boundary),0)
        or exists(
          select 1 from selected_chapters chapter
          where episode.start_sequence<=chapter.end_sequence and episode.end_sequence>=chapter.start_sequence
        )
      )
  )
  select scored.id,scored.title,scored.summary,scored.attributed_summary,scored.topic_terms,
    scored.start_sequence,scored.end_sequence,scored.start_message_id,scored.end_message_id,
    scored.participant_character_instance_ids,scored.created_at,
    (greatest(scored.lexical_score,scored.semantic_score*.82)+least(.08,1.0/greatest(1,extract(epoch from(now()-scored.created_at))/86400)))::double precision as relevance
  from scored
  where scored.lexical_score>0 or scored.semantic_score>=.46
  order by relevance desc,scored.end_sequence desc
  limit least(greatest(coalesce(p_limit,6),1),12)
$$;

revoke all on function public.kivelle_match_conversation_episodes_server(uuid,uuid,uuid,text,extensions.vector,bigint,integer) from public,anon,authenticated;
grant execute on function public.kivelle_match_conversation_episodes_server(uuid,uuid,uuid,text,extensions.vector,bigint,integer) to service_role;

comment on table public.together_conversation_episodes is
  'Immutable, speaker-attributed message-range summaries used for bounded long-conversation retrieval; canonical messages remain authoritative.';

commit;
