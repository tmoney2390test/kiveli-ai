begin;
select plan(9);

select has_column('public','together_profiles','date_of_birth','Profiles can store a private birthdate');
select col_default_is('public','together_web_adult_sessions','adult_mode_enabled','true','Website security sessions default enabled');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000139','00000000-0000-0000-0000-000000000000','authenticated','authenticated','birthdate-explicit-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);

insert into public.together_profiles(user_id,display_name,date_of_birth,age_verified_at,adult_eligible_at,adult_eligibility_method,content_preferences)
values('00000000-0000-4000-8000-000000000139','Test Adult','1990-01-15',now(),now(),'self_declared_dob_v2','{"contentMode":"explicit","romanceEnabled":true}'::jsonb);

select is((select date_of_birth::text from public.together_profiles where user_id='00000000-0000-4000-8000-000000000139'),'1990-01-15','Birthdate is stored as a date');
select is((select content_preferences->>'contentMode' from public.together_profiles where user_id='00000000-0000-4000-8000-000000000139'),'explicit','A historical explicit JSON preference is preserved');
select is((select private_text_preference from public.together_profiles where user_id='00000000-0000-4000-8000-000000000139'),null,'A historical JSON default is not treated as recorded private-text consent');
select is((select ai_data_consent_decision from public.together_profiles where user_id='00000000-0000-4000-8000-000000000139'),null,'AI data-sharing consent is independent and never fabricated');
select ok(not has_table_privilege('authenticated','public.together_profiles','select'),'Clients cannot read private profile columns directly');
select is((select adult_eligibility_method from public.together_profiles where user_id='00000000-0000-4000-8000-000000000139'),'self_declared_dob_v2','Birthdate eligibility records its versioned method');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000140','00000000-0000-0000-0000-000000000000','authenticated','authenticated','safe-default-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_profiles(user_id,display_name,date_of_birth,age_verified_at,adult_eligible_at,adult_eligibility_method)
values('00000000-0000-4000-8000-000000000140','Safe Default','1990-01-15',now(),now(),'self_declared_dob_v2');
select is((select content_preferences->>'contentMode' from public.together_profiles where user_id='00000000-0000-4000-8000-000000000140'),'standard','New adult profiles default to standard until a choice is recorded');

select * from finish();
rollback;
