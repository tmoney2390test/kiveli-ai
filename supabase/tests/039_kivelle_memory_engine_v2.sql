begin;
select plan(20);

select has_column('public','together_memories','last_retrieved_at','Memory context retrieval is tracked separately');
select has_column('public','together_memories','last_mentioned_at','Explicit memory callbacks are tracked separately');
select has_column('public','together_memories','retrieval_count','Memory retrieval has durable diagnostics');
select has_column('public','together_memories','mention_count','Memory mentions have durable diagnostics');
select has_column('public','together_memories','supersedes_memory_id','Memory corrections retain temporal lineage');
select has_column('public','together_memories','valid_from','Current fact start is temporal');
select has_column('public','together_memories','valid_to','Superseded fact end is temporal');
select has_column('public','together_memories','episode_id','Episode-backed memories remain linked to their shared experience');
select has_column('public','together_memories','shareability','Social memory provenance is explicit');
select has_table('public','together_scene_episodes','Scene actions consolidate into one durable experience');
select col_is_pk('public','together_scene_episodes','id','Scene episode has a primary key');
select col_is_unique('public','together_scene_episodes','scene_session_id','A scene can create at most one episode');
select has_column('public','together_scene_episodes','action_ids','Episode preserves canonical action evidence');
select has_column('public','together_scene_episodes','significance','Episode promotion uses deterministic significance');
select ok((select relrowsecurity from pg_class where oid='public.together_scene_episodes'::regclass),'Scene episodes use RLS');
select has_table('public','together_companion_user_patterns','Repeated behavior is stored separately from facts');
select has_column('public','together_companion_user_patterns','supporting_source_ids','Patterns retain their evidence IDs');
select has_table('public','together_emotional_residue','Short-lived emotional continuity has its own state');
select col_is_unique('public','together_emotional_residue','character_instance_id','Only one active residue record exists per companion');
select has_function('public','kivelle_touch_memories',array['uuid','uuid[]','text','timestamp with time zone'],'Memory timestamps and counters update atomically');

select * from finish();
rollback;
