-- Include rotation week in schedule identity; legacy rows remain Week 1.
alter table public.together_schedule_templates add column if not exists week_index smallint
  generated always as (coalesce((metadata->>'weekIndex')::smallint,0)) stored;
do $constraints$
declare item record;
begin
  for item in select conname from pg_constraint where conrelid='public.together_schedule_templates'::regclass
    and contype='u' and pg_get_constraintdef(oid)='UNIQUE (character_version_id, day_of_week, start_minute)'
  loop execute format('alter table public.together_schedule_templates drop constraint %I',item.conname); end loop;
end;
$constraints$;
create unique index if not exists together_schedule_rotation_slot on public.together_schedule_templates(character_version_id,day_of_week,start_minute,week_index);
alter table public.together_schedule_templates add constraint together_schedule_rotation_week_range check(week_index between 0 and 2);

-- Patch the installed finalizer to preserve independently deployed behavior and privileges.
do $migration$
declare
  definition text := pg_get_functiondef('public.kivelle_finalize_creator_draft(uuid,uuid,uuid)'::regprocedure);
  old_text text;
  new_text text;
begin
  for old_text,new_text in select * from (values
    ($old$if block_count=0 then raise exception 'Generate a weekly routine before meeting this companion'; end if;$old$,
     $new$if block_count=0 or block_count>84 then raise exception 'Use 1–3 weeks with 1–28 blocks each'; end if;
  if exists(select 1 from jsonb_array_elements(routine->'blocks') block where coalesce(block->>'weekIndex','0') !~ '^[0-2]$') then raise exception 'Invalid rotation week'; end if;
  if exists(
    select 1 from generate_series(0,(select max(coalesce((block->>'weekIndex')::integer,0)) from jsonb_array_elements(routine->'blocks') block)) week_number
    where (select count(*) from jsonb_array_elements(routine->'blocks') block where coalesce((block->>'weekIndex')::integer,0)=week_number) not between 1 and 28
  ) then raise exception 'Each rotating week needs 1–28 blocks'; end if;$new$),
    ($old$and left_block.block->>'dayOfWeek'=right_block.block->>'dayOfWeek'$old$,
     $new$and left_block.block->>'dayOfWeek'=right_block.block->>'dayOfWeek'
     and coalesce(left_block.block->>'weekIndex','0')=coalesce(right_block.block->>'weekIndex','0')$new$),
    ($old$jsonb_build_object('source','creator_studio','creatorDraftId',draft.id)$old$,
     $new$jsonb_build_object('source','creator_studio','creatorDraftId',draft.id,'scheduleMode','authored','profileVisibility','known',
       'weekIndex',coalesce((block->>'weekIndex')::integer,0),
       'cycleWeeks',(select max(coalesce((cycle_block->>'weekIndex')::integer,0))+1 from jsonb_array_elements(routine->'blocks') cycle_block),
       'cycleAnchorDate',to_char(date_trunc('week',now_value at time zone coalesce((select profile.experience_timezone from public.together_profiles profile where profile.user_id=p_user_id),'UTC')),'YYYY-MM-DD'))$new$)
  ) patches(old_value,new_value)
  loop
    if position(old_text in definition)=0 then raise exception 'Creator finalizer changed; inspect before applying rotation'; end if;
    definition:=replace(definition,old_text,new_text);
  end loop;
  execute definition;
end;
$migration$;
