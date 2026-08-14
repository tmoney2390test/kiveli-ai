begin;

alter table public.together_profiles
  add column if not exists photo_preferences jsonb not null default '{"companionPhotos":true,"automaticPhotos":true}'::jsonb;

alter table public.together_character_versions
  add column if not exists visual_identity jsonb not null default '{}'::jsonb;

alter table public.together_generated_media
  add column if not exists conversation_id uuid references public.together_conversations(id) on delete set null,
  add column if not exists story_arc_id uuid references public.together_story_arc_instances(id) on delete set null,
  add column if not exists location_id uuid references public.together_locations(id) on delete set null,
  add column if not exists request_key text,
  add column if not exists failure_code text,
  add column if not exists failure_reason_safe text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists provider_request_id text,
  add column if not exists generation_ms integer,
  add column if not exists content_type text,
  add column if not exists byte_size integer,
  add column if not exists claimed_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

alter table public.together_generated_media drop constraint if exists together_generated_media_content_level_check;
alter table public.together_generated_media add constraint together_generated_media_content_level_check
  check(content_level in ('standard','romance','suggestive','mature','explicit'));
alter table public.together_generated_media add constraint together_generated_media_attempt_count_check check(attempt_count between 0 and 5) not valid;
alter table public.together_generated_media validate constraint together_generated_media_attempt_count_check;

create unique index if not exists together_generated_media_request_key_idx
  on public.together_generated_media(user_id,request_key) where request_key is not null;
create index if not exists together_generated_media_dispatch_idx
  on public.together_generated_media(status,next_attempt_at,created_at) where status in ('queued','generating');
create index if not exists together_generated_media_location_idx
  on public.together_generated_media(user_id,location_id,created_at desc) where status='ready';
create index if not exists together_generated_media_message_idx
  on public.together_generated_media(user_id,message_id) where message_id is not null;

comment on column public.together_character_versions.visual_identity is 'Canonical, version-owned fictional adult identity used by server-side media providers.';
comment on column public.together_generated_media.request_key is 'Server-derived idempotency key scoped to the owning user.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('kivelle-character-reference','kivelle-character-reference',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

update public.together_character_versions version
set visual_identity = jsonb_strip_nulls(jsonb_build_object(
  'canonicalDescription', case template.slug
    when 'maya' then 'Maya is a fictional adult woman in her mid-twenties with a warm, expressive face and a grounded creative presence.'
    when 'chloe' then 'Chloe is a fictional adult woman with an adventurous, outgoing presence and a bright, perceptive expression.'
    when 'alex' then 'Alex is a fictional adult man with a calm, thoughtful presence and understated creative style.'
    else concat(template.name, ' is a fictional adult companion whose established appearance must remain consistent.') end,
  'age', template.age,
  'referenceStoragePaths', jsonb_build_array(concat(template.slug,'/main.png')),
  'hair', coalesce(version.appearance_config->>'hair','preserve the canonical reference hairstyle and color'),
  'eyes', coalesce(version.appearance_config->>'eyes','preserve the canonical reference eye color'),
  'skinTone', version.appearance_config->>'skinTone',
  'build', coalesce(version.appearance_config->>'build','preserve canonical body proportions'),
  'fashionStyle', coalesce(version.appearance_config->>'style','natural contemporary city style'),
  'visualDoNotChange', jsonb_build_array('facial identity','adult age','hair color','eye color','body proportions','distinguishing features'),
  'photoStyle', case template.slug
    when 'maya' then '{"frequency":"occasional","selfieComfort":"medium","posingStyle":"natural","preferredShots":["candid","selfie","scene"]}'::jsonb
    when 'chloe' then '{"frequency":"occasional","selfieComfort":"high","posingStyle":"playful","preferredShots":["selfie","full_body","candid"]}'::jsonb
    else '{"frequency":"rare","selfieComfort":"low","posingStyle":"natural","preferredShots":["candid","scene","portrait"]}'::jsonb end
))
from public.together_character_templates template
where version.character_template_id=template.id and version.visual_identity='{}'::jsonb;

create or replace function public.kivelle_claim_media_jobs(p_limit integer default 5)
returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
begin
  return query
  with claimable as (
    select id from public.together_generated_media
    where status='queued' and coalesce(next_attempt_at,'-infinity'::timestamptz)<=now()
    order by created_at
    for update skip locked
    limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media
  set status='generating',claimed_at=now(),attempt_count=media.attempt_count+1,updated_at=now()
  from claimable where media.id=claimable.id returning media.*;
end $$;
revoke all on function public.kivelle_claim_media_jobs(integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs(integer) to service_role;

create or replace function public.kivelle_recover_stale_media_jobs(p_stale_minutes integer default 12)
returns integer language plpgsql security definer set search_path=public as $$
declare recovered integer;
begin
  update public.together_generated_media set
    status=case when attempt_count>=2 then 'failed' else 'queued' end,
    failure_code=case when attempt_count>=2 then 'provider_timeout' else failure_code end,
    failure_reason_safe=case when attempt_count>=2 then 'The photo took too long. You can ask again.' else failure_reason_safe end,
    claimed_at=null,next_attempt_at=case when attempt_count>=2 then null else now()+interval '1 minute' end,updated_at=now()
  where status='generating' and claimed_at<now()-make_interval(mins=>least(greatest(p_stale_minutes,5),60));
  get diagnostics recovered=row_count;
  return recovered;
end $$;
revoke all on function public.kivelle_recover_stale_media_jobs(integer) from public,anon,authenticated;
grant execute on function public.kivelle_recover_stale_media_jobs(integer) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.together_generated_media;
exception when duplicate_object then null;
end $$;

commit;
