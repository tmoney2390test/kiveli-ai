begin;

-- Adult eligibility is intentionally independent from onboarding age confirmation
-- and from paid subscription state. The verification method is replaceable.
alter table public.together_profiles
  add column if not exists adult_eligible_at timestamptz,
  add column if not exists adult_eligibility_method text,
  add column if not exists adult_eligibility_reference text;

comment on column public.together_profiles.adult_eligible_at is
  'Web-only adult eligibility decision. Independent from subscription and age_verified_at.';
comment on column public.together_profiles.adult_eligibility_method is
  'Replaceable adult eligibility provider/method identifier; never a subscription field.';

create table if not exists public.together_web_adult_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check(char_length(token_hash)=64),
  adult_mode_enabled boolean not null default false,
  enabled_at timestamptz,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists together_web_adult_sessions_user_idx
  on public.together_web_adult_sessions(user_id,expires_at desc);
alter table public.together_web_adult_sessions enable row level security;
revoke all on public.together_web_adult_sessions from public,anon,authenticated;
grant all on public.together_web_adult_sessions to service_role;

create table if not exists public.together_adult_asset_grants(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  web_session_id uuid not null references public.together_web_adult_sessions(id) on delete cascade,
  generated_media_id uuid references public.together_generated_media(id) on delete cascade,
  attachment_id uuid references public.together_conversation_attachments(id) on delete cascade,
  token_hash text not null unique check(char_length(token_hash)=64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check((generated_media_id is not null)::integer+(attachment_id is not null)::integer=1)
);
create index if not exists together_adult_asset_grants_expiry_idx on public.together_adult_asset_grants(expires_at);
alter table public.together_adult_asset_grants enable row level security;
revoke all on public.together_adult_asset_grants from public,anon,authenticated;
grant all on public.together_adult_asset_grants to service_role;

alter table public.together_account_exports
  add column if not exists projection_scope text not null default 'safe'
  check (projection_scope in ('safe','canonical'));
insert into public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count)
select user_id,storage_bucket,storage_path,'pending',0 from public.together_account_exports
where storage_path is not null and status in ('queued','processing','ready')
on conflict(user_id,bucket_id,storage_path) where status='pending' do nothing;
update public.together_account_exports set status='expired',storage_path=null,updated_at=now()
where status in ('queued','processing','ready');
drop policy if exists "Users read their account exports" on public.together_account_exports;
revoke all on public.together_account_exports from anon,authenticated;
grant all on public.together_account_exports to service_role;

alter table public.together_conversations
  add column if not exists canonical_context jsonb not null default '{}'::jsonb,
  add column if not exists safe_context jsonb not null default '{}'::jsonb;

alter table public.together_messages
  add column if not exists content_rating text,
  add column if not exists visibility_scope text not null default 'web_adult',
  add column if not exists safe_bridge text,
  add column if not exists moderation_version text not null default 'unclassified';
alter table public.together_messages drop constraint if exists together_messages_content_rating_check;
alter table public.together_messages add constraint together_messages_content_rating_check
  check(content_rating is null or content_rating in('safe','suggestive','explicit'));
alter table public.together_messages drop constraint if exists together_messages_visibility_scope_check;
alter table public.together_messages add constraint together_messages_visibility_scope_check
  check(visibility_scope in('all','web_adult'));
alter table public.together_messages drop constraint if exists together_messages_safe_bridge_length_check;
alter table public.together_messages add constraint together_messages_safe_bridge_length_check
  check(safe_bridge is null or char_length(safe_bridge) between 1 and 500);

alter table public.together_conversation_attachments
  add column if not exists content_rating text,
  add column if not exists visibility_scope text not null default 'web_adult',
  add column if not exists safe_variant_key text,
  add column if not exists moderation_version text not null default 'unclassified';
alter table public.together_conversation_attachments drop constraint if exists together_attachments_content_rating_check;
alter table public.together_conversation_attachments add constraint together_attachments_content_rating_check
  check(content_rating is null or content_rating in('safe','suggestive','explicit'));
alter table public.together_conversation_attachments drop constraint if exists together_attachments_visibility_scope_check;
alter table public.together_conversation_attachments add constraint together_attachments_visibility_scope_check
  check(visibility_scope in('all','web_adult'));

alter table public.together_generated_media
  add column if not exists content_rating text,
  add column if not exists visibility_scope text not null default 'web_adult',
  add column if not exists safe_variant_key text,
  add column if not exists moderation_version text not null default 'unclassified';
