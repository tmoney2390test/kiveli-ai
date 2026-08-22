-- Retrying or re-opening a plan must not add duplicate chat lifecycle cards.
with duplicate_join_events as (
  select id,
    row_number() over (partition by entity_id, event_type order by created_at asc, id asc) as occurrence
  from public.together_conversation_events
  where entity_type = 'shared_plan'
    and event_type = 'plan_joined'
)
delete from public.together_conversation_events event
using duplicate_join_events duplicate
where event.id = duplicate.id
  and duplicate.occurrence > 1;

create unique index if not exists together_conversation_events_shared_plan_join_idx
  on public.together_conversation_events(entity_id, event_type)
  where entity_type = 'shared_plan'
    and event_type = 'plan_joined';
