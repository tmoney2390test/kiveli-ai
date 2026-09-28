begin;
select plan(7);

select has_column('public','together_locations','owner_user_id','Locations have an explicit owner');
select has_column('public','together_locations','custom_image_path','Private place images have a storage path');
select has_column('public','together_locations','archived_at','Private places can be archived without deleting plan history');
select ok((select relrowsecurity from pg_class where oid='public.together_locations'::regclass),'Location reads enforce RLS');
select ok(not has_table_privilege('authenticated','public.together_locations','INSERT'),'Clients cannot insert locations outside the validated endpoint');
select ok(not has_table_privilege('authenticated','public.together_locations','UPDATE'),'Clients cannot update another account’s place');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='together_locations' and policyname='together_locations_read' and qual like '%owner_user_id%auth.uid%'),'Location reads scope private rows to their owner');

select * from finish();
rollback;