alter table public.together_generated_media drop constraint if exists together_generated_media_content_rating_check;
alter table public.together_generated_media add constraint together_generated_media_content_rating_check
  check(content_rating is null or content_rating in('safe','suggestive','explicit'));
alter table public.together_generated_media drop constraint if exists together_generated_media_visibility_scope_check;
alter table public.together_generated_media add constraint together_generated_media_visibility_scope_check
  check(visibility_scope in('all','web_adult'));

alter table public.together_memories
  add column if not exists content_rating text,
  add column if not exists visibility_scope text not null default 'web_adult',
  add column if not exists moderation_version text not null default 'unclassified';
alter table public.together_memories drop constraint if exists together_memories_content_rating_check;
alter table public.together_memories add constraint together_memories_content_rating_check
  check(content_rating is null or content_rating in('safe','suggestive','explicit'));
alter table public.together_memories drop constraint if exists together_memories_visibility_scope_check;
alter table public.together_memories add constraint together_memories_visibility_scope_check
  check(visibility_scope in('all','web_adult'));

alter table public.together_open_threads
  add column if not exists content_rating text,
  add column if not exists visibility_scope text not null default 'web_adult',
  add column if not exists moderation_version text not null default 'unclassified';
alter table public.together_open_threads drop constraint if exists together_open_threads_content_rating_check;
alter table public.together_open_threads add constraint together_open_threads_content_rating_check
  check(content_rating is null or content_rating in('safe','suggestive','explicit'));
alter table public.together_open_threads drop constraint if exists together_open_threads_visibility_scope_check;
alter table public.together_open_threads add constraint together_open_threads_visibility_scope_check
  check(visibility_scope in('all','web_adult'));

-- Reflections are derived prompt context. Existing rows cannot be classified
-- confidently, so they fail closed until refreshed from a safe turn.
alter table public.together_relationship_reflections
  add column if not exists content_rating text not null default 'explicit' check(content_rating in('safe','suggestive','explicit')),
  add column if not exists visibility_scope text not null default 'web_adult' check(visibility_scope in('all','web_adult')),
  add column if not exists moderation_version text not null default 'legacy-conservative-v1';

-- Existing adult-capable provider rows and explicit-mode rows are restricted.
-- The production ceiling in the immediately preceding release makes approved,
-- non-adult-provider rows safe to backfill. Pending/uncertain rows remain null
-- and therefore fail closed on every non-adult projection.
update public.together_messages
set content_rating='explicit',visibility_scope='web_adult',
    safe_bridge=coalesce(safe_bridge,'You and your companion shared a more intimate moment and grew closer.'),
    moderation_version='legacy-adult-route-v1'
where content_rating is null and (
  lower(coalesce(provider_metadata->>'contentMode',''))='explicit'
  or lower(coalesce(provider_metadata->>'requestedMode',''))='explicit'
  or lower(coalesce(provider_metadata->>'provider','')) in('xai','venice')
  or lower(coalesce(provider_metadata->>'adultAuthorized',''))='true'
);
update public.together_messages
set content_rating=case when lower(coalesce(provider_metadata->>'contentMode','')) in('mature','romance') then 'suggestive' else 'safe' end,
    visibility_scope='all',moderation_version='legacy-production-ceiling-v1'
where content_rating is null and moderation_status='approved';

update public.together_generated_media
set content_rating=case when content_level in('suggestive','mature','explicit') then 'explicit' when content_level='romance' then 'suggestive' else 'safe' end,
    visibility_scope=case when content_level in('suggestive','mature','explicit') then 'web_adult' else 'all' end,
    moderation_version='legacy-media-level-v1'
where content_rating is null;

update public.together_conversation_attachments attachment
set content_rating=message.content_rating,
    visibility_scope=case when message.visibility_scope='all' and message.content_rating in('safe','suggestive') then 'all' else 'web_adult' end,
    moderation_version=case when message.id is not null then message.moderation_version else 'legacy-attachment-analysis-v1' end
from public.together_messages message
where attachment.message_id=message.id and attachment.content_rating is null;

update public.together_memories memory
set content_rating=coalesce(message.content_rating,'safe'),
    visibility_scope=case when message.visibility_scope='web_adult' or message.content_rating is null or message.content_rating='explicit' then 'web_adult' else 'all' end,
    moderation_version=coalesce(nullif(message.moderation_version,''),'legacy-memory-source-v1')
