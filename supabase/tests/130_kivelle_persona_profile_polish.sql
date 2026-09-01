begin;
select plan(4);

select col_has_check('public','together_user_personas','age','Persona ages are bounded in the database');
select col_has_check('public','together_user_personas','appearance_config','Persona appearance configuration remains an object');
select col_has_check('public','together_user_personas','communication_config','Persona communication configuration remains an object');
select has_index('public','together_continuities','together_continuities_one_life_per_persona_idx','A Persona can start only one retry-safe Life');

select * from finish();
rollback;
