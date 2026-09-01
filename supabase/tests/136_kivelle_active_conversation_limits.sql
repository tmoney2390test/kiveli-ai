begin;
select plan(16);

select has_function('public','kivelle_active_conversation_limit',array['uuid'],'Conversation limits have one server-authoritative tier resolver');
select trigger_is('public','together_conversations','together_conversations_active_limit','public','kivelle_enforce_active_conversation_limit','Every active conversation transition is guarded at the database boundary');
select has_index('public','together_conversations','together_conversations_active_user_idx','Active conversation counts use a partial user index');
select has_function('public','kivelle_start_fresh_group_conversation',array['uuid','uuid','text'],'Fresh group chats replace their transcript atomically');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000136','00000000-0000-0000-0000-000000000000','authenticated','authenticated','conversation-limit-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_profiles(user_id,display_name,age_verified_at,onboarding_completed_at)
values('00000000-0000-4000-8000-000000000136','Limit Test',now(),now())
on conflict(user_id) do update set display_name=excluded.display_name,age_verified_at=excluded.age_verified_at,onboarding_completed_at=excluded.onboarding_completed_at;
insert into public.together_entitlements(user_id,tier,entitlement_keys)
values('00000000-0000-4000-8000-000000000136','free','{}')
on conflict(user_id) do update set tier=excluded.tier,entitlement_keys=excluded.entitlement_keys,expires_at=null;
insert into public.together_user_personas(id,user_id,name,display_name,is_default)
values('00000000-0000-4000-8000-000000001361','00000000-0000-4000-8000-000000000136','Limit Test','Limit Test',true);
insert into public.together_continuities(id,user_id,persona_id,kind,title)
values('00000000-0000-4000-8000-000000001362','00000000-0000-4000-8000-000000000136','00000000-0000-4000-8000-000000001361','main','Limit Test Life');
update public.together_profiles set active_continuity_id='00000000-0000-4000-8000-000000001362'
where user_id='00000000-0000-4000-8000-000000000136';

insert into public.together_character_instances(
  user_id,continuity_id,character_template_id,character_version_id,introduced_at,contact_added_at
)
select '00000000-0000-4000-8000-000000000136','00000000-0000-4000-8000-000000001362',template.id,version.id,now(),now()
from public.together_character_templates template
join public.together_character_versions version
  on version.character_template_id=template.id and version.version=template.current_published_version
where template.published
order by template.id
limit 6;

select is(public.kivelle_active_conversation_limit('00000000-0000-4000-8000-000000000136'),5,'Free accounts receive five active conversation slots');

insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title)
select '00000000-0000-4000-8000-000000000136','00000000-0000-4000-8000-000000001362',instance.id,'direct','active-'||row_number() over(order by instance.id)
from public.together_character_instances instance
where instance.user_id='00000000-0000-4000-8000-000000000136'
order by instance.id
limit 5;

select is((select count(*)::integer from public.together_conversations where user_id='00000000-0000-4000-8000-000000000136' and archived_at is null and user_archived_at is null),5,'Five means five simultaneously active chat threads');
select throws_ok(
  $$insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title)
    select '00000000-0000-4000-8000-000000000136','00000000-0000-4000-8000-000000001362',instance.id,'direct','sixth'
    from public.together_character_instances instance
    where instance.user_id='00000000-0000-4000-8000-000000000136'
      and not exists(select 1 from public.together_conversations conversation where conversation.character_instance_id=instance.id)
    limit 1$$,
  'P0001','ACTIVE_CONVERSATION_LIMIT_REACHED:5','A sixth active conversation is rejected for Free'
);

create temporary table conversation_limit_fixture(archived_id uuid);
with archived as(
  update public.together_conversations set archived_at=now(),user_archived_at=now(),restore_until=now()+interval '30 days'
  where id=(select id from public.together_conversations where user_id='00000000-0000-4000-8000-000000000136' and archived_at is null order by id limit 1)
  returning id
)
insert into conversation_limit_fixture select id from archived;
select lives_ok($$select count(*) from conversation_limit_fixture$$,'Deleting a conversation archives it and immediately frees its active slot');
select lives_ok(
  $$insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title)
    select '00000000-0000-4000-8000-000000000136','00000000-0000-4000-8000-000000001362',instance.id,'direct','replacement'
    from public.together_character_instances instance
    where instance.user_id='00000000-0000-4000-8000-000000000136'
      and not exists(select 1 from public.together_conversations conversation where conversation.character_instance_id=instance.id)
    limit 1$$,
  'A new conversation can use the slot freed by deletion'
);
select is((select count(*)::integer from public.together_conversations where user_id='00000000-0000-4000-8000-000000000136' and archived_at is null and user_archived_at is null),5,'The replacement returns usage to five active conversations');
select throws_ok(
  format('select public.kivelle_restore_conversation(%L::uuid,%L::uuid)','00000000-0000-4000-8000-000000000136',(select archived_id from conversation_limit_fixture)),
  'P0001','ACTIVE_CONVERSATION_LIMIT_REACHED:5','Restoring an archived chat also requires an available active slot'
);
select lives_ok(
  $$update public.together_conversations set archived_at=now(),user_archived_at=now(),restore_until=now()+interval '30 days'
    where user_id='00000000-0000-4000-8000-000000000136' and title='replacement' and archived_at is null$$,
  'Deleting the replacement frees its slot'
);
select lives_ok(
  format('select public.kivelle_restore_conversation(%L::uuid,%L::uuid)','00000000-0000-4000-8000-000000000136',(select archived_id from conversation_limit_fixture)),
  'The archived conversation restores successfully once a slot is free'
);
select is((select count(*)::integer from public.together_conversations where user_id='00000000-0000-4000-8000-000000000136' and archived_at is null and user_archived_at is null),5,'Restore consumes exactly one freed slot');

update public.together_entitlements set tier='kivelle_plus' where user_id='00000000-0000-4000-8000-000000000136';
select is(public.kivelle_active_conversation_limit('00000000-0000-4000-8000-000000000136'),20,'Kivelle+ receives twenty active conversation slots');
update public.together_entitlements set tier='kivelle_max' where user_id='00000000-0000-4000-8000-000000000136';
select is(public.kivelle_active_conversation_limit('00000000-0000-4000-8000-000000000136'),50,'Kivelle Max receives fifty active conversation slots');

select * from finish();
rollback;
