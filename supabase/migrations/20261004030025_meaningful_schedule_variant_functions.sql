-- Do not pad a specific routine with generic prose just to reach three variants.
-- The day renderer accepts one or more alternatives; authored alternatives stay intact.
begin;

create or replace function public.kivelle_schedule_variant_is_filler(p_value text)
returns boolean language sql immutable set search_path='' as $$
  select trim(coalesce(p_value,'')) ~* '^(making time for a familiar routine|following the day''s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)[.!]?$';
$$;
revoke all on function public.kivelle_schedule_variant_is_filler(text) from public, anon, authenticated;

create or replace function public.kivelle_clean_schedule_variant(
  p_value text, p_activity_key text default null, p_occupation text default null
) returns text language plpgsql immutable set search_path='' as $$
declare cleaned text:=public.kivelle_remove_schedule_cliche(coalesce(p_value,''));
begin
  cleaned:=trim(regexp_replace(cleaned,'\s+while leaving room for the day to change naturally[.!]?$','','i'));
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
  p_variants jsonb, p_activity text, p_activity_key text,
  p_routine_kind text, p_occupation text default null
) returns jsonb language sql immutable set search_path='' as $$
  with candidates(value,priority) as (
    select item.value,item.ordinality::integer
    from jsonb_array_elements_text(case when jsonb_typeof(p_variants)='array' then p_variants else '[]'::jsonb end)
      with ordinality item(value,ordinality)
    union all
    select p_activity,100
  ), cleaned as (
    select public.kivelle_clean_schedule_variant(value,p_activity_key,p_occupation) value,priority
    from candidates
    where nullif(trim(value),'') is not null
      and not public.kivelle_schedule_variant_is_filler(value)
  ), deduplicated as (
    select value,min(priority) priority
    from cleaned
    where nullif(trim(value),'') is not null
      and not public.kivelle_schedule_variant_is_filler(value)
    group by value
  ), selected as (
    select value,priority from deduplicated order by priority,value limit 3
  )
  select coalesce(
    (select jsonb_agg(to_jsonb(value) order by priority,value) from selected),
    jsonb_build_array(case
      when coalesce(p_activity_key,'')~*'sleep' then 'Sleeping at home'
      when coalesce(p_activity_key,'')~*'travel' then 'Travelling between places'
      when coalesce(p_activity_key,'')~*'(work|occupation|job|shift)' or coalesce(p_routine_kind,'')~*'work' then 'Working'
      when coalesce(p_routine_kind,'')~*'home' then 'Spending time at home'
      else 'Taking a break'
    end)
  );
$$;

comment on function public.kivelle_ensure_schedule_variants(jsonb,text,text,text,text) is
  'Keeps up to three specific authored alternatives; never fills missing slots with generic routine copy.';

create or replace function public.kivelle_normalize_schedule_template_language()
returns trigger language plpgsql set search_path='' as $$
declare occupation_title text;
begin
  select template.occupation into occupation_title
  from public.together_character_versions version
  join public.together_character_templates template on template.id=version.character_template_id
  where version.id=new.character_version_id;
  new.activity:=public.kivelle_clean_schedule_variant(new.activity,coalesce(new.metadata->>'activityKey',new.activity),occupation_title);
  new.metadata:=public.kivelle_naturalize_activity_metadata(
    public.kivelle_remove_schedule_cliche_metadata(new.metadata),
    coalesce(new.metadata->>'activityKey',new.activity),occupation_title
  );
  new.metadata:=jsonb_set(new.metadata,'{activityVariants}',
    public.kivelle_ensure_schedule_variants(new.metadata->'activityVariants',new.activity,
      new.metadata->>'activityKey',new.metadata->>'routineKind',occupation_title),true);
  if public.kivelle_schedule_variant_is_filler(new.activity) then
    new.activity:=new.metadata->'activityVariants'->>0;
  end if;
  if new.metadata ? 'activityLabel' then
    new.metadata:=jsonb_set(new.metadata,'{activityLabel}',to_jsonb(
      case when public.kivelle_schedule_variant_is_filler(new.metadata->>'activityLabel')
        then new.metadata->'activityVariants'->>0
        else public.kivelle_clean_schedule_variant(new.metadata->>'activityLabel',new.metadata->>'activityKey',occupation_title)
      end),true);
  end if;
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
  new.metadata:=public.kivelle_naturalize_activity_metadata(
    public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key,occupation_title);
  new.metadata:=jsonb_set(new.metadata,'{activityVariants}',
    public.kivelle_ensure_schedule_variants(new.metadata->'activityVariants',new.title,new.activity_key,
      new.metadata->>'routineKind',occupation_title),true);
  if public.kivelle_schedule_variant_is_filler(new.title) then new.title:=new.metadata->'activityVariants'->>0; end if;
  if new.metadata ? 'activityLabel' and public.kivelle_schedule_variant_is_filler(new.metadata->>'activityLabel') then
    new.metadata:=jsonb_set(new.metadata,'{activityLabel}',to_jsonb(new.title),true);
  end if;
  return new;
end;
$$;

create or replace function public.kivelle_normalize_materialized_schedule_language()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.source in('recurring','generated','override') then
    new.title:=public.kivelle_clean_schedule_variant(new.title,new.activity_key,null);
    new.metadata:=public.kivelle_naturalize_activity_metadata(
      public.kivelle_remove_schedule_cliche_metadata(new.metadata),new.activity_key);
    new.metadata:=jsonb_set(new.metadata,'{activityVariants}',
      public.kivelle_ensure_schedule_variants(new.metadata->'activityVariants',new.title,new.activity_key,
        new.metadata->>'routineKind',null),true);
    if public.kivelle_schedule_variant_is_filler(new.title) then
      new.title:=new.metadata->'activityVariants'->>0;
    end if;
    if new.metadata ? 'activityLabel' then
      new.metadata:=jsonb_set(new.metadata,'{activityLabel}',to_jsonb(
        case when public.kivelle_schedule_variant_is_filler(new.metadata->>'activityLabel')
          then new.title
          else public.kivelle_clean_schedule_variant(new.metadata->>'activityLabel',new.activity_key,null)
        end),true);
    end if;
  end if;
  return new;
end;
$$;

commit;