from public.together_messages message where memory.source_message_id=message.id and memory.content_rating is null;
update public.together_open_threads thread
set content_rating=message.content_rating,
    visibility_scope=case when message.visibility_scope='all' and message.content_rating in('safe','suggestive') then 'all' else 'web_adult' end,
    moderation_version=coalesce(nullif(message.moderation_version,''),'legacy-thread-source-v1')
from public.together_messages message where thread.source_message_id=message.id and thread.content_rating is null;
update public.together_conversations conversation
set canonical_context=jsonb_strip_nulls(coalesce(conversation.canonical_context,'{}'::jsonb)||jsonb_build_object('summary',conversation.summary,'projectionVersion','web-adult-v1')),
    safe_context=case when exists(select 1 from public.together_messages message where message.conversation_id=conversation.id and message.visibility_scope='web_adult')
      then coalesce(conversation.safe_context,'{}'::jsonb)||jsonb_build_object('summary','You and your companion shared a more intimate moment and grew closer.','projectionVersion','web-adult-v1')
      else jsonb_strip_nulls(coalesce(conversation.safe_context,'{}'::jsonb)||jsonb_build_object('summary',conversation.summary,'projectionVersion','safe-context-v1')) end;

create or replace function public.kivelle_apply_message_policy() returns trigger
language plpgsql set search_path=public as $$
declare
  v_rating text:=lower(coalesce(new.provider_metadata->>'contentRating',''));
  v_scope text:=lower(coalesce(new.provider_metadata->>'visibilityScope',''));
  v_version text:=nullif(new.provider_metadata->>'moderationVersion','');
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
  new.content_rating:=v_rating;
  new.visibility_scope:=case when v_scope='all' and v_rating in('safe','suggestive') then 'all' when v_rating in('safe','suggestive') and v_scope='' then 'all' else 'web_adult' end;
  new.moderation_version:=coalesce(v_version,case when v_rating is null then 'unclassified' else 'server-policy-v1' end);
  if new.visibility_scope='web_adult' and new.safe_bridge is null then
    new.safe_bridge:='You and your companion shared a more intimate moment and grew closer.';
  end if;
  return new;
end $$;
drop trigger if exists together_messages_apply_policy on public.together_messages;
create trigger together_messages_apply_policy before insert or update of content,moderation_status,provider_metadata
on public.together_messages for each row execute function public.kivelle_apply_message_policy();

create or replace function public.kivelle_apply_attachment_policy() returns trigger
language plpgsql set search_path=public as $$
declare v_message public.together_messages%rowtype;
begin
  if new.message_id is not null then
    select * into v_message from public.together_messages where id=new.message_id;
    if found then
      new.content_rating:=v_message.content_rating;
      new.visibility_scope:=v_message.visibility_scope;
      new.moderation_version:=v_message.moderation_version;
    end if;
  end if;
  if new.content_rating is null then new.visibility_scope:='web_adult'; end if;
  return new;
end $$;
drop trigger if exists together_attachments_apply_policy on public.together_conversation_attachments;
create trigger together_attachments_apply_policy before insert or update of message_id,analysis_status,analysis_metadata
on public.together_conversation_attachments for each row execute function public.kivelle_apply_attachment_policy();

create or replace function public.kivelle_apply_generated_media_policy() returns trigger
language plpgsql set search_path=public as $$
begin
  -- Adult-route images stay restricted even when their requested level was
  -- merely suggestive. A future independently generated safe variant can be
  -- attached through safe_variant_key; the original is never exposed natively.
  new.content_rating:=case when new.content_level in('suggestive','mature','explicit') then 'explicit' when new.content_level='romance' then 'suggestive' else 'safe' end;
  new.visibility_scope:=case when new.content_level in('suggestive','mature','explicit') then 'web_adult' else 'all' end;
  new.moderation_version:=coalesce(nullif(new.moderation_version,'unclassified'),'media-level-v1');
  return new;
end $$;
drop trigger if exists together_generated_media_apply_policy on public.together_generated_media;
create trigger together_generated_media_apply_policy before insert or update of content_level
on public.together_generated_media for each row execute function public.kivelle_apply_generated_media_policy();

