begin;
select plan(12);

select trigger_is('public','together_locations','together_locations_private_limit','public','kivelle_limit_private_places','Every private place insert and restore checks the account tier');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000165','00000000-0000-0000-0000-000000000000','authenticated','authenticated','place-limit-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_entitlements(user_id,tier,entitlement_keys)
values('00000000-0000-4000-8000-000000000165','free','{}')
on conflict(user_id) do update set tier='free',expires_at=null;

insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',
  (select id from public.together_worlds where slug='eos-meridian'),
  'Place '||n,'test-place-limit-'||n,'A private test place','home'
from generate_series(1,3) n;
select is((select count(*)::integer from public.together_locations where owner_user_id='00000000-0000-4000-8000-000000000165' and archived_at is null),3,'Free can keep three places');
select throws_ok(
  $$insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
    select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',id,'Fourth','test-place-limit-fourth','A private test place','home'
    from public.together_worlds where slug='eos-meridian'$$,
  '23514','Private place limit reached','Free cannot create a fourth place'
);

update public.together_entitlements set tier='kivelle_plus' where user_id='00000000-0000-4000-8000-000000000165';
insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',
  (select id from public.together_worlds where slug='eos-meridian'),
  'Place '||n,'test-place-limit-'||n,'A private test place','home'
from generate_series(4,20) n;
select is((select count(*)::integer from public.together_locations where owner_user_id='00000000-0000-4000-8000-000000000165' and archived_at is null),20,'Plus can keep twenty places');
select throws_ok(
  $$insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
    select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',id,'Twenty-first','test-place-limit-twenty-first','A private test place','home'
    from public.together_worlds where slug='eos-meridian'$$,
  '23514','Private place limit reached','Plus cannot create a twenty-first place'
);

update public.together_entitlements set tier='kivelle_max' where user_id='00000000-0000-4000-8000-000000000165';
insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',
  (select id from public.together_worlds where slug='eos-meridian'),
  'Place '||n,'test-place-limit-'||n,'A private test place','home'
from generate_series(21,50) n;
select is((select count(*)::integer from public.together_locations where owner_user_id='00000000-0000-4000-8000-000000000165' and archived_at is null),50,'Max can keep fifty places');
select throws_ok(
  $$insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
    select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',id,'Fifty-first','test-place-limit-fifty-first','A private test place','home'
    from public.together_worlds where slug='eos-meridian'$$,
  '23514','Private place limit reached','Max cannot create a fifty-first place'
);

update public.together_entitlements set tier='free' where user_id='00000000-0000-4000-8000-000000000165';
select lives_ok($$update public.together_locations set name='Still mine' where owner_user_id='00000000-0000-4000-8000-000000000165' and slug='test-place-limit-1'$$,'Downgrading does not stop editing an existing place');
select is((select count(*)::integer from public.together_locations where owner_user_id='00000000-0000-4000-8000-000000000165' and archived_at is null),50,'Downgrading does not delete existing places');
update public.together_locations set archived_at=now() where owner_user_id='00000000-0000-4000-8000-000000000165' and slug='test-place-limit-1';
select throws_ok(
  $$update public.together_locations set archived_at=null where owner_user_id='00000000-0000-4000-8000-000000000165' and slug='test-place-limit-1'$$,
  '23514','Private place limit reached','Restoring an archived place requires a free slot in the current tier'
);
select is((select count(*)::integer from public.together_locations where owner_user_id='00000000-0000-4000-8000-000000000165' and archived_at is null),49,'Archive frees one active slot without deleting the place');
update public.together_entitlements set tier='kivelle_max',expires_at=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000000165';
select throws_ok(
  $$insert into public.together_locations(id,owner_user_id,world_id,name,slug,description,category)
    select gen_random_uuid(),'00000000-0000-4000-8000-000000000165',id,'Expired','test-place-limit-expired','A private test place','home'
    from public.together_worlds where slug='eos-meridian'$$,
  '23514','Private place limit reached','An expired Max entitlement uses the Free limit'
);

select * from finish();
rollback;
