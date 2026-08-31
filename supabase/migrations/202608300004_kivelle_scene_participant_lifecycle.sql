begin;

-- A scene session and its participant witness windows are one lifecycle. Several
-- older exit paths only ended the session, leaving a participant with left_at
-- null. The one-active-scene index then correctly prevented that character from
-- joining again, but the stale row could never repair itself.
create or replace function public.kivelle_close_ended_scene_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ended_at is null and new.ended_at is not null then
    update public.together_scene_participants
    set left_at = new.ended_at,
        witnessed_to_sequence = coalesce(
          witnessed_to_sequence,
          greatest(
            witnessed_from_sequence,
            case
              when jsonb_typeof(new.state -> 'sequence') = 'number'
                then (new.state ->> 'sequence')::bigint
              else witnessed_from_sequence
            end
          )
        ),
        updated_at = new.ended_at
    where scene_session_id = new.id
      and left_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists together_scene_sessions_close_participants
  on public.together_scene_sessions;
create trigger together_scene_sessions_close_participants
after update of ended_at on public.together_scene_sessions
for each row
execute function public.kivelle_close_ended_scene_participants();

-- Repair rows produced before the lifecycle trigger existed. Use the canonical
-- session end time so the historical witness interval remains truthful.
update public.together_scene_participants participant
set left_at = scene.ended_at,
    witnessed_to_sequence = coalesce(
      participant.witnessed_to_sequence,
      greatest(
        participant.witnessed_from_sequence,
        case
          when jsonb_typeof(scene.state -> 'sequence') = 'number'
            then (scene.state ->> 'sequence')::bigint
          else participant.witnessed_from_sequence
        end
      )
    ),
    updated_at = scene.ended_at
from public.together_scene_sessions scene
where scene.id = participant.scene_session_id
  and scene.ended_at is not null
  and participant.left_at is null;

comment on function public.kivelle_close_ended_scene_participants() is
  'Closes every active participant witness window when its canonical scene session ends.';

commit;
