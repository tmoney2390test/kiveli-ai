begin;
select plan(4);

select has_check('public','together_user_personas','together_user_personas_age_check','Persona ages are bounded in the database');
select has_check('public','together_user_personas','together_user_personas_appearance_config_object_check','Persona appearance configuration remains an object');
select has_check('public','together_user_personas','together_user_personas_communication_config_object_check','Persona communication configuration remains an object');
select has_index('public','together_continuities','together_continuities_one_life_per_persona_idx','A Persona can start only one retry-safe Life');

select * from finish();
rollback;
