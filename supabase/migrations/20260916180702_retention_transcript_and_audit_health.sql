begin;
insert into public.together_retention_policies(key,label,relation_name,predicate_sql,update_sql,retention_note,enabled) values
('archived_call_transcripts','Expired archived call transcripts','public.together_voice_call_sessions',
$p$t.ended_at is not null and t.transcript<>'[]'::jsonb and exists(select 1 from together_conversations c where c.id=t.conversation_id and c.user_archived_at is not null and c.restore_until<$1)
and not exists(select 1 from together_support_tickets s where s.conversation_id=t.conversation_id and s.status not in ('resolved','closed'))
and not exists(select 1 from together_safety_reports s join together_messages m on m.id=s.message_id where m.conversation_id=t.conversation_id and s.status not in ('resolved','dismissed'))
and not exists(select 1 from together_retention_holds h where h.policy_key='archived_messages' and (h.expires_at is null or h.expires_at>$1))$p$,
'transcript=''[]''::jsonb','Remove duplicate transcript after archive expiry; keep call summary, usage and billing identity.',false);

create function public.kivelle_run_orphan_audit() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 return kivelle_audit_orphan_objects(1);
exception when query_canceled then
 update together_retention_policies set last_run_at=now(),last_error='57014' where key='orphan_objects';
 return jsonb_build_object('error','57014');
when others then
 update together_retention_policies set last_run_at=now(),last_error=sqlstate where key='orphan_objects';
 return jsonb_build_object('error',sqlstate);
end $$;
revoke all on function public.kivelle_run_orphan_audit() from public,anon,authenticated;
grant execute on function public.kivelle_run_orphan_audit() to service_role;
select cron.schedule('kivelli-orphan-file-audit','43 * * * *','select public.kivelle_run_orphan_audit()');
commit;
