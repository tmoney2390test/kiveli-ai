-- Remove a repeated generator phrase from every schedule surface and prevent
-- older import paths from restoring it.

create or replace function public.kivelle_remove_schedule_cliche(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select trim(regexp_replace(regexp_replace(coalesce(p_value,''),'\s*without rushing what comes next','','gi'),'\s+',' ','g'));
$$;

create or replace function public.kivelle_remove_schedule_cliche_metadata(p_metadata jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select regexp_replace(coalesce(p_metadata,'{}'::jsonb)::text,'\s*without rushing what comes next','','gi')::jsonb;
$$;

create or replace function public.kivelle_normalize_schedule_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=new.character_version_id;
  new.activity:=public.kivelle_naturalize_character_activity(
    public.kivelle_remove_schedule_cliche(new.activity),
    coalesce(new.metadata->>'activityKey',new.activity),
    occupation_title
  );
  new.metadata:=public.kivelle_naturalize_activity_metadata(
    public.kivelle_remove_schedule_cliche_metadata(new.metadata),
    coalesce(new.metadata->>'activityKey',new.activity),
    occupation_title
  );
  return new;
end;
$$;

create or replace function public.kivelle_normalize_activity_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=new.character_version_id;
  new.title:=public.kivelle_naturalize_character_activity(public.kivelle_remove_schedule_cliche(new.title),new.activity_key,occupation_title);
  new.metadata:=public.kivelle_naturalize_activity_metadata(public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key,occupation_title);
  return new;
end;
$$;

create or replace function public.kivelle_normalize_materialized_schedule_language()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.source in('recurring','generated','override') then
    new.title:=public.kivelle_naturalize_character_activity(public.kivelle_remove_schedule_cliche(new.title),new.activity_key,null);
    new.metadata:=public.kivelle_naturalize_activity_metadata(public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key);
  end if;
  return new;
end;
$$;

update public.together_schedule_templates
set activity=public.kivelle_remove_schedule_cliche(activity),
    metadata=public.kivelle_remove_schedule_cliche_metadata(metadata)
where activity ilike '%without rushing what comes next%'
   or metadata::text ilike '%without rushing what comes next%';

update public.together_character_activity_templates
set title=public.kivelle_remove_schedule_cliche(title),
    metadata=public.kivelle_remove_schedule_cliche_metadata(metadata),
    updated_at=now()
where title ilike '%without rushing what comes next%'
   or metadata::text ilike '%without rushing what comes next%';

update public.together_character_schedule_events
set title=public.kivelle_remove_schedule_cliche(title),
    metadata=public.kivelle_remove_schedule_cliche_metadata(metadata),
    updated_at=now()
where title ilike '%without rushing what comes next%'
   or metadata::text ilike '%without rushing what comes next%';

update public.together_character_instances
set current_activity=public.kivelle_remove_schedule_cliche(current_activity),
    updated_at=now()
where current_activity ilike '%without rushing what comes next%';
