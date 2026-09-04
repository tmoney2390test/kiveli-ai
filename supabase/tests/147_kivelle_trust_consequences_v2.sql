begin;

select plan(11);

select col_default_is(
  'public',
  'together_relationship_states',
  'trust',
  '30',
  'new relationships begin at the 30-point trust baseline'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)'::regprocedure),
  'evidence_type=''trust_consequence''',
  'message retries are checked against canonical trust evidence'
);

select has_function(
  'public',
  'kivelle_apply_trust_consequence_v2',
  array['uuid','uuid','text','text','text','numeric','text','text','text','boolean','timestamp with time zone'],
  'trust consequences use one server-authoritative function'
);

select has_function(
  'public',
  'kivelle_apply_trust_repair_v2',
  array['uuid','uuid','text','numeric','boolean','boolean','boolean','text','timestamp with time zone'],
  'trust repair uses one server-authoritative function'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)'::regprocedure),
  'coalesce\(p_confidence,0\)<\.8',
  'low-confidence consequences fail closed'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)'::regprocedure),
  'p_event_source=''deterministic'' then -8 else -4',
  'only deterministic major events can exceed the model loss cap'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)'::regprocedure),
  'greatest\(0,8-v_used_loss\)',
  'dialogue-derived trust loss has a rolling daily ceiling'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)'::regprocedure),
  'pg_advisory_xact_lock',
  'concurrent retries and trust events are serialized per relationship'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_repair_v2(uuid,uuid,text,numeric,boolean,boolean,boolean,text,timestamp with time zone)'::regprocedure),
  'not coalesce\(p_apology,false\)',
  'repair requires an explicit apology'
);

select matches(
  pg_get_functiondef('public.kivelle_apply_trust_repair_v2(uuid,uuid,text,numeric,boolean,boolean,boolean,text,timestamp with time zone)'::regprocedure),
  'least\(4,v_lost,greatest\(1,round\(v_lost\*v_factor\)::integer\)\)',
  'repair is partial and cannot exceed the original loss'
);

select ok(
  not has_function_privilege('authenticated','public.kivelle_apply_trust_consequence_v2(uuid,uuid,text,text,text,numeric,text,text,text,boolean,timestamp with time zone)','execute')
  and not has_function_privilege('authenticated','public.kivelle_apply_trust_repair_v2(uuid,uuid,text,numeric,boolean,boolean,boolean,text,timestamp with time zone)','execute'),
  'clients cannot invoke trust mutation functions directly'
);

select * from finish();
rollback;
