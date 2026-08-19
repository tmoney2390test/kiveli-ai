begin;

-- A completed life event must not leave Brooke permanently materialized at its
-- old venue. Reset only stale event-owned rows with no live plan, schedule, or
-- authoritative life event; the next Life Engine pass resolves today's canon.
update public.together_character_instances instance
set current_location_id=world_presence.home_location_id,
    current_activity='Having some unstructured time at home',
    current_presence_source='fallback',
    current_schedule_event_id=null,
    current_interruptibility='open',
    updated_at=now()
from public.together_character_world_presence world_presence
where instance.character_version_id='13000000-0000-4000-8000-000000000123'::uuid
  and world_presence.character_version_id=instance.character_version_id
  and world_presence.presence_type<>'unavailable'
  and world_presence.home_location_id is not null
  and instance.current_presence_source='life_event'
  and not exists(
    select 1 from public.together_life_events event
    where event.user_id=instance.user_id and event.character_instance_id=instance.id
      and event.starts_at<=now() and event.ends_at>now()
      and coalesce(event.metadata->>'establishesPresence','false')='true'
  )
  and not exists(
    select 1 from public.together_character_schedule_events schedule
    where schedule.user_id=instance.user_id and schedule.character_instance_id=instance.id
      and schedule.starts_at<=now() and schedule.ends_at>now()
  )
  and not exists(
    select 1 from public.together_shared_plans plan
    where plan.user_id=instance.user_id and plan.character_instance_id=instance.id
      and plan.status in('scheduled','active') and plan.starts_at<=now() and plan.ends_at>now()
  );

commit;
