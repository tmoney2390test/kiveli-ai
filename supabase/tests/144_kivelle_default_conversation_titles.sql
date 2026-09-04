begin;
select plan(5);

select has_function('public','kivelle_set_default_conversation_title',array[]::text[],'Default conversation titles have one server-authoritative function');
select trigger_is('public','together_conversations','together_conversations_default_title','public','kivelle_set_default_conversation_title','Default conversation titles are assigned at the database boundary');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000144','00000000-0000-0000-0000-000000000000','authenticated','authenticated','conversation-title-test@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_profiles(user_id,display_name,age_verified_at,onboarding_completed_at)
values('00000000-0000-4000-8000-000000000144','Title Test',now(),now());
insert into public.together_user_personas(id,user_id,name,display_name,is_default)
values('00000000-0000-4000-8000-000000001441','00000000-0000-4000-8000-000000000144','Title Test','Title Test',true);
insert into public.together_continuities(id,user_id,persona_id,kind,title)
values('00000000-0000-4000-8000-000000001442','00000000-0000-4000-8000-000000000144','00000000-0000-4000-8000-000000001441','main','Title Test Life');
update public.together_profiles set active_continuity_id='00000000-0000-4000-8000-000000001442'
where user_id='00000000-0000-4000-8000-000000000144';

insert into public.together_character_instances(id,user_id,continuity_id,character_template_id,character_version_id,introduced_at,contact_added_at)
select '00000000-0000-4000-8000-000000001443','00000000-0000-4000-8000-000000000144','00000000-0000-4000-8000-000000001442',template.id,version.id,now(),now()
from public.together_character_templates template
join public.together_character_versions version on version.character_template_id=template.id and version.version=template.current_published_version
where template.slug='sana-rahman';

insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title)
values('00000000-0000-4000-8000-000000001444','00000000-0000-4000-8000-000000000144','00000000-0000-4000-8000-000000001442','00000000-0000-4000-8000-000000001443','direct','Thursday September 04');
select is((select title from public.together_conversations where id='00000000-0000-4000-8000-000000001444'),'Chat with Sana','Legacy date titles become Chat with the companion first name');

update public.together_conversations set archived_at=now() where id='00000000-0000-4000-8000-000000001444';
insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title)
values('00000000-0000-4000-8000-000000001445','00000000-0000-4000-8000-000000000144','00000000-0000-4000-8000-000000001442','00000000-0000-4000-8000-000000001443','direct','Late-night catch-up');
select is((select title from public.together_conversations where id='00000000-0000-4000-8000-000000001445'),'Late-night catch-up','A user-authored chat title is preserved');

update public.together_conversations set archived_at=now() where id='00000000-0000-4000-8000-000000001445';
insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title)
values('00000000-0000-4000-8000-000000001446','00000000-0000-4000-8000-000000000144','00000000-0000-4000-8000-000000001442','00000000-0000-4000-8000-000000001443','direct',null);
select is((select title from public.together_conversations where id='00000000-0000-4000-8000-000000001446'),'Chat with Sana','Untitled direct chats receive the companion default');

select * from finish();
rollback;
