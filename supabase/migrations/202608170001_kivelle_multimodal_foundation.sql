begin;

alter table public.together_profiles
  add column if not exists multimodal_preferences jsonb not null default '{"userPhotoUploads":true,"companionVoiceNotes":true,"autoplayVoiceNotes":false,"liveVoiceCalls":true,"generatedPhotos":true}'::jsonb;

create table if not exists public.together_conversation_attachments(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  message_id uuid references public.together_messages(id) on delete cascade,
  kind text not null check(kind in('image','audio','video')),
  source text not null default 'user' check(source in('user','companion','system')),
  storage_path text not null unique,
  mime_type text not null,
  byte_size integer not null check(byte_size>0 and byte_size<=10485760),
  width integer,
  height integer,
  duration_ms integer,
  upload_status text not null default 'pending' check(upload_status in('pending','uploaded','failed')),
  analysis_status text not null default 'pending' check(analysis_status in('pending','processing','ready','failed','unavailable')),
  analysis_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(width is null or width>0),
  check(height is null or height>0),
  check(duration_ms is null or duration_ms>=0)
);
create index if not exists together_conversation_attachments_conversation_idx on public.together_conversation_attachments(conversation_id,created_at);
create index if not exists together_conversation_attachments_message_idx on public.together_conversation_attachments(message_id) where message_id is not null;
create index if not exists together_conversation_attachments_pending_idx on public.together_conversation_attachments(created_at) where message_id is null;

create or replace function public.kivelle_validate_conversation_attachment() returns trigger language plpgsql set search_path=public as $$
declare
  conversation_user uuid;
  conversation_continuity uuid;
  message_conversation uuid;
  message_user uuid;
begin
  select user_id,continuity_id into conversation_user,conversation_continuity from public.together_conversations where id=new.conversation_id;
  if conversation_user is null or conversation_user<>new.user_id or conversation_continuity<>new.continuity_id then
    raise exception 'attachment must belong to its conversation user and continuity';
  end if;
  if split_part(new.storage_path,'/',1)<>new.user_id::text then raise exception 'attachment storage path must be user scoped'; end if;
  if new.message_id is not null then
    select conversation_id,user_id into message_conversation,message_user from public.together_messages where id=new.message_id;
    if message_conversation is null or message_conversation<>new.conversation_id or message_user<>new.user_id then
      raise exception 'attachment message must belong to its conversation and user';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists together_conversation_attachments_validate on public.together_conversation_attachments;
create trigger together_conversation_attachments_validate before insert or update of user_id,continuity_id,conversation_id,message_id,storage_path on public.together_conversation_attachments for each row execute function public.kivelle_validate_conversation_attachment();

alter table public.together_conversation_attachments enable row level security;
drop policy if exists together_conversation_attachments_own_read on public.together_conversation_attachments;
create policy together_conversation_attachments_own_read on public.together_conversation_attachments for select to authenticated using(user_id=auth.uid());
grant select on public.together_conversation_attachments to authenticated;

create table if not exists public.together_character_voice_profiles(
  id uuid primary key default gen_random_uuid(),
  character_template_id uuid not null references public.together_character_templates(id) on delete cascade,
  voice_key text not null,
  characteristics jsonb not null default '{}'::jsonb,
  provider_mappings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_template_id),
  unique(voice_key)
);
alter table public.together_character_voice_profiles enable row level security;
drop policy if exists together_character_voice_profiles_read on public.together_character_voice_profiles;
create policy together_character_voice_profiles_read on public.together_character_voice_profiles for select to authenticated using(active and exists(
  select 1 from public.together_character_templates template
  where template.id=character_template_id
    and (template.creator_id=auth.uid() or (template.published and template.visibility in('public','unlisted')))
));
grant select on public.together_character_voice_profiles to authenticated;

insert into public.together_character_voice_profiles(character_template_id,voice_key,characteristics,provider_mappings,metadata)
select template.id,coalesce(nullif(template.public_handle,''),template.slug,template.id::text)||'-default',
  jsonb_strip_nulls(jsonb_build_object(
    'warmth',coalesce(version.personality_config->'warmth',version.personality_config->'empathetic','0.6'::jsonb),
    'energy',coalesce(version.personality_config->'energy',version.personality_config->'social_energy','0.55'::jsonb),
    'pace',coalesce(version.communication_style->'pace','0.5'::jsonb),
    'expressiveness',coalesce(version.personality_config->'expressiveness',version.personality_config->'playful','0.55'::jsonb)
  )),
  coalesce(version.voice_config->'providerMappings','{}'::jsonb),
  jsonb_build_object('derivedFromVersionId',version.id)
