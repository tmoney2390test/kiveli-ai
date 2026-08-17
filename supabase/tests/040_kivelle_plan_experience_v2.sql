begin;
select plan(18);

select has_column('public','together_scene_sessions','shared_plan_id','Plan scenes retain their canonical SharedPlan binding');
select has_column('public','together_shared_plans','participation_level','Plan outcome quality is persisted separately from attendance');
select has_column('public','together_shared_plans','finalized_at','Plan finalization is idempotent');
select has_column('public','together_shared_plans','scene_episode_id','Plans can point to their canonical episode');
select has_column('public','together_scene_episodes','shared_plan_id','Episodes retain the plan that produced them');
select has_column('public','together_scene_episodes','starting_location_id','Episodes retain their starting location');
select has_column('public','together_scene_episodes','ending_location_id','Episodes retain their ending location');
select has_column('public','together_scene_episodes','attended_seconds','Episodes retain actual attendance duration');
select has_column('public','together_scene_episodes','meaningful_action_count','Episodes retain meaningful participation');
select has_table('public','together_plan_attendance_segments','Re-entry is represented by attendance segments');
select ok(to_regclass('public.together_scene_sessions_shared_plan_idx') is not null,'Plan scenes have a binding index');
select ok(to_regclass('public.together_scene_sessions_one_active_plan_idx') is not null,'Only one active scene can represent a plan');
select ok(to_regprocedure('public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text)') is not null,'Plan join has a transactional server seam');
select trigger_is('public','together_scene_sessions','together_scene_sessions_validate_plan_context','public','kivelle_validate_scene_plan_context','Plan and scene identity is validated at the database boundary');
select ok(to_regprocedure('public.kivelle_progress_shared_plans(uuid,uuid,timestamptz)') is not null,'Existing commitment progression remains installed');
select ok(exists(select 1 from pg_indexes where indexname='together_plan_attendance_segments_request_idx'),'Join retries have an attendance request index');
select ok(exists(select 1 from pg_indexes where indexname='together_scene_episodes_shared_plan_idx'),'Plan episodes are unique per SharedPlan');
select ok((select relrowsecurity from pg_class where oid='public.together_plan_attendance_segments'::regclass),'Attendance segments use RLS');

select * from finish();
rollback;
