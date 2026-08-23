begin;
select plan(29);

select has_table('public','together_world_facts','canonical world facts have normalized storage');
select has_table('public','together_dialogue_opportunities','dialogue opportunities have normalized storage');
select has_table('public','together_scene_interaction_beats','scene interaction beats have normalized storage');
select col_is_fk('public','together_world_facts','world_id','world facts reference their world');
select col_is_fk('public','together_dialogue_opportunities','world_id','dialogue opportunities reference their world');
select col_is_fk('public','together_scene_interaction_beats','world_id','scene beats reference their world');
select has_index('public','together_world_facts','together_world_facts_topic_tags_idx','world fact topics use a GIN index');
select has_index('public','together_world_facts','together_world_facts_trigger_terms_idx','world fact triggers use a GIN index');
select has_index('public','together_dialogue_opportunities','together_dialogue_opportunities_trigger_terms_idx','dialogue triggers use a GIN index');
select has_index('public','together_scene_interaction_beats','together_scene_interaction_beats_activity_tags_idx','scene activities use a GIN index');
select has_column('public','together_content_usage','conversation_turn','authored content usage records the selected turn');
select has_index('public','together_content_usage','together_content_usage_authored_turn_uidx','authored selection is idempotent per turn');

select policies_are('public','together_world_facts',array[]::text[],'world facts have no client-readable policy');
select policies_are('public','together_dialogue_opportunities',array[]::text[],'dialogue opportunities have no client-readable policy');
select policies_are('public','together_scene_interaction_beats',array[]::text[],'scene beats have no client-readable policy');
select ok(not has_table_privilege('authenticated','public.together_world_facts','SELECT'),'authenticated clients cannot enumerate world facts');
select ok(not has_table_privilege('authenticated','public.together_dialogue_opportunities','SELECT'),'authenticated clients cannot enumerate dialogue opportunities');
select ok(not has_table_privilege('authenticated','public.together_scene_interaction_beats','SELECT'),'authenticated clients cannot enumerate scene beats');
select ok(not has_function_privilege('authenticated','public.kivelle_world_fact_candidates(uuid,uuid,uuid,text[],text[],integer)','EXECUTE'),'clients cannot call world-fact retrieval');
select ok(not has_function_privilege('authenticated','public.kivelle_dialogue_opportunity_candidates(uuid,uuid,uuid,text[],integer)','EXECUTE'),'clients cannot call dialogue-opportunity retrieval');
select ok(not has_function_privilege('authenticated','public.kivelle_scene_beat_candidates(uuid,uuid,uuid,text[],text[],integer)','EXECUTE'),'clients cannot call scene-beat retrieval');

select is(
  (select array_agg(fact_count order by slug) from (select world.slug,count(fact.id)::integer fact_count from public.together_worlds world join public.together_world_facts fact on fact.world_id=world.id and fact.active where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') group by world.slug) counts),
  array[50,50,50,50],
  'each active world has exactly fifty authored facts'
);
select is(
  (select array_agg(opportunity_count order by slug) from (select world.slug,count(item.id)::integer opportunity_count from public.together_worlds world join public.together_dialogue_opportunities item on item.world_id=world.id and item.active where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') group by world.slug) counts),
  array[25,25,25,25],
  'each active world has twenty-five dialogue opportunities'
);
select is(
  (select array_agg(beat_count order by slug) from (select world.slug,count(item.id)::integer beat_count from public.together_worlds world join public.together_scene_interaction_beats item on item.world_id=world.id and item.active where world.slug in('juniper-city','port-vervelle','neon-kyo','vespormoor') group by world.slug) counts),
  array[25,25,25,25],
  'each active world has twenty-five scene interaction beats'
);

select ok((select count(*)<=20 from public.kivelle_world_fact_candidates((select id from public.together_worlds where slug='juniper-city'),null,null,array['law'],array['law'],999)),'world fact candidates are capped at twenty');
select ok((select count(*)<=15 from public.kivelle_dialogue_opportunity_candidates((select id from public.together_worlds where slug='juniper-city'),null,null,array['dating'],999)),'dialogue opportunity candidates are capped at fifteen');
select ok((select count(*)<=15 from public.kivelle_scene_beat_candidates((select id from public.together_worlds where slug='juniper-city'),null,null,array['conversation'],array['co_present'],999)),'scene beat candidates are capped at fifteen');
select alike(pg_get_constraintdef(oid),'%truth_mode%canonical%disputed%rumor%secret%','truth mode is constrained') from pg_constraint where conname='together_world_facts_truth_mode_check';
select alike(pg_get_constraintdef(oid),'%required_participant_count%maximum_participant_count%','scene participant bounds are constrained') from pg_constraint where conname='together_scene_interaction_beats_participant_bounds';

select * from finish();
rollback;
