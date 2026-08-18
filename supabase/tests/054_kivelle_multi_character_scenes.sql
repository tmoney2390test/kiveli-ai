begin;
select plan(10);

select has_table('public','together_scene_participants','shared scenes have canonical participants');
select has_table('public','together_scene_messages','shared scenes have speaker attribution');
select has_column('public','together_messages','speaker_character_instance_id','messages identify character speakers');
select has_column('public','together_messages','scene_sequence','messages sequence within a scene');
select has_column('public','together_scene_participants','witnessed_from_sequence','participant witness start is recorded');
select has_column('public','together_scene_participants','witnessed_to_sequence','participant witness end is recorded');
select has_column('public','together_scene_messages','witnessed_by_instance_ids','message witnesses are explicit');
select has_column('public','together_knowledge_transfers','scene_session_id','knowledge transfer can originate from a shared scene');
select policies_are('public','together_scene_participants',array['together_scene_participants_own_read'],'scene participants are privately readable');
select policies_are('public','together_scene_messages',array['together_scene_messages_own_read'],'scene messages are privately readable');

select * from finish();
rollback;
