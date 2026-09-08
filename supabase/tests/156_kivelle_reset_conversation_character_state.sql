begin;
select plan(11);

select has_function(
  'public','kivelle_reset_companion',array['uuid','uuid','text'],
  'Conversation controls use one server-authoritative companion reset'
);
select ok(
  not has_function_privilege('authenticated','public.kivelle_reset_companion(uuid,uuid,text)','execute'),
  'Clients cannot bypass the authenticated conversation endpoint to reset character state'
);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000156','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reset-owner@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
  ('00000000-0000-4000-8000-000000000157','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reset-other@kivelli.invalid','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb);
insert into public.together_profiles(user_id,display_name,age_verified_at,onboarding_completed_at)
values
  ('00000000-0000-4000-8000-000000000156','Reset Owner',now(),now()),
  ('00000000-0000-4000-8000-000000000157','Reset Other',now(),now());
insert into public.together_user_personas(id,user_id,name,display_name,is_default)
values
  ('00000000-0000-4000-8000-000000001561','00000000-0000-4000-8000-000000000156','Reset Owner','Reset Owner',true),
  ('00000000-0000-4000-8000-000000001571','00000000-0000-4000-8000-000000000157','Reset Other','Reset Other',true);
insert into public.together_continuities(id,user_id,persona_id,kind,title)
values
  ('00000000-0000-4000-8000-000000001562','00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001561','main','Reset Owner Life'),
  ('00000000-0000-4000-8000-000000001572','00000000-0000-4000-8000-000000000157','00000000-0000-4000-8000-000000001571','main','Reset Other Life');
update public.together_profiles set active_continuity_id=case user_id
  when '00000000-0000-4000-8000-000000000156'::uuid then '00000000-0000-4000-8000-000000001562'::uuid
  else '00000000-0000-4000-8000-000000001572'::uuid end
where user_id in('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000000157');

with selected_character as(
  select template.id as template_id,version.id as version_id
  from public.together_character_templates template
  join public.together_character_versions version
    on version.character_template_id=template.id and version.version=template.current_published_version
  where template.published
  order by template.id
  limit 1
)
insert into public.together_character_instances(
  id,user_id,continuity_id,character_template_id,character_version_id,
  relationship_stage,introduced_at,contact_added_at,life_state,life_state_summary,
  life_state_changed_at,life_state_metadata
)
select
  fixture.instance_id,fixture.user_id,fixture.continuity_id,selected.template_id,selected.version_id,
  'dating',now()-interval '90 days',now()-interval '90 days','dead','Killed in the prior story.',
  now()-interval '1 day','{"source":"conversation"}'::jsonb
from (
  values
    ('00000000-0000-4000-8000-000000001563'::uuid,'00000000-0000-4000-8000-000000000156'::uuid,'00000000-0000-4000-8000-000000001562'::uuid),
    ('00000000-0000-4000-8000-000000001573'::uuid,'00000000-0000-4000-8000-000000000157'::uuid,'00000000-0000-4000-8000-000000001572'::uuid)
) fixture(instance_id,user_id,continuity_id)
cross join selected_character selected;

insert into public.together_relationship_states(character_instance_id,user_id,continuity_id)
values
  ('00000000-0000-4000-8000-000000001563','00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001562'),
  ('00000000-0000-4000-8000-000000001573','00000000-0000-4000-8000-000000000157','00000000-0000-4000-8000-000000001572');
update public.together_relationship_states set
  trust=91,comfort=88,attraction=82,affinity=79,familiarity=77,respect=74,
  conflict=42,romantic_interest=85,commitment=69,conversation_count=50,
  active_major_conflict=true,recent_direction='strained',interaction_turn_count=54,
  conversation_session_count=12,meaningful_interaction_count=41,
  last_interaction_quality='major_relationship_event',last_relationship_delta='{"trust":-8}'::jsonb,
  stage_entered_at=now()-interval '60 days',dating_started_at=now()-interval '45 days',
  romance_path_status='friends_only',relationship_health_cache='strained',
  evidence_summary_cache='{"old":true}'::jsonb,last_major_milestone_at=now()-interval '2 days',
  next_milestone_kind='repair',next_milestone_eligible_at=now()+interval '1 day',
  next_milestone_presentable=true,dating_invitation_accepted_at=now()-interval '45 days',
  major_conflict_started_at=now()-interval '1 day',days_known=90,
  last_spoken_local_date=current_date-1,engagement_score=75,genuine_back_and_forth_turns=40,
  trivial_engagement_score=1.5,chemistry_heat=72,physical_tension=63,
  user_flirt_signals=15,character_flirt_signals=14,mutual_flirt_signals=12,
  attraction_acknowledged=true,last_chemistry_change_at=now()-interval '2 hours',
  last_flirt_signal_at=now()-interval '3 hours'
where user_id='00000000-0000-4000-8000-000000000156';
update public.together_relationship_states set trust=67,affinity=65
where user_id='00000000-0000-4000-8000-000000000157';

insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title)
values('00000000-0000-4000-8000-000000001564','00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001562','00000000-0000-4000-8000-000000001563','direct','History stays');
insert into public.together_relationship_evidence(
  user_id,continuity_id,character_instance_id,evidence_type,quality,valence,source_type,source_id,local_date
)
values('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001562','00000000-0000-4000-8000-000000001563','meaningful_conversation',.8,.7,'message','reset-test',current_date-1);
insert into public.together_companion_user_patterns(
  user_id,continuity_id,character_instance_id,pattern_key,category,summary,status
)
values('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001562','00000000-0000-4000-8000-000000001563','old-pattern','conversation_pacing','Old relationship expectation','active');
insert into public.together_emotional_residue(
  user_id,continuity_id,character_instance_id,tone,valence,intensity,source_type,half_life_minutes,expires_at
)
values('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001562','00000000-0000-4000-8000-000000001563','angry',-.7,.8,'message',240,now()+interval '4 hours');

