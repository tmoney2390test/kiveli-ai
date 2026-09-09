begin;
select plan(15);

select has_function('public','kivelle_check_generation_guardrails',array['uuid','text'],'Rolling and cost controls share one server admission function');
select has_function('public','kivelle_claim_generation_request_anchor',array['uuid','uuid','text','text','integer'],'Reconnect request identities are reconciled server-side');
select ok(not has_function_privilege('authenticated','public.kivelle_check_generation_guardrails(uuid,text)','execute'),'Clients cannot bypass the server guardrail contract');
select ok(not has_function_privilege('authenticated','public.kivelle_claim_generation_request_anchor(uuid,uuid,text,text,integer)','execute'),'Clients cannot claim request anchors directly');
select ok((select relrowsecurity from pg_class where oid='public.kivelle_rolling_rate_events'::regclass),'Rolling event records use RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_dialogue_suggestion_cache'::regclass),'Suggestion cache records use RLS');
select is((select account_concurrency_limit from public.kivelle_generation_guardrail_config where singleton),2,'Account dialogue concurrency defaults to two');
select ok((select percentile_source?'calculatedAt' from public.kivelle_generation_guardrail_config where singleton),'Cost thresholds record their observed percentile provenance');
select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000902','provider_cost_only')->>'allowed')::boolean,true,'Media and voice callers can use the cost-only admission path');

select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000901','dialogue')->>'allowed')::boolean,true,'First rolling dialogue admission succeeds');
select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000901','dialogue')->>'allowed')::boolean,true,'Second rolling dialogue admission succeeds');
select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000901','dialogue')->>'allowed')::boolean,true,'Third rolling dialogue admission succeeds');
select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000901','dialogue')->>'allowed')::boolean,true,'Fourth rolling dialogue admission succeeds');
select is((public.kivelle_check_generation_guardrails('00000000-0000-4000-8000-000000000901','dialogue')->>'reason')::text,'rolling_rate','The fifth turn in twenty seconds is cooled down');
select matches(pg_get_functiondef('public.kivelle_begin_dialogue_turn(uuid,uuid,uuid,text,text,boolean,integer)'::regprocedure),'DIALOGUE_ACCOUNT_CAPACITY','All direct, group, and shared-scene turns use the account-wide capacity check');

select * from finish();
rollback;
