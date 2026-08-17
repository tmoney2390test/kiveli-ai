begin;
select plan(16);

select has_table('public','together_creator_drafts','Creator Studio has recoverable draft state');
select has_table('public','together_creator_assets','Creator appearance candidates are explicit account-owned assets');
select has_column('public','together_creator_drafts','target_continuity_id','Drafts target a Kivelle Life without materializing a relationship');
select has_column('public','together_creator_drafts','revision','Draft edits support optimistic concurrency');
select has_column('public','together_creator_drafts','routine_config','A proposed canonical weekly rhythm is reviewable before finalization');
select has_column('public','together_creator_drafts','first_meeting_config','First meetings are selected from canonical structured proposals');
select has_column('public','together_creator_drafts','finalized_template_id','Draft promotion is idempotently linked to its final character');
select has_column('public','together_creator_assets','group_request_id','Appearance generations use a stable idempotency group');
select has_column('public','together_creator_assets','selected','Exactly one generated look can become canonical');
select has_column('public','together_character_versions','updated_at','Character versions can be edited without sending an unknown database column');
select has_index('public','together_creator_drafts','together_creator_drafts_user_status_idx','Draft resumption is indexed without loading the companion catalog');
select has_index('public','together_creator_assets','together_creator_assets_one_selected_appearance_idx','Canonical appearance selection is unique per draft');
select has_function('public','kivelle_finalize_creator_draft',array['uuid','uuid','uuid'],'Creator finalization is one atomic database transaction');
select ok((select relrowsecurity from pg_class where oid='public.together_creator_drafts'::regclass),'Creator drafts use RLS');
select ok((select relrowsecurity from pg_class where oid='public.together_creator_assets'::regclass),'Creator assets use RLS');
select ok(
  not has_function_privilege('authenticated','public.kivelle_finalize_creator_draft(uuid,uuid,uuid)','execute'),
  'Clients cannot bypass the validated Creator service to finalize drafts'
);

select * from finish();
rollback;
