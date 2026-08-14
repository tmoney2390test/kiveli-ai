-- Together continuity v2: stable memory subjects, idempotent threads, and rolling summaries.

alter table public.together_memories add column if not exists subject_key text;

update public.together_memories
set subject_key = case
  when memory_type = 'semantic' and metadata ? 'subject' and metadata ? 'name'
    then 'pet:' || lower(regexp_replace(metadata->>'subject','[^a-z0-9]+','','g')) || ':name'
  when memory_type = 'preference' and metadata ? 'item'
    then 'preference:' || trim(both ':' from lower(regexp_replace(metadata->>'item','[^a-z0-9]+',':','g')))
  else dedupe_key
end
where subject_key is null or subject_key = '';

alter table public.together_memories alter column subject_key set not null;
create index if not exists together_memories_subject_active_idx
  on public.together_memories(character_instance_id,subject_key,updated_at desc)
  where status = 'active';

alter table public.together_open_threads add column if not exists dedupe_key text;
update public.together_open_threads
set dedupe_key = 'legacy:' || encode(extensions.digest(lower(topic) || ':' || coalesce(expected_at::date::text,'unscheduled'),'sha256'),'hex')
where dedupe_key is null or dedupe_key = '';
alter table public.together_open_threads alter column dedupe_key set not null;
create index if not exists together_threads_dedupe_active_idx
  on public.together_open_threads(character_instance_id,dedupe_key)
  where resolved_at is null;

alter table public.together_conversations add column if not exists summary text;
alter table public.together_conversations add column if not exists summary_through timestamptz;
alter table public.together_conversations add column if not exists summary_message_count integer not null default 0 check(summary_message_count >= 0);

comment on column public.together_memories.subject_key is 'Stable application-owned identity used to reinforce or correct one remembered fact.';
comment on column public.together_open_threads.dedupe_key is 'Stable key preventing duplicate follow-up obligations for the same event.';
comment on column public.together_conversations.summary is 'Compact rolling continuity summary; never authoritative over structured state.';
