begin;
select plan(11);

select has_column('public','together_relationship_states','engagement_score','Engagement score persists on relationship state');
select has_column('public','together_relationship_states','genuine_back_and_forth_turns','Reciprocal turns persist independently from message length');
select has_column('public','together_relationship_states','trivial_engagement_score','Trivial contribution cap persists');
select has_column('public','together_relationship_states','chemistry_heat','Chemistry persists independently from stage');
select has_column('public','together_relationship_states','physical_tension','Physical tension persists independently from stage');
select has_column('public','together_relationship_states','mutual_flirt_signals','Mutual flirt evidence persists');
select has_function('public','kivelle_relationship_progression_state',array['uuid','uuid','timestamp with time zone'],'Canonical progression evaluator remains available');
select has_function('public','kivelle_relationship_chemistry_guard',array[]::text[],'Chemistry safety guard exists');
select ok(not exists(select 1 from public.together_relationship_states relationship join public.together_character_instances instance on instance.id=relationship.character_instance_id where instance.relationship_stage='stranger' and (relationship.engagement_score>=6 or relationship.genuine_back_and_forth_turns>=3)),'Migration does not manufacture an immediately eligible Stranger milestone');
select ok(not exists(select 1 from public.together_relationship_states where romance_path_status='friends_only' and (chemistry_heat>15 or physical_tension>10 or attraction_acknowledged)),'Friends-only relationships keep romantic chemistry non-actionable');
select ok(not exists(select 1 from (values ('zoe-bennett',3),('nia-brooks',3),('priya-kapoor',3),('jade-nguyen',3),('sophie-laurent',1),('elena-markovic',1)) expected(slug,spice) left join public.together_character_templates template on template.slug=expected.slug where template.id is null or template.spice_level<>expected.spice),'Named Juniper characters retain authored bold and slow-burn spice profiles');

select * from finish();
rollback;
