begin;

select plan(11);

select has_table('public','together_memory_capacity_policy','memory capacity policy is server controlled');
select has_index('public','together_memories','together_memories_user_active_capacity_idx','account active-memory counts are indexed');
select has_index('public','together_memories','together_memories_character_capacity_candidates_idx','compaction candidates are indexed');
select has_function('public','kivelle_run_memory_capacity_maintenance',array['uuid','uuid','timestamp with time zone'],'memory consolidation is callable by trusted workers');
select has_trigger('public','together_memories','together_memories_capacity_guard','hard memory capacity is enforced atomically');
select has_trigger('public','together_memories','together_memories_capacity_maintain','soft memory consolidation runs after writes');

select is(
  (select jsonb_build_array(soft_per_companion,compact_to_per_companion,hard_per_companion,hard_per_account) from public.together_memory_capacity_policy where singleton=true),
  '[500,450,1000,10000]'::jsonb,
  'capacity defaults use 500 soft, 1000 companion hard, and 10000 account hard limits'
);

select matches(
  pg_get_functiondef('public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamp with time zone)'::regprocedure),
  'memory_type in\(''episodic'',''emotional''\)',
  'consolidation selects only episodic and emotional memories'
);

select matches(
  pg_get_functiondef('public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamp with time zone)'::regprocedure),
  'visibility_scope=''all''',
  'consolidation reads only memories approved for every client surface'
);

select matches(
  pg_get_functiondef('public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamp with time zone)'::regprocedure),
  'content_rating in\(''safe'',''suggestive''\)',
  'consolidation reads only safe and suggestive memories'
);

select matches(
  pg_get_functiondef('public.kivelle_run_memory_capacity_maintenance(uuid,uuid,timestamp with time zone)'::regprocedure),
  'status=''superseded''',
  'capacity maintenance preserves source history instead of deleting it'
);

select * from finish();
rollback;
