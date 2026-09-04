begin;

-- Later language-recovery migrations correctly removed mechanical schedule
-- prose, but a few recovery branches collapsed authored variation arrays to a
-- single entry. Keep presentation natural while restoring the three-variant
-- invariant used by the life engine.
create or replace function public.kivelle_clean_schedule_variant(
  p_value text,
  p_activity_key text default null,
  p_occupation text default null
) returns text
language plpgsql
immutable
set search_path=''
as $$
declare cleaned text:=public.kivelle_remove_schedule_cliche(coalesce(p_value,''));
begin
  if cleaned~*'^Checking the route and closing the apartment privacy layer$' then
    return 'Checking the route before heading out';
  end if;
  if cleaned~*'^Closing the privacy layer before heading out again$' then
    return 'Getting ready to head out again';
  end if;
  return public.kivelle_naturalize_character_activity(cleaned,p_activity_key,p_occupation);
end;
$$;

create or replace function public.kivelle_ensure_schedule_variants(
  p_variants jsonb,
  p_activity text,
  p_activity_key text,
  p_routine_kind text,
  p_occupation text default null
) returns jsonb
language sql
immutable
set search_path=''
as $$
  with candidates(value,priority) as(
    select item.value,item.ordinality::integer
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_variants)='array' then p_variants else '[]'::jsonb end
    ) with ordinality item(value,ordinality)
    union all
    select coalesce(nullif(trim(p_activity),''),'Enjoying some free time'),100
    union all
    select case
      when coalesce(p_activity_key,'')~*'sleep' then 'Getting some uninterrupted rest at home'
      when coalesce(p_routine_kind,'')~*'home' then 'Taking it easy at home'
      when coalesce(p_activity_key,'')~*'(work|occupation|job|shift)' or coalesce(p_routine_kind,'')~*'work' then 'Staying focused on today''s work'
      else 'Making time for a familiar routine'
    end,101
    union all
    select case
      when coalesce(p_activity_key,'')~*'sleep' then 'Keeping things quiet and getting some sleep'
      when coalesce(p_routine_kind,'')~*'home' then 'Spending some quiet time at home'
      when coalesce(p_activity_key,'')~*'(work|occupation|job|shift)' or coalesce(p_routine_kind,'')~*'work' then 'Taking care of the day''s responsibilities'
      else 'Following the day''s routine at an easy pace'
    end,102
    union all
    select 'Settling into a familiar rhythm',103
    union all
    select 'Moving through the day at a comfortable pace',104
  ), cleaned as(
    select public.kivelle_clean_schedule_variant(value,p_activity_key,p_occupation) value,priority
    from candidates
  ), deduplicated as(
    select value,min(priority) priority
    from cleaned
    where nullif(trim(value),'') is not null
    group by value
  ), selected as(
    select value,priority
    from deduplicated
    order by priority,value
    limit 3
  )
  select coalesce(jsonb_agg(to_jsonb(value) order by priority,value),'[]'::jsonb)
  from selected
$$;

create or replace function public.kivelle_normalize_schedule_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=new.character_version_id;
  new.activity:=public.kivelle_clean_schedule_variant(
    new.activity,
    coalesce(new.metadata->>'activityKey',new.activity),
    occupation_title
  );
  new.metadata:=public.kivelle_naturalize_activity_metadata(
    public.kivelle_remove_schedule_cliche_metadata(new.metadata),
    coalesce(new.metadata->>'activityKey',new.activity),
    occupation_title
  );
  new.metadata:=jsonb_set(
    new.metadata,
    '{activityVariants}',
    public.kivelle_ensure_schedule_variants(
      new.metadata->'activityVariants',new.activity,new.metadata->>'activityKey',new.metadata->>'routineKind',occupation_title
    ),
    true
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
  new.title:=public.kivelle_clean_schedule_variant(new.title,new.activity_key,occupation_title);
  new.metadata:=public.kivelle_naturalize_activity_metadata(public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key,occupation_title);
  new.metadata:=jsonb_set(
    new.metadata,
    '{activityVariants}',
    public.kivelle_ensure_schedule_variants(new.metadata->'activityVariants',new.title,new.activity_key,new.metadata->>'routineKind',occupation_title),
    true
  );
  return new;
end;
$$;

create or replace function public.kivelle_normalize_materialized_schedule_language()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.source in('recurring','generated','override') then
    new.title:=public.kivelle_clean_schedule_variant(new.title,new.activity_key,null);
    new.metadata:=public.kivelle_naturalize_activity_metadata(public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key);
    new.metadata:=jsonb_set(
      new.metadata,
      '{activityVariants}',
      public.kivelle_ensure_schedule_variants(new.metadata->'activityVariants',new.title,new.activity_key,new.metadata->>'routineKind',null),
      true
    );
  end if;
  return new;
end;
$$;

update public.together_schedule_templates schedule
set activity=public.kivelle_clean_schedule_variant(schedule.activity,coalesce(schedule.metadata->>'activityKey',schedule.activity),template.occupation),
    metadata=jsonb_set(
      public.kivelle_remove_schedule_cliche_metadata(schedule.metadata),
      '{activityVariants}',
      public.kivelle_ensure_schedule_variants(
        schedule.metadata->'activityVariants',schedule.activity,schedule.metadata->>'activityKey',schedule.metadata->>'routineKind',template.occupation
      ),
      true
    )
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
where version.id=schedule.character_version_id
  and(
    (jsonb_typeof(schedule.metadata->'activityVariants')='array' and jsonb_array_length(schedule.metadata->'activityVariants')<3)
    or schedule.metadata::text~*'(privacy layer|making private time|picking up a few practical things|overlapping music, media, and design crowd)'
  );

update public.together_character_activity_templates activity
set title=public.kivelle_clean_schedule_variant(activity.title,activity.activity_key,template.occupation),
    metadata=jsonb_set(
      public.kivelle_remove_schedule_cliche_metadata(activity.metadata),
      '{activityVariants}',
      public.kivelle_ensure_schedule_variants(
        activity.metadata->'activityVariants',activity.title,activity.activity_key,activity.metadata->>'routineKind',template.occupation
      ),
      true
    ),
    updated_at=now()
from public.together_character_versions version
join public.together_character_templates template on template.id=version.character_template_id
where version.id=activity.character_version_id
  and(
    (jsonb_typeof(activity.metadata->'activityVariants')='array' and jsonb_array_length(activity.metadata->'activityVariants')<3)
    or activity.metadata::text~*'(privacy layer|making private time|picking up a few practical things|overlapping music, media, and design crowd)'
  );

comment on function public.kivelle_ensure_schedule_variants(jsonb,text,text,text,text) is
  'Preserves authored schedule variants, removes generator scaffolding, and supplies three natural deterministic fallbacks when a recovery path produced fewer.';

commit;
