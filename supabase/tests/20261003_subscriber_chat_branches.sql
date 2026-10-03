begin;
select plan(12);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000903','00000000-0000-0000-0000-000000000000','authenticated','authenticated','branch-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_profiles(user_id,display_name,age_verified_at,onboarding_completed_at)
values('00000000-0000-4000-8000-000000000903','Branch Test',now(),now());
insert into public.together_entitlements(user_id,tier,entitlement_keys)
values('00000000-0000-4000-8000-000000000903','free','{}');
insert into public.together_user_personas(id,user_id,name,display_name,is_default)
values('00000000-0000-4000-8000-000000009031','00000000-0000-4000-8000-000000000903','Branch Test','Branch Test',true);
insert into public.together_continuities(id,user_id,persona_id,kind,title)
values('00000000-0000-4000-8000-000000009032','00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000009031','main','Main Life');
update public.together_profiles set active_continuity_id='00000000-0000-4000-8000-000000009032'
where user_id='00000000-0000-4000-8000-000000000903';

create temporary table branch_fixture(instance_id uuid,conversation_id uuid,anchor_id uuid);
with instance as (
  insert into public.together_character_instances(user_id,continuity_id,character_template_id,character_version_id,introduced_at,contact_added_at)
  select '00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000009032',template.id,version.id,now(),now()
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id and version.version=template.current_published_version
  where template.published order by template.id limit 1 returning id
), conversation as (
  insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title)
  select '00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000009032',id,'direct','Source chat'
  from instance returning id,character_instance_id
)
insert into branch_fixture(instance_id,conversation_id)
select character_instance_id,id from conversation;

insert into public.together_relationship_states(character_instance_id,user_id,continuity_id,trust,comfort)
select instance_id,'00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000009032',37,28 from branch_fixture
on conflict(character_instance_id) do update set trust=37,comfort=28;
insert into public.together_messages(conversation_id,user_id,character_instance_id,role,content,delivery_status)
select conversation_id,'00000000-0000-4000-8000-000000000903',instance_id,'user','Do you want to stay?','complete' from branch_fixture;
with reply as (
  insert into public.together_messages(conversation_id,user_id,character_instance_id,role,content,delivery_status)
  select conversation_id,'00000000-0000-4000-8000-000000000903',instance_id,'assistant','I need to think about it.','complete' from branch_fixture returning id
)
update branch_fixture set anchor_id=(select id from reply);

select throws_ok(
  format('select public.kivelle_start_chat_branch(%L::uuid,%L::uuid,%L::uuid,%L::uuid)',
    '00000000-0000-4000-8000-000000000903',(select conversation_id from branch_fixture),
    (select anchor_id from branch_fixture),'00000000-0000-4000-8000-000000009039'),
  'P0001','BRANCH_SUBSCRIPTION_REQUIRED','Free users cannot create a branch at the database boundary');
update public.together_entitlements set tier='kivelle_plus' where user_id='00000000-0000-4000-8000-000000000903';
create temporary table branch_created(data jsonb);
insert into branch_created select public.kivelle_start_chat_branch(
  '00000000-0000-4000-8000-000000000903',(select conversation_id from branch_fixture),
  (select anchor_id from branch_fixture),'00000000-0000-4000-8000-000000009039');

select is((select count(*)::integer from public.together_chat_branch_prefix
  where conversation_id=(select (data->>'conversationId')::uuid from branch_created)),2,'The original exchange is snapshotted in read-only history');
select is((select count(*)::integer from public.together_messages
  where conversation_id=(select (data->>'conversationId')::uuid from branch_created)),0,'Branch creation does not replay message writes');
select is((select count(*)::integer from public.together_messages
  where conversation_id=(select conversation_id from branch_fixture)),2,'The original transcript remains unchanged');
select is((select trust from public.together_relationship_states
  where character_instance_id=(select (data->>'characterInstanceId')::uuid from branch_created)),
  (select trust from public.together_relationship_states where character_instance_id=(select instance_id from branch_fixture)),
  'Relationship state is copied into the branch');
select is((select active_continuity_id from public.together_profiles where user_id='00000000-0000-4000-8000-000000000903'),
  (select (data->>'continuityId')::uuid from branch_created),'The new path becomes the active Life');
select is((select kind from public.together_continuities where id=(select (data->>'continuityId')::uuid from branch_created)),
  'branch','A branch is distinguished from a paid alternate Life');
select is((select count(*)::integer from public.together_chat_branches where user_id='00000000-0000-4000-8000-000000000903'),1,'One request creates one branch');
select is((select (public.kivelle_start_chat_branch(
  '00000000-0000-4000-8000-000000000903',(select conversation_id from branch_fixture),
  (select anchor_id from branch_fixture),'00000000-0000-4000-8000-000000009039')->>'branchId')::uuid),
  (select (data->>'branchId')::uuid from branch_created),'A repeated request returns the original branch');
select ok(not has_table_privilege('authenticated','public.together_chat_branch_prefix','SELECT'),
  'The immutable prefix is available only through the owner-checked server API');
select ok(not has_table_privilege('authenticated','public.together_chat_branches','SELECT'),
  'Branch linkage is not directly readable by clients');
select is((select message_sequence from public.together_conversations
  where id=(select (data->>'conversationId')::uuid from branch_created)),2::bigint,
  'New branch messages continue after the copied sequence');

select * from finish();
rollback;
