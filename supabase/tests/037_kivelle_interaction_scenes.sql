begin;
select plan(17);

select has_table('public','together_scene_sessions','Shared interaction scenes persist separately from passive presence');
select has_table('public','together_scene_actions','Completed interaction actions have their own idempotent log');
select has_column('public','together_scene_sessions','continuity_id','Scenes are isolated to a Kivelle Life');
select has_column('public','together_scene_sessions','character_instance_id','Scenes belong to one companion relationship');
select has_column('public','together_scene_sessions','world_id','Scenes retain their world');
select has_column('public','together_scene_sessions','location_id','Scenes retain their exact location');
select has_column('public','together_scene_sessions','state','Scene focus and recent actions persist as state');
select has_column('public','together_scene_sessions','expected_end_at','Scenes have a validity boundary');
select has_column('public','together_scene_actions','request_id','Actions accept a client idempotency key');
select has_column('public','together_scene_actions','interaction_key','Actions record the canonical interaction key');
select has_column('public','together_scene_actions','result','Actions retain canonical results');
select ok((select relrowsecurity from pg_class where oid='public.together_scene_sessions'::regclass),'Scene sessions use RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_scene_actions'::regclass),'Scene actions use RLS');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='together_scene_sessions_one_active_character_idx'),'Only one active scene can exist per companion relationship');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='together_scene_sessions_expected_end_idx'),'Scene expiry can be resolved efficiently');
select trigger_is('public','together_scene_sessions','together_scene_sessions_validate_context','public','kivelle_validate_scene_session_context','Scene locations and conversations must match the scene Life');
select trigger_is('public','together_scene_actions','together_scene_actions_validate_context','public','kivelle_validate_scene_action_context','Scene actions must match their scene ownership');

select * from finish();
rollback;

