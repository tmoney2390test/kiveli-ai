begin;
select plan(12);

select has_column('public','together_story_campaigns','continuity_id','Story campaigns belong to one Kivelle Life');
select col_not_null('public','together_story_campaigns','continuity_id','Every Story campaign has a Life boundary');
select has_index('public','together_story_campaigns','together_story_campaigns_one_active_idx','Active Stories are unique per Life');
select has_index('public','together_story_campaigns','together_story_campaigns_user_recent_idx','Story libraries are indexed per account and Life');
select has_index('public','together_story_campaigns','together_story_campaigns_definition_idx','Story definition deletes have a covering campaign index');
select has_index('public','together_story_campaigns','together_story_campaigns_continuity_owner_idx','Story Life ownership checks and cascades have a covering index');
select has_trigger('public','together_story_campaigns','together_story_campaigns_assign_continuity','Legacy Story callers receive an owned Life automatically');
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid='public.together_story_campaigns'::regclass
      and conname='together_story_campaigns_continuity_owner_fkey'
      and contype='f'
  ),
  'The database enforces matching campaign and Life ownership'
);

insert into auth.users(id,email)
values
  ('15300000-0000-0000-0000-000000000001','story-life-owner@example.com'),
  ('15300000-0000-0000-0000-000000000002','story-life-other@example.com');

insert into public.together_user_personas(id,user_id,name,display_name,is_default)
values
  ('15310000-0000-0000-0000-000000000001','15300000-0000-0000-0000-000000000001','Main','Main',true),
  ('15310000-0000-0000-0000-000000000002','15300000-0000-0000-0000-000000000001','Alternate','Alternate',false),
  ('15310000-0000-0000-0000-000000000003','15300000-0000-0000-0000-000000000002','Other','Other',true);

insert into public.together_continuities(id,user_id,persona_id,kind,title)
values
  ('15320000-0000-0000-0000-000000000001','15300000-0000-0000-0000-000000000001','15310000-0000-0000-0000-000000000001','main','Main Life'),
  ('15320000-0000-0000-0000-000000000002','15300000-0000-0000-0000-000000000001','15310000-0000-0000-0000-000000000002','alternate','Alternate Life'),
  ('15320000-0000-0000-0000-000000000003','15300000-0000-0000-0000-000000000002','15310000-0000-0000-0000-000000000003','main','Other Life');

insert into public.together_story_definitions(id,slug,title,genre,description,world_slug,status)
values('15330000-0000-0000-0000-000000000001','persona-continuity-test','Test Story','Test','Test Story','test-world','playable');

select throws_ok(
  $$insert into public.together_story_campaigns(user_id,continuity_id,story_definition_id,story_slug,current_location_slug)
    values('15300000-0000-0000-0000-000000000001','15320000-0000-0000-0000-000000000003','15330000-0000-0000-0000-000000000001','persona-continuity-test','start')$$,
  '23503',
  null,
  'A campaign cannot reference another account Life'
);

insert into public.together_story_campaigns(user_id,continuity_id,story_definition_id,story_slug,current_location_slug)
values
  ('15300000-0000-0000-0000-000000000001','15320000-0000-0000-0000-000000000001','15330000-0000-0000-0000-000000000001','persona-continuity-test','start'),
  ('15300000-0000-0000-0000-000000000001','15320000-0000-0000-0000-000000000002','15330000-0000-0000-0000-000000000001','persona-continuity-test','start');

select results_eq(
  $$select count(*)::bigint from public.together_story_campaigns
    where user_id='15300000-0000-0000-0000-000000000001'
      and story_slug='persona-continuity-test'$$,
  array[2::bigint],
  'The same Story can progress independently in two Persona Lives'
);

insert into public.together_story_campaigns(user_id,story_definition_id,story_slug,current_location_slug)
values('15300000-0000-0000-0000-000000000002','15330000-0000-0000-0000-000000000001','persona-continuity-test','start');

select results_eq(
  $$select continuity_id from public.together_story_campaigns
    where user_id='15300000-0000-0000-0000-000000000002'
      and story_slug='persona-continuity-test'$$,
  array['15320000-0000-0000-0000-000000000003'::uuid],
  'Legacy Story inserts resolve to the account owned main Life'
);

set local role authenticated;
set local request.jwt.claim.sub='15300000-0000-0000-0000-000000000002';
select is_empty(
  $$select id from public.together_story_campaigns where user_id='15300000-0000-0000-0000-000000000001'$$,
  'Another account cannot read either Life Story campaign'
);

select * from finish();
rollback;
