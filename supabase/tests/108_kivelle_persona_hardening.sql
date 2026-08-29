begin;
select plan(5);

select has_trigger('public','together_continuities','together_continuities_validate_persona_owner','Life ownership is enforced below the API layer');
select ok(to_regprocedure('public.kivelle_validate_continuity_persona_owner()') is not null,'Persona ownership validator exists');
select has_index('public','together_continuities','together_continuities_user_persona_idx','Persona reconciliation is indexed by account and Persona');
select col_has_default('public','together_user_personas','communication_config','Persona communication preferences retain a database default');
select col_has_default('public','together_user_personas','appearance_config','Persona appearance metadata retains a database default');

select * from finish();
rollback;
