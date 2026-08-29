begin;
select plan(14);

select has_function(
  'public','kivelle_memory_center_counts_v2',array['uuid','uuid','uuid'],
  'memory center exposes a bounded aggregate count operation'
);

select has_function(
  'public','kivelle_memory_center_page_v2',
  array['uuid','uuid','uuid','text','text[]','text','boolean','integer','timestamp with time zone','uuid','integer'],
  'memory center exposes a searchable keyset page operation'
);

select has_function(
  'public','kivelle_edit_memory_v2',array['uuid','uuid','uuid','text'],
  'memory corrections use an atomic replacement operation'
);

select function_privs_are(
  'public','kivelle_memory_center_counts_v2',array['uuid','uuid','uuid'],
  'service_role',array['EXECUTE'],
  'only the server may read memory aggregates'
);

select function_privs_are(
  'public','kivelle_memory_center_page_v2',
  array['uuid','uuid','uuid','text','text[]','text','boolean','integer','timestamp with time zone','uuid','integer'],
  'service_role',array['EXECUTE'],
  'only the server may page through private memories'
);

select function_privs_are(
  'public','kivelle_edit_memory_v2',array['uuid','uuid','uuid','text'],
  'service_role',array['EXECUTE'],
  'only the server may perform canonical memory corrections'
);

select has_index(
  'public','together_memories','together_memories_search_v2_idx',
  'memory search has a full-text index'
);

select has_index(
  'public','together_memories','together_memories_center_newest_v2_idx',
  'newest memory paging has a composite index'
);

select has_index(
  'public','together_memories','together_memories_center_recalled_v2_idx',
  'most-recalled paging has a composite index'
);

select ok(
  position('websearch_to_tsquery' in pg_get_functiondef(
    'public.kivelle_memory_center_page_v2(uuid,uuid,uuid,text,text[],text,boolean,integer,timestamp with time zone,uuid,integer)'::regprocedure
  )) > 0,
  'memory search uses indexed web-style full-text matching'
);

select ok(
  position('p_cursor_id is null' in pg_get_functiondef(
    'public.kivelle_memory_center_page_v2(uuid,uuid,uuid,text,text[],text,boolean,integer,timestamp with time zone,uuid,integer)'::regprocedure
  )) > 0,
  'memory paging uses a stable keyset cursor rather than an offset'
);

select ok(
  position('for update' in lower(pg_get_functiondef(
    'public.kivelle_edit_memory_v2(uuid,uuid,uuid,text)'::regprocedure
  ))) > 0,
  'memory correction locks the active record against concurrent edits'
);

select ok(
  position('supersedes_memory_id' in pg_get_functiondef(
    'public.kivelle_edit_memory_v2(uuid,uuid,uuid,text)'::regprocedure
  )) > 0,
  'memory corrections retain revision lineage'
);

select ok(
  position('subject_key=previous.subject_key' in pg_get_functiondef(
    'public.kivelle_edit_memory_v2(uuid,uuid,uuid,text)'::regprocedure
  )) > 0,
  'a correction retires stale active duplicates for the same subject'
);

select * from finish();
rollback;