select lives_ok(
  $$select public.kivelle_reset_companion('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001563','relationship')$$,
  'An owned relationship reset completes atomically'
);
select ok(
  (select life_state='alive' and life_state_summary is null and life_state_changed_at is null
      and life_state_source_message_id is null and life_state_metadata='{}'::jsonb
      and relationship_stage='stranger' and met_at>now()-interval '1 minute'
   from public.together_character_instances where id='00000000-0000-4000-8000-000000001563'),
  'Reset restores the character to a living, beginning-of-relationship state'
);
select ok(
  (select trust=30 and comfort=6 and attraction=8 and affinity=8 and familiarity=0 and respect=10
      and conflict=0 and romantic_interest=0 and commitment=0 and conversation_count=0
      and not active_major_conflict and recent_direction='new' and interaction_turn_count=0
      and conversation_session_count=0 and meaningful_interaction_count=0
      and last_interaction_quality is null and last_relationship_delta='{}'::jsonb
      and stage_entered_at is null and dating_started_at is null and exclusive_at is null and long_term_at is null
      and romance_path_status='open' and relationship_health_cache='steady'
      and evidence_summary_cache='{}'::jsonb and last_major_milestone_at is null
      and next_milestone_kind is null and next_milestone_eligible_at is null and not next_milestone_presentable
      and relationship_defining_date_session_id is null and dating_invitation_accepted_at is null
      and major_conflict_started_at is null and last_repair_completed_at is null
      and days_known=1 and last_spoken_local_date is null and engagement_score=0
      and genuine_back_and_forth_turns=0 and trivial_engagement_score=0
      and chemistry_heat=0 and physical_tension=0 and user_flirt_signals=0
      and character_flirt_signals=0 and mutual_flirt_signals=0 and not attraction_acknowledged
      and last_chemistry_change_at is null and last_flirt_signal_at is null
   from public.together_relationship_states where character_instance_id='00000000-0000-4000-8000-000000001563'),
  'Every current trust, affinity, chemistry, conflict, engagement, and milestone field uses its fresh default'
);
select is(
  (select count(*)::integer from public.together_relationship_active_days where character_instance_id='00000000-0000-4000-8000-000000001563'),
  1,
  'Reset relationship day history is reseeded at day one'
);
select is(
  (select count(*)::integer from (
    select id from public.together_relationship_evidence where character_instance_id='00000000-0000-4000-8000-000000001563'
    union all select id from public.together_companion_user_patterns where character_instance_id='00000000-0000-4000-8000-000000001563'
    union all select id from public.together_emotional_residue where character_instance_id='00000000-0000-4000-8000-000000001563'
  ) stale),
  0,
  'Derived relationship evidence, expectations, and emotional residue are removed'
);
select is(
  (select count(*)::integer from public.together_conversations where id='00000000-0000-4000-8000-000000001564'),
  1,
  'Relationship reset preserves the conversation transcript'
);
select ok(
  (select life_state='dead' and relationship_stage='dating'
   from public.together_character_instances where id='00000000-0000-4000-8000-000000001573')
  and
  (select trust=67 and affinity=65
   from public.together_relationship_states where character_instance_id='00000000-0000-4000-8000-000000001573'),
  'Another account character and relationship remain untouched'
);
select throws_ok(
  $$select public.kivelle_reset_companion('00000000-0000-4000-8000-000000000156','00000000-0000-4000-8000-000000001573','relationship')$$,
  'P0001','companion not found',
  'Supplying another account character cannot cross the ownership boundary'
);
select matches(
  pg_get_functiondef('public.kivelle_reset_companion(uuid,uuid,text)'::regprocedure),
  'life_state=''alive''',
  'The deployed reset contract explicitly restores life state'
);

select * from finish();
rollback;
