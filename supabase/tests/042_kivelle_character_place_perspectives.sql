begin;
select plan(14);

select has_column('public','together_relationship_places','continuity_id','Relationship places are scoped to one Kivelle Life');
select has_column('public','together_relationship_places','opinion_summary','Relationship places retain the current character view');
select has_column('public','together_relationship_places','evidence_count','The current view reports supporting evidence');
select has_column('public','together_relationship_places','last_discussed_at','Place discussion recency is tracked separately from visits');
select has_table('public','together_character_place_profiles','Character versions can own authored starting place perspectives');
select has_table('public','together_character_place_opinion_evidence','Learned opinions have a canonical evidence ledger');
select has_table('public','together_relationship_place_visits','Shared visits have an idempotent ledger');
select ok((select relrowsecurity from pg_class where oid='public.together_character_place_profiles'::regclass),'Authored place profiles use RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_character_place_opinion_evidence'::regclass),'Opinion evidence uses RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_relationship_place_visits'::regclass),'Visit evidence uses RLS');
select ok(to_regprocedure('public.kivelle_record_relationship_place_visit(uuid,uuid,uuid,text,uuid,timestamptz,text,uuid)') is not null,'Shared visits use a transactional server function');
select ok((select prosecdef from pg_proc where oid='public.kivelle_record_relationship_place_visit(uuid,uuid,uuid,text,uuid,timestamptz,text,uuid)'::regprocedure),'Visit recording is server-owned');
select ok(exists(select 1 from pg_indexes where indexname='together_place_opinion_evidence_context_idx'),'Opinion evidence is indexed by character and place');
select ok((select count(*)>=9 from public.together_character_place_profiles where metadata->>'source'='authored_content'),'Starter companions have data-driven initial place perspectives');

select * from finish();
rollback;
