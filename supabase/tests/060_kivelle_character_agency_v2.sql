begin;
select plan(14);

select has_column('public','together_scene_actions','initiated_by','Scene actions retain who initiated them');
select has_column('public','together_scene_actions','decision_status','Scene actions retain the autonomy decision');
select has_column('public','together_scene_actions','requested_interaction_key','The requested interaction remains historical truth');
select has_column('public','together_scene_actions','resolved_interaction_key','The accepted or countered interaction is explicit');
select has_column('public','together_scene_actions','parent_action_id','Counteroffers can resolve through a child action');
select has_column('public','together_scene_actions','decision_reason_codes','Decisions retain deterministic reason codes');
select has_column('public','together_scene_actions','expires_at','Character proposals expire');
select ok(to_regclass('public.together_scene_actions_pending_proposal_idx') is not null,'Pending proposals have an active-scene index');

select has_table('public','together_character_social_states','Learned character-to-character dynamics have canonical state');
select col_is_pk('public','together_character_social_states','id','Character social state has a primary key');
select has_column('public','together_character_social_states','affinity','Social affinity is distinct from the user relationship');
select has_column('public','together_character_social_states','tension','Social tension can shape shared scenes');
select ok((select relrowsecurity from pg_class where oid='public.together_character_social_states'::regclass),'Character social state uses RLS');
select trigger_is('public','together_character_social_states','together_character_social_states_validate','public','kivelle_validate_character_social_state','Social state cannot cross users or Lives');

select * from finish();
rollback;
