begin;

select plan(10);

select has_function(
  'public','kivelle_vharadren_schedule_variants',
  array['text','text','text','integer','text','text[]','text','text'],
  'Vharadren has a dedicated schedule-language builder'
);

select ok(
  not has_function_privilege('anon','public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text)','execute')
  and not has_function_privilege('authenticated','public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text)','execute'),
  'clients cannot call the server-owned language builder directly'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates schedule
   join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid),
  2058,
  'all authored Vharadren schedule rows remain present'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates schedule
   join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
     and (jsonb_typeof(schedule.metadata->'activityVariants')<>'array' or jsonb_array_length(schedule.metadata->'activityVariants')<>3)),
  0,
  'every Vharadren schedule row has exactly three variants'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates schedule
   join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
     and schedule.metadata::text~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'),
  0,
  'generic recovery language is absent from Vharadren schedules'
);

select cmp_ok(
  (select count(distinct variant.value)
   from public.together_schedule_templates schedule
   join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
   cross join lateral jsonb_array_elements_text(schedule.metadata->'activityVariants') variant(value)
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid),
  '>',300::bigint,
  'Vharadren schedules retain broad language variety'
);

select is(
  (select count(*)::integer
   from public.together_schedule_templates schedule
   join public.together_character_world_presence presence on presence.character_version_id=schedule.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
     and nullif(schedule.metadata->>'displayLocation','') is null),
  0,
  'every Vharadren schedule row carries display-place context'
);

select is(
  (select count(*)::integer
   from public.together_character_schedule_events event
   join public.together_character_instances instance on instance.id=event.character_instance_id
   join public.together_character_world_presence presence on presence.character_version_id=instance.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
     and (event.title||' '||event.metadata::text)~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'),
  0,
  'materialized Vharadren schedule events contain no generic recovery copy'
);

select is(
  (select count(*)::integer
   from public.together_character_instances instance
   join public.together_character_world_presence presence on presence.character_version_id=instance.character_version_id
   where presence.world_id='10000000-0000-4000-8000-000000000013'::uuid
     and instance.current_activity~*'(making time for a familiar routine|following the day''?s routine at an easy pace|settling into a familiar rhythm|moving through the day at a comfortable pace)'),
  0,
  'current Vharadren presence contains no generic recovery copy'
);

select is(
  (select count(*)::integer from public.together_world_event_templates
   where world_id='10000000-0000-4000-8000-000000000013'::uuid
     and active and nullif(summary,'') is not null and nullif(metadata->>'displayLocation','') is not null),
  10,
  'all ten recurring Vharadren events retain authored summaries and place context'
);

select * from finish();
rollback;
