-- Natural character language at the data boundary. Early content packs reused
-- schedule scaffolding as profile status, event titles, and model context.

create or replace function public.kivelle_naturalize_character_activity(
  p_value text,
  p_activity_key text default null,
  p_occupation text default null
) returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  cleaned text := trim(regexp_replace(regexp_replace(coalesce(p_value,''),'_+',' ','g'),'\s+',' ','g'));
  parts text[];
  place_name text;
begin
  if cleaned='' then return 'Enjoying some free time'; end if;
  if p_occupation is not null and regexp_replace(lower(cleaned),'[^a-z0-9]+',' ','g')=regexp_replace(lower(trim(p_occupation)),'[^a-z0-9]+',' ','g') then return 'At work'; end if;
  if coalesce(p_activity_key,'')~*'(^|_)(work|occupation|job|shift)($|_)'
    and cleaned!~*'^(at|away|between|on|out|sleeping|working|taking|having|making|getting|going|heading|finishing|starting|preparing|running|walking|meeting|seeing|editing|photographing|shooting|cooking|recovering|relaxing|winding|spending|enjoying|hosting|joining|covering|handling|checking|reading|writing|practicing|training|teaching|studying|building|fixing|serving|opening|closing|browsing|testing|calling|doing|keeping|catching|helping|planning|recording|producing|coordinating|watching|listening|driving|riding|swimming|exploring|researching|reviewing|leading|maintaining)([[:space:]]|$)'
    and array_length(regexp_split_to_array(cleaned,'\s+'),1)<=8
  then return 'At work'; end if;

  parts:=regexp_match(cleaned,'^Following (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;
  parts:=regexp_match(cleaned,'^(?:Taking|Following) (?:the )?(?:weekday routine|Friday variation|Saturday variation|Sunday variation|weekend routine) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;

  if cleaned~*'^(A slower Sunday routine|Taking a slower Sunday with room for a real conversation)$' then return 'Taking Sunday at an easy pace'; end if;
  if cleaned~*'^Taking a genuine weekend routine$' then return 'Taking the weekend at an easy pace'; end if;
  if cleaned~*'^Taking private time at home(?: with .+)?$' then return 'Having some quiet time at home'; end if;
  if cleaned~*'^Making an ordinary meal at home$' then return 'Making something to eat at home'; end if;
  if cleaned~*'^Picking up a few practical things$' then return 'Running a few errands'; end if;
  if cleaned~*'^Cooking or recovering at home$' then return 'Taking it easy at home'; end if;
  if cleaned~*'^Starting the day at home$' then return 'Getting ready for the day at home'; end if;
  if cleaned~*'^Offline for the night$' then return 'Winding down'; end if;
  if cleaned~*'^Having some unstructured time(?: at home)?$' then return 'Enjoying some free time'; end if;
  if cleaned~*'^Winding down at home after a full .+ day$' then return 'Winding down at home'; end if;
  if cleaned~*'^Focused on work$' then return 'Working'; end if;
  if cleaned~*'^In the middle of a project$' then return 'Working on a project'; end if;
  if cleaned~*'^Taking care of a few things$' then return 'Running a few errands'; end if;

  parts:=regexp_match(cleaned,'^Handling an errand around (.+)$','i');
  if parts is not null then return 'Running an errand near '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Friday evening around (.+)$','i');
  if parts is not null then return 'Spending Friday evening at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Saturday around (.+)$','i');
  if parts is not null then return 'Spending Saturday at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(Breakfast|Lunch|Dinner)(.*)$','i');
  if parts is not null then return 'Having '||lower(parts[1])||parts[2];end if;
  parts:=regexp_match(cleaned,'^Drinks(.*)$','i');
  if parts is not null then return 'Having drinks'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Coffee(.*)$','i');
  if parts is not null then return 'Having coffee'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Movie(.*)$','i');
  if parts is not null then return 'Watching a movie'||parts[1];end if;
  return upper(left(cleaned,1))||substr(cleaned,2);
end;
$$;