create or replace function public.kivelle_apply_open_thread_policy() returns trigger
language plpgsql set search_path=public as $$
declare v_message public.together_messages%rowtype;
begin
  if new.source_message_id is not null then
    select * into v_message from public.together_messages where id=new.source_message_id;
    if found then
      new.content_rating:=v_message.content_rating;
      new.visibility_scope:=case when v_message.visibility_scope='all' and v_message.content_rating in('safe','suggestive') then 'all' else 'web_adult' end;
      new.moderation_version:=coalesce(nullif(v_message.moderation_version,''),'thread-source-v1');
    end if;
  elsif new.content_rating is null then
    new.visibility_scope:='web_adult';new.moderation_version:='unclassified';
  end if;
  return new;
end $$;
drop trigger if exists together_open_threads_apply_policy on public.together_open_threads;
create trigger together_open_threads_apply_policy before insert or update of source_message_id
on public.together_open_threads for each row execute function public.kivelle_apply_open_thread_policy();

create or replace function public.kivelle_apply_memory_policy() returns trigger
language plpgsql set search_path=public as $$
declare v_message public.together_messages%rowtype;v_previous public.together_memories%rowtype;
begin
  if new.source_message_id is not null then
    select * into v_message from public.together_messages where id=new.source_message_id;
    if found then
      new.content_rating:=v_message.content_rating;
      new.visibility_scope:=case when v_message.visibility_scope='all' and v_message.content_rating in('safe','suggestive') then 'all' else 'web_adult' end;
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
drop trigger if exists together_memories_apply_policy on public.together_memories;
create trigger together_memories_apply_policy before insert or update of source_message_id,supersedes_memory_id,canonical_text
on public.together_memories for each row execute function public.kivelle_apply_memory_policy();

-- Service-side semantic recall has an explicit projection parameter. Native
-- and ordinary web turns cannot retrieve unknown or restricted memory text.
drop function if exists public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean);
create function public.kivelle_match_memories_for_projection(
  p_user_id uuid,p_character_instance_id uuid,p_embedding extensions.vector(1536),
  p_limit integer,p_min_similarity double precision,p_include_restricted boolean default false
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
    and (p_include_restricted or (m.visibility_scope='all' and m.content_rating in('safe','suggestive')))
    and 1-(m.embedding<=>p_embedding)>=greatest(.35,least(.9,p_min_similarity))
  order by m.embedding<=>p_embedding limit least(greatest(p_limit,1),40)
$$;
revoke all on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean) from public,anon,authenticated;
grant execute on function public.kivelle_match_memories_for_projection(uuid,uuid,extensions.vector,integer,double precision,boolean) to service_role;

-- Direct table reads are the compatibility boundary for old/native clients.
-- Unknown content is not visible; canonical reads are service-role Edge calls.
drop policy if exists together_messages_own_read on public.together_messages;
drop policy if exists together_messages_safe_own_read on public.together_messages;
create policy together_messages_safe_own_read on public.together_messages for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));
drop policy if exists together_conversation_attachments_own_read on public.together_conversation_attachments;
drop policy if exists together_conversation_attachments_safe_own_read on public.together_conversation_attachments;
create policy together_conversation_attachments_safe_own_read on public.together_conversation_attachments for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));
drop policy if exists "Users read their generated media" on public.together_generated_media;
drop policy if exists together_generated_media_safe_own_read on public.together_generated_media;
create policy together_generated_media_safe_own_read on public.together_generated_media for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));
drop policy if exists together_memories_own_read on public.together_memories;
drop policy if exists "Users read their memories" on public.together_memories;
drop policy if exists together_memories_safe_own_read on public.together_memories;
create policy together_memories_safe_own_read on public.together_memories for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));
drop policy if exists together_threads_own_read on public.together_open_threads;
drop policy if exists together_open_threads_safe_own_read on public.together_open_threads;
create policy together_open_threads_safe_own_read on public.together_open_threads for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));
drop policy if exists together_relationship_reflections_own_read on public.together_relationship_reflections;
drop policy if exists together_relationship_reflections_safe_own_read on public.together_relationship_reflections;
create policy together_relationship_reflections_safe_own_read on public.together_relationship_reflections for select to authenticated
  using(user_id=auth.uid() and visibility_scope='all' and content_rating in('safe','suggestive'));