from public.together_character_templates template
join lateral(
  select value.* from public.together_character_versions value
  where value.character_template_id=template.id
  order by (value.version=template.current_published_version) desc,value.published_at desc nulls last,value.version desc limit 1
) version on true
on conflict(character_template_id) do nothing;

alter table public.together_generated_media drop constraint if exists together_generated_media_media_type_check;
alter table public.together_generated_media add constraint together_generated_media_media_type_check check(media_type in('image','voice_note'));
alter table public.together_generated_media
    add column if not exists duration_ms integer,
    add column if not exists canonical_text text,
    add column if not exists voice_profile_id uuid references public.together_character_voice_profiles(id) on delete set null;
alter table public.together_generated_media drop constraint if exists together_generated_media_duration_check;
alter table public.together_generated_media add constraint together_generated_media_duration_check check(duration_ms is null or duration_ms>=0) not valid;
alter table public.together_generated_media validate constraint together_generated_media_duration_check;

create or replace function public.kivelle_claim_media_jobs(p_limit integer default 5)
returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
begin
  return query
  with claimable as (
    select id from public.together_generated_media
    where media_type='image' and status='queued' and coalesce(next_attempt_at,'-infinity'::timestamptz)<=now()
    order by queue_priority desc,created_at
    for update skip locked
    limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media
  set status='generating',claimed_at=now(),attempt_count=media.attempt_count+1,updated_at=now()
  from claimable where media.id=claimable.id returning media.*;
end $$;

create table if not exists public.together_voice_call_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  status text not null check(status in('creating','ringing','active','ended','failed')),
  request_id text not null,
  provider text,
  provider_session_id text,
  started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  transcript jsonb not null default '[]'::jsonb,
  summary text,
  usage_metadata jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_reason_safe text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ended_at is null or started_at is null or ended_at>=started_at)
);
create unique index if not exists together_voice_call_one_active_idx on public.together_voice_call_sessions(user_id,continuity_id) where status in('creating','ringing','active');
create unique index if not exists together_voice_call_request_idx on public.together_voice_call_sessions(user_id,request_id);
create index if not exists together_voice_call_character_idx on public.together_voice_call_sessions(user_id,character_instance_id,created_at desc);

create or replace function public.kivelle_validate_voice_call_session() returns trigger language plpgsql set search_path=public as $$
declare
  instance_user uuid;
  instance_continuity uuid;
  conversation_instance uuid;
  conversation_continuity uuid;
begin
  select user_id,continuity_id into instance_user,instance_continuity from public.together_character_instances where id=new.character_instance_id;
  select character_instance_id,continuity_id into conversation_instance,conversation_continuity from public.together_conversations where id=new.conversation_id and user_id=new.user_id;
  if instance_user is null or instance_user<>new.user_id or instance_continuity<>new.continuity_id then raise exception 'call character must belong to the same user and Life'; end if;
  if conversation_instance is null or conversation_instance<>new.character_instance_id or conversation_continuity<>new.continuity_id then raise exception 'call conversation must belong to the same character and Life'; end if;
  return new;
end;
$$;
drop trigger if exists together_voice_call_validate on public.together_voice_call_sessions;
create trigger together_voice_call_validate before insert or update of user_id,continuity_id,character_instance_id,conversation_id on public.together_voice_call_sessions for each row execute function public.kivelle_validate_voice_call_session();
alter table public.together_voice_call_sessions enable row level security;
drop policy if exists together_voice_call_sessions_own_read on public.together_voice_call_sessions;
create policy together_voice_call_sessions_own_read on public.together_voice_call_sessions for select to authenticated using(user_id=auth.uid());
grant select on public.together_voice_call_sessions to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('together-user-media','together-user-media',false,10485760,array['image/jpeg','image/png','image/webp','audio/m4a','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

comment on table public.together_conversation_attachments is 'Private normalized user/companion attachments. Provider analysis is optional and never changes canonical world state.';
comment on table public.together_character_voice_profiles is 'Provider-neutral stable character voice identity; provider-specific IDs live only in mappings.';
comment on table public.together_voice_call_sessions is 'Continuity-scoped live voice call lifecycle. Provider credentials are never persisted here.';

commit;
