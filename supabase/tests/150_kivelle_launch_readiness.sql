begin;
select plan(29);

select has_column('public','together_profiles','private_text_preference','Private text choice is independent account state');
select has_column('public','together_profiles','private_text_preference_recorded_at','Private text choice records an explicit timestamp');
select has_column('public','together_profiles','ai_data_consent_decision','AI provider consent is visible in the profile projection');
select has_column('public','together_profiles','ai_data_consent_recorded_at','AI provider consent records an explicit timestamp');
select has_table('public','together_ai_data_consents','Current AI consent is authoritative');
select has_table('public','together_ai_data_consent_events','AI consent decisions retain an audit history');
select has_function('public','kivelle_record_launch_privacy_choices',array['uuid','text','text','text','text'],'Privacy choices are recorded transactionally');

select has_table('public','together_account_deletion_markers','Deleting accounts are blocked from new work');
select has_column('public','together_account_deletion_markers','provider_customer_id','Late provider events can be acknowledged without rebuilding a deleted account');
select has_column('public','together_account_deletion_markers','provider_subscription_id','Deleted-account subscription references retain only reconciliation identity');
select has_table('public','together_account_deletion_jobs','Account deletion has durable retry state');
select has_column('public','together_account_deletion_jobs','storage_job_ids','Deletion jobs retain cleanup work after an Auth row is removed');
select has_column('public','together_account_deletion_jobs','billing_cancellation_required','Deletion retries preserve whether legacy billing must be canceled');
select has_column('public','together_account_deletion_jobs','billing_canceled','Deletion retries remember completed legacy billing cancellation');
select col_is_null('public','together_storage_cleanup_jobs','user_id','Storage cleanup survives deletion of an app-owned Auth identity');
select has_function('public','kivelle_delete_application_user_data',array['uuid'],'Shared-auth projects can remove only Kivelle-owned application data');

select has_column('public','together_push_tokens','installation_id','Push registration has stable installation identity');
select has_column('public','together_push_tokens','deactivated_at','Push deactivation is auditable per installation');
select has_column('public','together_push_deliveries','attempt_count','Push attempts are tracked');
select has_column('public','together_push_deliveries','next_attempt_at','Push retries are scheduled');
select has_column('public','together_push_deliveries','expires_at','Stale push messages can expire');
select has_column('public','together_push_deliveries','lease_owner','Push workers can claim work safely');
select has_column('public','together_push_deliveries','opened_at','User opens are distinct from provider delivery');
select has_function('public','kivelle_claim_push_deliveries',array['text','integer'],'Push retry workers claim deliveries atomically');

select has_column('public','together_safety_reports','severity','Safety reports have triage severity');
select has_column('public','together_safety_reports','assigned_to','Safety reports can be assigned');
select has_column('public','together_safety_reports','resolution_code','Safety report resolution is explicit');
select has_table('public','together_safety_report_events','Safety report actions are auditable');
select ok(not has_table_privilege('authenticated','public.together_safety_report_events','select'),'Report action history is restricted to service operations');

select * from finish();
rollback;
