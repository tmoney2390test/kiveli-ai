begin;
select plan(12);

select has_column('public','together_conversations','group_world_id','groups retain their canonical world');
select col_is_fk('public','together_conversations','group_world_id','group world references a canonical Kivelle world');
select has_index('public','together_conversations','together_conversations_group_world_idx','world-scoped group lookup is indexed');
select ok(to_regprocedure('public.kivelle_character_resident_world(uuid)') is not null,'resident-world resolver exists');
select has_trigger('public','together_conversations','together_conversations_validate_group_world','group conversation world has a database guard');
select has_trigger('public','together_conversation_participants','together_conversation_participants_validate','participant validation remains active');
select alike(pg_get_functiondef('public.kivelle_character_resident_world(uuid)'::regprocedure),'%presence.presence_type = ''resident''%','temporary visitors cannot define group scope');
select alike(pg_get_functiondef('public.kivelle_character_resident_world(uuid)'::regprocedure),'%count(DISTINCT presence.world_id) = 1%','ambiguous resident worlds are rejected');
select alike(pg_get_functiondef('public.kivelle_validate_group_participant()'::regprocedure),'%v_resident_world <> v_conversation.group_world_id%','participant resident world must match the group');
select alike(pg_get_functiondef('public.kivelle_validate_group_conversation_world()'::regprocedure),'%group world must match every active participant%','group world cannot be changed across its roster');
select ok(not has_function_privilege('authenticated','public.kivelle_character_resident_world(uuid)','EXECUTE'),'clients cannot probe internal resident-world resolution');
select constraint_is('public','together_conversations','together_group_conversations_require_world','CHECK (((kind <> ''group''::text) OR (group_world_id IS NOT NULL))) NOT VALID','new group conversations require a world');

select * from finish();
rollback;
