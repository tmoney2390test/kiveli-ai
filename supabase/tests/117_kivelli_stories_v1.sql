begin;
select plan(14);

select has_table('public','together_story_definitions','story definitions exist');
select has_table('public','together_story_campaigns','story campaigns exist');
select has_table('public','together_story_actions','story actions exist');
select has_table('public','together_story_messages','story messages exist');
select has_table('public','together_story_discoveries','story discoveries exist');
select has_column('public','together_story_campaigns','current_loop','campaign loop persists');
select has_column('public','together_story_campaigns','current_time_minute','campaign clock persists');
select has_column('public','together_story_campaigns','evidence_ids','campaign evidence persists');
select has_column('public','together_story_campaigns','character_state','story social state is namespaced');
select has_column('public','together_story_campaigns','loop_history','loop recaps persist');
select has_column('public','together_story_campaigns','version','campaign actions use optimistic versions');
select is((select count(*)::integer from public.together_story_definitions where status='playable'),1,'one playable story is seeded');
select is((select count(*)::integer from public.together_story_definitions where status='coming_soon'),3,'three future stories are seeded');
select function_privs_are('public','apply_together_story_action',array['uuid','uuid','integer','text','text','jsonb','text','integer','integer','text','text[]','text[]','text[]','text[]','text[]','text[]','text[]','text[]','jsonb','jsonb','text[]','text','text','text','text','jsonb','jsonb'],'service_role',array['EXECUTE'],'story mutation RPC is server-only');

select * from finish();
rollback;
