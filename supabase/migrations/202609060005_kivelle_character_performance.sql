begin;

-- A derived seed is deliberately small: the shared runtime compiler resolves
-- it from the current authored identity on every load. It never freezes stale
-- occupations, names, or traits into legacy characters. An authored profile
-- must contain the complete versioned behavior/voice contract.
create or replace function public.kivelle_valid_character_performance(profile jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  state_name text;
  item jsonb;
begin
  if profile is null or jsonb_typeof(profile) <> 'object' or profile->'version' is distinct from '1'::jsonb then return false; end if;
  if profile = '{"version":1,"source":"derived"}'::jsonb then return true; end if;
  if coalesce(profile->>'source','') not in ('authored','derived') then return false; end if;
  foreach state_name in array array['motivation','contradiction','defense'] loop
    if jsonb_typeof(profile->state_name) is distinct from 'string' or length(trim(profile->>state_name)) = 0 then return false; end if;
  end loop;
  if jsonb_typeof(profile->'states') is distinct from 'object' then return false; end if;
  foreach state_name in array array['relaxed','threatened','angry','vulnerable','aftermath'] loop
    item := profile->'states'->state_name;
    if item is null or jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item->'behavior') is distinct from 'string'
      or jsonb_typeof(item->'speech') is distinct from 'string'
      or length(trim(item->>'behavior')) = 0 or length(trim(item->>'speech')) = 0
      or jsonb_typeof(item->'examples') is distinct from 'array' then return false; end if;
    if jsonb_array_length(item->'examples') < 2 or jsonb_array_length(item->'examples') > 6 then return false; end if;
    if exists(select 1 from jsonb_array_elements(item->'examples') as entry(value)
      where jsonb_typeof(entry.value) <> 'string' or length(trim(entry.value #>> '{}')) = 0) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.together_ensure_character_performance()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not coalesce(new.character_bible,'{}'::jsonb) ? 'performance' then
    new.character_bible := coalesce(new.character_bible,'{}'::jsonb)
      || '{"performance":{"version":1,"source":"derived"}}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists together_character_versions_require_performance on public.together_character_versions;
create trigger together_character_versions_require_performance
before insert or update of character_bible on public.together_character_versions
for each row execute function public.together_ensure_character_performance();

-- Every version, including unpublished/custom and historical versions used by
-- existing instances, receives the same compatibility seed. Authored work wins.
update public.together_character_versions
set character_bible = coalesce(character_bible,'{}'::jsonb)
  || '{"performance":{"version":1,"source":"derived"}}'::jsonb
where not coalesce(character_bible,'{}'::jsonb) ? 'performance';

alter table public.together_character_versions
  add constraint together_character_versions_performance_required
  check (public.kivelle_valid_character_performance(character_bible->'performance')) not valid;
alter table public.together_character_versions
  validate constraint together_character_versions_performance_required;

-- Creator Studio promotes the reviewed profile during its existing atomic
-- finalization transaction. SQL imports and older writers remain supported by
-- the version trigger above; no second creation or publishing path is needed.
create or replace function public.together_finalize_creator_performance()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  profile jsonb;
begin
  if new.status <> 'finalized' or old.status = 'finalized' or new.finalized_template_id is null then return new; end if;
  profile := coalesce(new.metadata->'characterPerformance','{"version":1,"source":"derived"}'::jsonb);
  if not public.kivelle_valid_character_performance(profile) then
    raise exception using errcode='23514', message='This companion needs a complete behavior and speech profile.';
  end if;
  update public.together_character_versions version
  set character_bible = coalesce(version.character_bible,'{}'::jsonb) || jsonb_build_object('performance',profile)
  from public.together_character_templates template
  where template.id=new.finalized_template_id and template.creator_id=new.user_id
    and version.character_template_id=template.id and version.version=template.current_published_version;
  if not found then
    raise exception using errcode='23514', message='The reviewed companion version could not be found.';
  end if;
  return new;
end;
$$;

drop trigger if exists together_creator_drafts_finalize_performance on public.together_creator_drafts;
create trigger together_creator_drafts_finalize_performance
before update of status on public.together_creator_drafts
for each row execute function public.together_finalize_creator_performance();

revoke all on function public.together_ensure_character_performance() from public;
revoke all on function public.together_finalize_creator_performance() from public;

commit;