-- Canonical conversation context and adult eligibility are never exposed
-- through direct PostgREST. All client surfaces use projected Edge APIs.
drop policy if exists together_conversations_own_read on public.together_conversations;
drop policy if exists together_profiles_own_read on public.together_profiles;
drop policy if exists together_profiles_own_insert on public.together_profiles;
drop policy if exists together_profiles_own_update on public.together_profiles;
revoke all on public.together_conversations,public.together_profiles from anon,authenticated;
grant all on public.together_conversations,public.together_profiles to service_role;
drop policy if exists together_media_offers_own_read on public.together_media_offers;
drop policy if exists together_media_offers_safe_own_read on public.together_media_offers;
create policy together_media_offers_safe_own_read on public.together_media_offers for select to authenticated
  using(auth.uid()=user_id and content_level in('standard','romance'));

-- Raw generated/attachment objects must never be fetched directly by native
-- clients. Only profile/persona avatars retain owner reads; all other private
-- media is delivered by policy-checking Edge functions using short-lived URLs.
drop policy if exists together_media_own_read on storage.objects;
drop policy if exists together_media_avatar_own_read on storage.objects;
create policy together_media_avatar_own_read on storage.objects for select to authenticated using(
  bucket_id='together-user-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and (
    name like auth.uid()::text||'/avatar-%'
    or name like auth.uid()::text||'/persona-avatars/%'
  )
);

create index if not exists together_messages_safe_projection_idx
  on public.together_messages(conversation_id,conversation_sequence desc,id desc)
  where visibility_scope='all' and content_rating in('safe','suggestive');
create index if not exists together_generated_media_safe_projection_idx
  on public.together_generated_media(user_id,created_at desc)
  where visibility_scope='all' and content_rating in('safe','suggestive');

-- Inbox state always advances in time, but content previews only advance with
-- safe rows. A restricted-only thread receives one generic safe preview.
create or replace function public.kivelle_update_conversation_message_state() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_safe boolean:=new.visibility_scope='all' and new.content_rating in('safe','suggestive');
begin
  update public.together_conversations
  set last_message_at=case when last_message_at is null or new.created_at>=last_message_at then new.created_at else last_message_at end,
      last_message_preview=case
        when v_safe and (last_message_at is null or new.created_at>=last_message_at) then left(nullif(btrim(regexp_replace(new.content,'[[:space:]]+',' ','g')),''),500)
        when not v_safe and last_message_preview is null then 'Private exchange'
        else last_message_preview end,
      last_message_role=case when v_safe and (last_message_at is null or new.created_at>=last_message_at) then new.role else last_message_role end,
      last_message_delivery_status=case when v_safe and (last_message_at is null or new.created_at>=last_message_at) then new.delivery_status else last_message_delivery_status end,
      last_message_attachment_kind=case when v_safe and (last_message_at is null or new.created_at>=last_message_at) and tg_op='INSERT' then null else last_message_attachment_kind end,
      last_assistant_message_at=case when new.role='assistant' and (last_assistant_message_at is null or new.created_at>=last_assistant_message_at) then new.created_at else last_assistant_message_at end,
      updated_at=greatest(updated_at,new.created_at)
  where id=new.conversation_id;
  return new;
end $$;
drop trigger if exists together_message_conversation_state on public.together_messages;
create trigger together_message_conversation_state
after insert or update of content,role,delivery_status,content_rating,visibility_scope on public.together_messages
for each row execute function public.kivelle_update_conversation_message_state();

with latest_safe as(
  select distinct on(message.conversation_id) message.conversation_id,message.id,message.created_at,
    left(nullif(btrim(regexp_replace(message.content,'[[:space:]]+',' ','g')),''),500) preview,
    message.role,message.delivery_status
  from public.together_messages message
  where message.visibility_scope='all' and message.content_rating in('safe','suggestive')
  order by message.conversation_id,message.created_at desc,message.id desc
)
update public.together_conversations conversation
set last_message_preview=coalesce(latest_safe.preview,'Private exchange'),
    last_message_role=latest_safe.role,last_message_delivery_status=latest_safe.delivery_status,
    last_message_attachment_kind=null
from latest_safe where conversation.id=latest_safe.conversation_id;
update public.together_conversations conversation
set last_message_preview='Private exchange',last_message_role=null,last_message_delivery_status=null,last_message_attachment_kind=null
where exists(select 1 from public.together_messages message where message.conversation_id=conversation.id)
  and not exists(select 1 from public.together_messages message where message.conversation_id=conversation.id and message.visibility_scope='all' and message.content_rating in('safe','suggestive'));

commit;