create or replace function public.kivelle_naturalize_character_event_summary(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare cleaned text:=trim(regexp_replace(coalesce(p_value,''),'\s+',' ','g'));parts text[];
begin
  if cleaned='' then return '';end if;
  cleaned:=regexp_replace(cleaned,'[.!?]+$','','g');
  parts:=regexp_match(cleaned,'^(.+) finishes sleeping(?: at home)? at (.+)$','i');
  if parts is not null then return parts[1]||' wakes up around '||parts[2]||'.';end if;
  parts:=regexp_match(cleaned,'^(.+) (?:starts|begins) sleeping(?: at home)? at (.+)$','i');
  if parts is not null then return parts[1]||' goes to sleep around '||parts[2]||'.';end if;
  cleaned:=upper(left(cleaned,1))||substr(cleaned,2);
  return cleaned||case when cleaned~'[.!?]$' then '' else '.' end;
end;
$$;

create or replace function public.kivelle_naturalize_character_biography(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare cleaned text:=trim(regexp_replace(coalesce(p_value,''),'\s+',' ','g'));parts text[];
begin
  parts:=regexp_match(cleaned,'^(.+),\s*[0-9]+,\s*is\s+([^.]+)\.\s*([a-z][^.]+)\.\s*(.+)$');
  if parts is null then return cleaned||case when cleaned<>'' and cleaned!~'[.!?]$' then '.' else '' end;end if;
  return parts[1]||' is '||parts[2]||'. '||parts[1]||' is '||parts[3]||'. '||parts[4]||case when parts[4]~'[.!?]$' then '' else '.' end;
end;
$$;

create or replace function public.kivelle_naturalize_activity_metadata(p_metadata jsonb,p_activity_key text,p_occupation text default null)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare result jsonb:=coalesce(p_metadata,'{}'::jsonb);variants jsonb;
begin
  if jsonb_typeof(result->'activityLabel')='string' then result:=jsonb_set(result,'{activityLabel}',to_jsonb(public.kivelle_naturalize_character_activity(result->>'activityLabel',p_activity_key,p_occupation)));end if;
  if jsonb_typeof(result->'upcomingHint')='string' then result:=jsonb_set(result,'{upcomingHint}',to_jsonb(public.kivelle_naturalize_character_activity(result->>'upcomingHint',null,null)));end if;
  if jsonb_typeof(result->'activityVariants')='array' then
    select coalesce(jsonb_agg(to_jsonb(public.kivelle_naturalize_character_activity(item.value,p_activity_key,p_occupation)) order by item.ordinality),'[]'::jsonb)
      into variants from jsonb_array_elements_text(result->'activityVariants') with ordinality as item(value,ordinality);
    result:=jsonb_set(result,'{activityVariants}',variants);
  end if;
  return result;
end;
$$;

create or replace function public.kivelle_normalize_schedule_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id where version.id=new.character_version_id;
  new.activity:=public.kivelle_naturalize_character_activity(new.activity,coalesce(new.metadata->>'activityKey',new.activity),occupation_title);
  new.metadata:=public.kivelle_naturalize_activity_metadata(new.metadata,coalesce(new.metadata->>'activityKey',new.activity),occupation_title);
  return new;
end;
$$;

create or replace function public.kivelle_normalize_activity_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id where version.id=new.character_version_id;
  new.title:=public.kivelle_naturalize_character_activity(new.title,new.activity_key,occupation_title);
  new.metadata:=public.kivelle_naturalize_activity_metadata(new.metadata,new.activity_key,occupation_title);
  return new;
end;
$$;

create or replace function public.kivelle_normalize_materialized_schedule_language()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.source in('recurring','generated','override') then
    new.title:=public.kivelle_naturalize_character_activity(new.title,new.activity_key,null);
    new.metadata:=public.kivelle_naturalize_activity_metadata(new.metadata,new.activity_key);
  end if;
  return new;
end;
$$;

create or replace function public.kivelle_normalize_character_biography()
returns trigger language plpgsql set search_path='' as $$
begin new.biography:=public.kivelle_naturalize_character_biography(new.biography);return new;end;
$$;

drop trigger if exists kivelle_normalize_schedule_template_language on public.together_schedule_templates;
create trigger kivelle_normalize_schedule_template_language before insert or update of activity,metadata on public.together_schedule_templates for each row execute function public.kivelle_normalize_schedule_template_language();
drop trigger if exists kivelle_normalize_activity_template_language on public.together_character_activity_templates;
create trigger kivelle_normalize_activity_template_language before insert or update of title,metadata on public.together_character_activity_templates for each row execute function public.kivelle_normalize_activity_template_language();
drop trigger if exists kivelle_normalize_materialized_schedule_language on public.together_character_schedule_events;
create trigger kivelle_normalize_materialized_schedule_language before insert or update of title,metadata on public.together_character_schedule_events for each row execute function public.kivelle_normalize_materialized_schedule_language();
drop trigger if exists kivelle_normalize_character_biography on public.together_character_templates;
create trigger kivelle_normalize_character_biography before insert or update of biography on public.together_character_templates for each row execute function public.kivelle_normalize_character_biography();

update public.together_schedule_templates schedule
set activity=public.kivelle_naturalize_character_activity(schedule.activity,coalesce(schedule.metadata->>'activityKey',schedule.activity),template.occupation),
    metadata=public.kivelle_naturalize_activity_metadata(schedule.metadata,coalesce(schedule.metadata->>'activityKey',schedule.activity),template.occupation)
from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id
where version.id=schedule.character_version_id;

update public.together_character_activity_templates activity
set title=public.kivelle_naturalize_character_activity(activity.title,activity.activity_key,template.occupation),
    metadata=public.kivelle_naturalize_activity_metadata(activity.metadata,activity.activity_key,template.occupation),
    updated_at=now()
from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id
where version.id=activity.character_version_id;

update public.together_character_schedule_events schedule
set title=public.kivelle_naturalize_character_activity(schedule.title,schedule.activity_key,template.occupation),
    metadata=public.kivelle_naturalize_activity_metadata(schedule.metadata,schedule.activity_key,template.occupation),
    updated_at=now()
from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id
where instance.id=schedule.character_instance_id and schedule.source in('recurring','generated','override');

update public.together_character_instances instance
set current_activity=public.kivelle_naturalize_character_activity(instance.current_activity,null,template.occupation),
    life_engine_version='life_engine_v4_natural_language',updated_at=now()
from public.together_character_templates template
where template.id=instance.character_template_id;

update public.together_life_events
set title=public.kivelle_naturalize_character_activity(title,metadata->>'activityKey',null),
    narrative_summary=public.kivelle_naturalize_character_event_summary(narrative_summary)
where event_type in('schedule_presence','schedule_outcome') or metadata->>'source'='character_schedule';

update public.together_event_templates
set narrative_summary=public.kivelle_naturalize_character_event_summary(narrative_summary),updated_at=now();

update public.together_character_templates
set biography=public.kivelle_naturalize_character_biography(biography),updated_at=now();

comment on function public.kivelle_naturalize_character_activity(text,text,text) is 'Deterministically removes schedule scaffolding before character activity reaches UI or model context.';
