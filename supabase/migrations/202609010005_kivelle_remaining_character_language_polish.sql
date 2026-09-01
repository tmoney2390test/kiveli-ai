-- Finish the production corpus pass with narrowly targeted rewrites for the
-- remaining machine-authored schedule variants. Specific authored routines
-- and restored occupation prose are intentionally preserved.

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
  role_name text;
begin
  if cleaned='' then return 'Enjoying some free time'; end if;
  if p_occupation is not null and regexp_replace(lower(cleaned),'[^a-z0-9]+',' ','g')=regexp_replace(lower(trim(p_occupation)),'[^a-z0-9]+',' ','g') then return 'At work'; end if;

  parts:=regexp_match(cleaned,'^Following (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;
  parts:=regexp_match(cleaned,'^(?:Taking|Following) (?:the )?(?:weekday routine|Friday variation|Saturday variation|Sunday variation|weekend routine) at (.+) without forcing the pace$','i');
  if parts is not null then place_name:=initcap(replace(parts[1],'-',' '));return 'Spending some time at '||place_name;end if;

  if cleaned~*'^(A slower Sunday routine|Taking a slower Sunday with room for a real conversation)$' then return 'Taking Sunday at an easy pace'; end if;
  if cleaned~*'^Taking a genuine weekend routine$' then return 'Taking the weekend at an easy pace'; end if;
  parts:=regexp_match(cleaned,'^Taking private time at home with (.+)$','i');
  if parts is not null then return 'Having some quiet time at home with '||parts[1];end if;
  if cleaned~*'^Taking private time at home$' then return 'Having some quiet time at home'; end if;
  parts:=regexp_match(cleaned,'^Making private time for (.+)$','i');
  if parts is not null then return 'Making time for '||parts[1];end if;
  if cleaned~*'^Making an ordinary meal at home$' then return 'Making something to eat at home'; end if;
  if cleaned~*'^Picking up a few practical things$' then return 'Running a few errands'; end if;
  if cleaned~*'^Picking up a few practical things without rushing what comes next$' then return 'Running a few errands at an easy pace'; end if;
  if cleaned~*'^Picking up a few practical things while leaving room for the day to change naturally$' then return 'Running a few errands with time to spare'; end if;
  if cleaned~*'^Cooking or recovering at home$' then return 'Taking it easy at home'; end if;
  if cleaned~*'^Starting the day at home$' then return 'Getting ready for the day at home'; end if;
  if cleaned~*'^Starting slowly at home while the city keeps moving$' then return 'Having a slow start at home'; end if;
  if cleaned~*'^Offline for the night$' then return 'Winding down'; end if;
  if cleaned~*'^Having some unstructured time(?: at home)?$' then return 'Enjoying some free time'; end if;
  if cleaned~*'^Winding down at home after a full .+ day$' then return 'Winding down at home'; end if;
  if cleaned~*'^Winding down behind a closed privacy layer$' then return 'Winding down at home'; end if;
  if cleaned~*'^Resetting at home with the privacy layer closed$' then return 'Taking some quiet time at home'; end if;
  if cleaned~*'^Checking tomorrow and closing the privacy layer$' then return 'Checking tomorrow''s plans before winding down'; end if;
  if cleaned~*'^(Taking a private late morning|Having a slow private morning) at home$' then return 'Having a slow morning at home'; end if;
  if cleaned~*'^(Taking a private afternoon|Keeping the afternoon private) at home$' then return 'Having a quiet afternoon at home'; end if;
  if cleaned~*'^Starting the day privately at home$' then return 'Having a quiet start at home'; end if;
  if cleaned~*'^Taking a slow private start at home$' then return 'Having a slow start at home'; end if;
  if cleaned~*'^Keeping a private nocturnal rhythm after the rest of town has gone quiet$' then return 'Keeping late hours at home'; end if;
  if cleaned~*'^Focused on work$' then return 'Working'; end if;
  if cleaned~*'^In the middle of a project$' then return 'Working on a project'; end if;
  if cleaned~*'^Taking care of a few things$' then return 'Running a few errands'; end if;

  if cleaned~*'^Catching Friday''s live set with the overlapping music, media, and design crowd without rushing what comes next$' then return 'Taking it easy at Friday''s live set with friends from the local creative scene'; end if;
  if cleaned~*'^Catching Friday''s live set with the overlapping music, media, and design crowd while leaving room for the day to change naturally$' then return 'Dropping into Friday''s live set with friends from the local creative scene'; end if;
  if cleaned~*'^Catching Friday''s live set with the overlapping music, media, and design crowd$' then return 'Catching Friday''s live set with friends from the local creative scene'; end if;

  parts:=regexp_match(cleaned,'^Handling an errand around (.+)$','i');
  if parts is not null then return 'Running an errand near '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Friday evening around (.+)$','i');
  if parts is not null then return 'Spending Friday evening at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(?:Taking a )?Saturday around (.+)$','i');
  if parts is not null then return 'Spending Saturday at '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^Keeping Saturday open around (.+)$','i');
  if parts is not null then return 'Spending Saturday around '||initcap(replace(parts[1],'-',' '));end if;
  parts:=regexp_match(cleaned,'^(Breakfast|Lunch|Dinner)(.*)$','i');
  if parts is not null then return 'Having '||lower(parts[1])||parts[2];end if;
  parts:=regexp_match(cleaned,'^Drinks(.*)$','i');
  if parts is not null then return 'Having drinks'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Coffee(.*)$','i');
  if parts is not null then return 'Having coffee'||parts[1];end if;
  parts:=regexp_match(cleaned,'^Movie(.*)$','i');
  if parts is not null then return 'Watching a movie'||parts[1];end if;

  parts:=regexp_match(cleaned,'^Working as (.+)$','i');
  if parts is not null and parts[1]!~*'^(a|an|the)([[:space:]]|$)' then
    role_name:=parts[1];
    if role_name~*'^dj and sound designer$' then return 'Working as a DJ and sound designer';end if;
    if role_name~*'^quiet orbit proprietor$' then return 'Running Quiet Orbit';end if;
    if role_name~*'^wayfarer hotel manager$' then return 'Managing the Wayfarer Hotel';end if;
    if role_name~*'^solace administrator$' then return 'Working as a Solace administrator';end if;
    return 'Working as '||case when role_name~*'^[aeiou]' then 'an ' else 'a ' end||role_name;
  end if;
  return upper(left(cleaned,1))||substr(cleaned,2);
