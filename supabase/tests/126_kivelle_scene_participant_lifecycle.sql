begin;
select plan(3);

select has_function(
  'public',
  'kivelle_close_ended_scene_participants',
  'Scene participant lifecycle close-out function exists'
);

select has_trigger(
  'public',
  'together_scene_sessions',
  'together_scene_sessions_close_participants',
  'Ending a scene automatically closes its participant rows'
);

select is(
  (
    select count(*)::integer
    from public.together_scene_participants participant
    join public.together_scene_sessions scene on scene.id = participant.scene_session_id
    where scene.ended_at is not null
      and participant.left_at is null
  ),
  0,
  'No ended scene retains an active participant witness window'
);

select * from finish();
rollback;
