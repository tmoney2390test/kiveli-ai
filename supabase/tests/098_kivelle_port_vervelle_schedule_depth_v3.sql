begin;
select plan(15);

select is((select count(*)::integer from public.together_schedule_templates where metadata->>'source'='port_vervelle_authored_schedule_v3'),1764,'All 42 Port Vervelle residents have six blocks for seven days');

select is((select count(*)::integer from(
  select character_version_id,day_of_week from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
  group by character_version_id,day_of_week having count(*)=6 and min(start_minute)=0 and max(end_minute)=1440
) days),294,'Every Port Vervelle resident-day is complete');

select ok(not exists(
  select 1 from public.together_schedule_templates first
  join public.together_schedule_templates second
    on second.character_version_id=first.character_version_id and second.day_of_week=first.day_of_week and second.id>first.id
   and second.start_minute<first.end_minute and first.start_minute<second.end_minute
  where first.metadata->>'source'='port_vervelle_authored_schedule_v3' and second.metadata->>'source'='port_vervelle_authored_schedule_v3'
),'No Port Vervelle schedule overlaps itself');

select ok(not exists(
  select 1 from public.together_schedule_templates schedule
  left join public.together_locations location on location.id=schedule.location_id
  where schedule.metadata->>'source'='port_vervelle_authored_schedule_v3'
    and((schedule.location_id is not null and location.world_id<>'10000000-0000-4000-8000-000000000008')
      or(schedule.location_id is null and schedule.metadata->>'activityKey'<>'sleep' and schedule.metadata->>'routineKind' not in('home_morning','home_evening','prep_work')))
),'Every public routine resolves to a real Port Vervelle place');

select ok(not exists(
  select 1 from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
    and jsonb_array_length(coalesce(metadata->'activityVariants','[]'::jsonb))<3
),'Every block has at least three natural presentation variants');

select ok(not exists(
  select 1 from public.together_character_versions version
  join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.world_id='10000000-0000-4000-8000-000000000008'
  where presence.presence_type='resident' and version.life_config->'scheduling'->>'scheduleProfile'<>'port_vervelle_rich_weekly_v3'
),'All 42 residents advertise the unified rich schedule profile');

select ok((select count(distinct character_version_id)>=35 from public.together_schedule_templates where metadata->>'source'='port_vervelle_authored_schedule_v3' and metadata ? 'communityAnchor'),'At least 35 residents have a recurring community overlap');

select ok((select count(distinct activity)>=170 from public.together_schedule_templates where metadata->>'source'='port_vervelle_authored_schedule_v3'),'Port Vervelle exposes substantial character-specific routine variety');

select ok(not exists(
  select 1 from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
    and activity~*'somewhere nearby|focused on work|taking care of a few things|taking a personal interest'
),'Generic schedule filler is absent');

select ok((select count(*)>=80 from public.together_schedule_templates where metadata->>'source'='port_vervelle_authored_schedule_v3' and metadata ? 'weatherContingency'),'Outdoor routines carry coastal-weather contingencies');

select ok(not exists(
  select version.id from public.together_character_versions version
  join public.together_character_world_presence presence on presence.character_version_id=version.id and presence.world_id='10000000-0000-4000-8000-000000000008'
  cross join(values('Friday variation'),('Saturday variation'),('Sunday variation')) expected(label)
  where presence.presence_type='resident' and not exists(
    select 1 from public.together_schedule_templates schedule
    where schedule.character_version_id=version.id and schedule.metadata->>'dayVariant'=expected.label
  )
),'Every resident has explicit Friday, Saturday, and Sunday variation');

select ok(not exists(
  select 1 from public.together_schedule_templates
  where metadata->>'source'='port_vervelle_authored_schedule_v3'
    and coalesce(metadata->>'contextCue','')=''
),'Every routine preserves the no-implied-scene context boundary');

select is((select metadata->>'scheduleProfile' from public.together_worlds where slug='port-vervelle'),'port_vervelle_rich_weekly_v3','The world advertises the rich schedule pack');

select ok(not exists(
  select 1 from public.together_schedule_templates
  where character_version_id in(
    select character_version_id from public.together_character_world_presence where world_id='10000000-0000-4000-8000-000000000008' and presence_type='resident'
  ) and metadata->>'source'<>'port_vervelle_authored_schedule_v3'
),'No legacy Port Vervelle projection remains beside the canonical schedule');

select ok(not exists(
  select 1 from public.together_character_schedule_events event
  join public.together_character_instances instance on instance.id=event.character_instance_id
  join public.together_character_world_presence presence on presence.character_version_id=instance.character_version_id and presence.world_id='10000000-0000-4000-8000-000000000008'
  where event.source in('generated','recurring') and event.starts_at>=date_trunc('day',now())
),'Future generated projections are cleared for safe rematerialization');

select * from finish();
rollback;
