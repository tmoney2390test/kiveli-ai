begin;
select plan(5);

select has_function('public','kivelle_relationship_progression_state',array['uuid','uuid','timestamp with time zone'],'Canonical relationship evaluator remains installed');
select has_function('public','kivelle_relationship_progression_state_pre_natural_v3',array['uuid','uuid','timestamp with time zone'],'Prior evaluator is preserved in the wrapper chain');
select ok(position('v_natural_path' in pg_get_functiondef('public.kivelle_relationship_progression_state(uuid,uuid,timestamp with time zone)'::regprocedure))>0,'Evaluator includes a natural-conversation friendship path');
select ok(position('genuine_back_and_forth_turns' in pg_get_functiondef('public.kivelle_relationship_progression_state(uuid,uuid,timestamp with time zone)'::regprocedure))>0,'Natural progression uses genuine reciprocal turns');
select col_not_null('public','together_relationship_states','engagement_score','Engagement remains durable server-owned relationship state');

select * from finish();
rollback;
