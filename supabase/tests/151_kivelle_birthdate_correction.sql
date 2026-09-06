begin;
select plan(2);

select has_column('public','together_profiles','birthdate_corrected_at','Profiles record whether the one self-service birthdate correction was used');
select ok(not has_table_privilege('authenticated','public.together_profiles','update'),'Clients cannot bypass the server-owned correction limit');

select * from finish();
rollback;