end;
$$;

create or replace function public.kivelle_polish_schedule_language_batch(p_bucket integer)
returns void
language sql
set search_path=''
as $$
  update public.together_schedule_templates schedule
  set activity=public.kivelle_naturalize_character_activity(schedule.activity,coalesce(schedule.metadata->>'activityKey',schedule.activity),template.occupation),
      metadata=public.kivelle_naturalize_activity_metadata(schedule.metadata,coalesce(schedule.metadata->>'activityKey',schedule.activity),template.occupation)
  from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id
  where version.id=schedule.character_version_id
    and mod(hashtext(schedule.id::text)::bigint+2147483648,32)=p_bucket;
$$;

select public.kivelle_polish_schedule_language_batch(0);
select public.kivelle_polish_schedule_language_batch(1);
select public.kivelle_polish_schedule_language_batch(2);
select public.kivelle_polish_schedule_language_batch(3);
select public.kivelle_polish_schedule_language_batch(4);
select public.kivelle_polish_schedule_language_batch(5);
select public.kivelle_polish_schedule_language_batch(6);
select public.kivelle_polish_schedule_language_batch(7);
select public.kivelle_polish_schedule_language_batch(8);
select public.kivelle_polish_schedule_language_batch(9);
select public.kivelle_polish_schedule_language_batch(10);
select public.kivelle_polish_schedule_language_batch(11);
select public.kivelle_polish_schedule_language_batch(12);
select public.kivelle_polish_schedule_language_batch(13);
select public.kivelle_polish_schedule_language_batch(14);
select public.kivelle_polish_schedule_language_batch(15);
select public.kivelle_polish_schedule_language_batch(16);
select public.kivelle_polish_schedule_language_batch(17);
select public.kivelle_polish_schedule_language_batch(18);
select public.kivelle_polish_schedule_language_batch(19);
select public.kivelle_polish_schedule_language_batch(20);
select public.kivelle_polish_schedule_language_batch(21);
select public.kivelle_polish_schedule_language_batch(22);
select public.kivelle_polish_schedule_language_batch(23);
select public.kivelle_polish_schedule_language_batch(24);
select public.kivelle_polish_schedule_language_batch(25);
select public.kivelle_polish_schedule_language_batch(26);
select public.kivelle_polish_schedule_language_batch(27);
select public.kivelle_polish_schedule_language_batch(28);
select public.kivelle_polish_schedule_language_batch(29);
select public.kivelle_polish_schedule_language_batch(30);
select public.kivelle_polish_schedule_language_batch(31);

drop function public.kivelle_polish_schedule_language_batch(integer);

update public.together_character_activity_templates activity
set title=public.kivelle_naturalize_character_activity(activity.title,activity.activity_key,template.occupation),
    metadata=public.kivelle_naturalize_activity_metadata(activity.metadata,activity.activity_key,template.occupation),updated_at=now()
from public.together_character_versions version join public.together_character_templates template on template.id=version.character_template_id
where version.id=activity.character_version_id;

update public.together_character_schedule_events schedule
set title=public.kivelle_naturalize_character_activity(schedule.title,schedule.activity_key,template.occupation),
    metadata=public.kivelle_naturalize_activity_metadata(schedule.metadata,schedule.activity_key,template.occupation),updated_at=now()
from public.together_character_instances instance join public.together_character_templates template on template.id=instance.character_template_id
where instance.id=schedule.character_instance_id and schedule.source in('recurring','generated','override');

update public.together_character_instances instance
set current_activity=public.kivelle_naturalize_character_activity(instance.current_activity,null,template.occupation),
    life_engine_version='life_engine_v4_natural_language',updated_at=now()
from public.together_character_templates template where template.id=instance.character_template_id;

update public.together_life_events
set title=public.kivelle_naturalize_character_activity(title,metadata->>'activityKey',null),
    narrative_summary=public.kivelle_naturalize_character_event_summary(narrative_summary)
where event_type in('schedule_presence','schedule_outcome') or metadata->>'source'='character_schedule';

update public.together_event_templates
set narrative_summary='A new album turned a routine errand into a great find.',updated_at=now()
where name='New album listen' and narrative_summary='A new album made an ordinary errand feel like a find.';

comment on function public.kivelle_naturalize_character_activity(text,text,text) is 'Converts mechanical schedule scaffolding into concise, grammatical character activity while preserving authored detail.';
