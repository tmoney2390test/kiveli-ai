begin;
create table public.together_retention_object_audits (
 bucket_id text not null, storage_path text not null, byte_size bigint not null default 0,
 status text not null check(status in ('referenced','candidate','queued','deleted','missing')),
 first_unreferenced_at timestamptz,last_checked_at timestamptz not null default now(),
 primary key(bucket_id,storage_path)
);
alter table public.together_retention_object_audits enable row level security;
revoke all on public.together_retention_object_audits from public,anon,authenticated;
grant all on public.together_retention_object_audits to service_role;
alter table public.together_storage_cleanup_jobs add column orphan_review boolean not null default false;

-- Search all public application rows, including JSON and legacy consumers. A
-- substring match may retain too much, but never assumes an unknown reference
-- is disposable. Retention bookkeeping must not reference itself forever.
create function public.kivelle_storage_path_referenced(p_path text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare rel record; found_ref boolean;
begin
 if p_path is null or length(p_path)<12 then return true; end if;
 for rel in select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname not like 'together_retention_%'
 and c.relname<>'together_storage_cleanup_jobs' order by c.relname loop
 execute format('select exists(select 1 from %s t where strpos(to_jsonb(t)::text,$1)>0)',rel.name) into found_ref using p_path;
 if found_ref then return true; end if;
 end loop;
 return false;
end $$;

insert into public.together_retention_policies(key,label,relation_name,predicate_sql,retention_note) values
('orphan_objects','Unreferenced private files','public.together_retention_object_audits','false','Only together-user-media; seven-day reference quarantine and another reference check before Storage API removal.'),
('object_audit_history','Deleted file audit history','public.together_retention_object_audits',$p$t.status in ('deleted','missing') and t.last_checked_at < $1 - interval '30 days'$p$,'Thirty days after removal; aggregate byte totals remain.');

create function public.kivelle_audit_orphan_objects(p_limit integer default 2) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='25s' as $$
declare obj record; referenced boolean; first_seen timestamptz; checked integer=0; queued integer=0;
begin
 if p_limit is null or p_limit<1 or p_limit>10 then raise exception 'RETENTION_INVALID_ARGUMENT'; end if;
 if not exists(select 1 from together_retention_policies where key='orphan_objects' and enabled)
 or exists(select 1 from together_retention_holds where policy_key='orphan_objects' and record_id='*' and (expires_at is null or expires_at>now())) then return jsonb_build_object('paused',true); end if;
 if not pg_try_advisory_xact_lock(74640,2) then return jsonb_build_object('busy',true); end if;
 update together_retention_object_audits a set status='missing',last_checked_at=now()
 where status in ('referenced','candidate') and not exists(select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.storage_path);
 for obj in select o.bucket_id,o.name,coalesce((o.metadata->>'size')::bigint,0) bytes,a.first_unreferenced_at
 from storage.objects o left join together_retention_object_audits a on a.bucket_id=o.bucket_id and a.storage_path=o.name
 where o.bucket_id='together-user-media' and o.created_at<now()-interval '7 days'
 and (a.last_checked_at is null or a.last_checked_at<now()-interval '1 day')
 and coalesce(a.status,'candidate') not in ('queued','deleted')
 order by a.last_checked_at nulls first,o.created_at limit p_limit loop
 referenced=kivelle_storage_path_referenced(obj.name);checked=checked+1;
 first_seen=case when referenced then null else coalesce(obj.first_unreferenced_at,now()) end;
 insert into together_retention_object_audits(bucket_id,storage_path,byte_size,status,first_unreferenced_at)
 values(obj.bucket_id,obj.name,obj.bytes,case when referenced then 'referenced' else 'candidate' end,first_seen)
 on conflict(bucket_id,storage_path) do update set byte_size=excluded.byte_size,status=excluded.status,first_unreferenced_at=excluded.first_unreferenced_at,last_checked_at=now();
 if not referenced and first_seen<now()-interval '7 days' and not exists(select 1 from together_retention_holds where policy_key='orphan_objects' and record_id=obj.name and (expires_at is null or expires_at>now())) then
 insert into together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count,orphan_review)
 select null,obj.bucket_id,obj.name,'pending',0,true where not exists(select 1 from together_storage_cleanup_jobs where bucket_id=obj.bucket_id and storage_path=obj.name and status in ('pending','held'));
 update together_retention_object_audits set status='queued' where bucket_id=obj.bucket_id and storage_path=obj.name;queued=queued+1;
 end if;
 end loop;
 update together_retention_policies set last_run_at=now(),last_success_at=now(),last_error=null,last_candidates=checked,last_processed=queued,total_processed=total_processed+queued where key='orphan_objects';
 return jsonb_build_object('checked',checked,'queued',queued);
end $$;

create function public.kivelle_record_orphan_removal() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.orphan_review and new.status='complete' and old.status<>'complete' and new.last_error is null then
 update together_retention_object_audits set status='deleted',last_checked_at=now() where bucket_id=new.bucket_id and storage_path=new.storage_path and status='queued';
 end if;
 return new;
end $$;
create trigger together_record_orphan_removal after update of status on together_storage_cleanup_jobs
for each row execute function kivelle_record_orphan_removal();

create function public.kivelle_retention_storage_status() returns jsonb
language sql security definer set search_path=public,pg_temp as $$
select jsonb_build_object('objects',(select coalesce(jsonb_agg(r),'[]') from(select status,count(*) as objects,sum(byte_size) as bytes from together_retention_object_audits group by status)r),
'lastCheckedAt',(select max(last_checked_at) from together_retention_object_audits));
$$;

create function public.kivelle_allow_orphan_removal(p_job uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='25s' as $$
declare job public.together_storage_cleanup_jobs;
begin
 select * into job from together_storage_cleanup_jobs where id=p_job and status='pending';
 if not found or not job.orphan_review or job.bucket_id<>'together-user-media' then return false; end if;
 if exists(select 1 from together_retention_holds where policy_key='orphan_objects' and record_id in ('*',job.storage_path) and (expires_at is null or expires_at>now()))
 or not exists(select 1 from together_retention_policies where key='orphan_objects' and enabled) then return false; end if;
 if kivelle_storage_path_referenced(job.storage_path) then
 update together_retention_object_audits set status='referenced',first_unreferenced_at=null,last_checked_at=now() where bucket_id=job.bucket_id and storage_path=job.storage_path;
 update together_storage_cleanup_jobs set status='complete',last_error='retained_new_reference',updated_at=now() where id=p_job;
 return false;
 end if;
 return exists(select 1 from together_retention_object_audits where bucket_id=job.bucket_id and storage_path=job.storage_path and status='queued' and first_unreferenced_at<now()-interval '7 days');
end $$;

-- Scrub duplicate representations only after the original message was safely
-- minimized. Keep IDs and status for idempotency and financial reconciliation.
insert into public.together_retention_policies(key,label,relation_name,predicate_sql,update_sql,retention_note) values
('archived_rewrites','Expired archived rewrite copies','public.together_message_rewrites',$p$t.status='completed' and t.previous_message<>'{}'::jsonb and exists(select 1 from together_messages m where m.id=t.message_id and m.provider_metadata ? 'retentionPurgedAt')$p$,'previous_message=''{}''::jsonb','Remove duplicate text after archive expiry; keep rewrite identity.'),
('archived_voice_events','Expired archived transcript copies','public.together_voice_call_transcript_events',$p$t.content<>'[Archived message expired]' and exists(select 1 from together_messages m where m.id=t.canonical_message_id and m.provider_metadata ? 'retentionPurgedAt')$p$,'content=''[Archived message expired]''','Remove canonicalized transcript copies after archive expiry.'),
('ops_audit_details','Older Ops audit details','public.together_ops_audit_log',$p$t.created_at < $1-interval '12 months' and (t.metadata<>'{}'::jsonb or t.reason_safe is not null) and not exists(select 1 from together_support_tickets s where s.id::text=t.target_id and (s.status not in ('resolved','closed') or s.category in ('billing','safety'))) and not exists(select 1 from together_ops_incidents i where i.id::text=t.target_id and i.status<>'resolved')$p$,'metadata=''{}''::jsonb,reason_safe=null','Twelve months; retain actor/action/request identifiers and protect linked disputes.'),
('support_event_details','Older support event notes','public.together_ops_ticket_events',$p$exists(select 1 from together_support_tickets s where s.id=t.ticket_id and s.metadata ? 'retentionPurgedAt') and (t.note_safe is not null or t.previous_state<>'{}'::jsonb or t.next_state<>'{}'::jsonb)$p$,'note_safe=null,previous_state=''{}''::jsonb,next_state=''{}''::jsonb','Minimize supporting case notes after the case retention policy completes.');

-- Other preserved media-provider metadata currently consists of compact route,
-- quality-flag and cost fields; there is no raw provider response to purge.
revoke all on function public.kivelle_storage_path_referenced(text),public.kivelle_audit_orphan_objects(integer),public.kivelle_allow_orphan_removal(uuid),public.kivelle_record_orphan_removal(),public.kivelle_retention_storage_status() from public,anon,authenticated;
grant execute on function public.kivelle_audit_orphan_objects(integer),public.kivelle_allow_orphan_removal(uuid),public.kivelle_retention_storage_status() to service_role;
create or replace function public.kivelle_run_retention(p_dry_run boolean default true,p_batch integer default 500,p_policy text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='25s' set lock_timeout='2s' as $$
declare rule record; item record; cutoff timestamptz=now(); started timestamptz=clock_timestamp();
 run_id bigint; candidates integer; processed integer; row_count integer; query text; predicate text; outcome jsonb='{}';
begin
 if p_batch is null or p_batch<1 or p_batch>1000 or p_dry_run is null then raise exception 'RETENTION_INVALID_ARGUMENT'; end if;
 if not pg_try_advisory_xact_lock(74640,1) then return jsonb_build_object('busy',true); end if;
 insert into together_retention_runs(dry_run) values(p_dry_run) returning id into run_id;
 for rule in select * from together_retention_policies where key<>'orphan_objects' and (p_policy is null or key=p_policy) and (p_dry_run or enabled) order by case when key='support_content' then 2 else 1 end,key loop
 exit when clock_timestamp()-started>interval '20 seconds';
 candidates=0;processed=0;
 begin
 predicate=format('(%s) and not exists(select 1 from public.together_retention_holds h where h.policy_key=%L and h.record_id in (''*'',coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''runid'',to_jsonb(t)->>''conversation_id'')) and (h.expires_at is null or h.expires_at>$1))',rule.predicate_sql,rule.key);
 -- Row locks are held through rollup and deletion, preventing double aggregation.
 query=format('select t.ctid as tid,to_jsonb(t) as data from %s t where %s limit $2 for update of t skip locked',rule.relation_name,predicate);
 for item in execute query using cutoff,p_batch loop
 candidates=candidates+1;
 if not p_dry_run then
 if rule.update_sql is null then
 execute format('delete from %s t where ctid=$3 and %s',rule.relation_name,predicate) using cutoff,p_batch,item.tid;
 else
 execute format('update %s t set %s where ctid=$3 and %s',rule.relation_name,rule.update_sql,predicate) using cutoff,p_batch,item.tid;
 end if;
 get diagnostics row_count=row_count;
 if row_count>0 then
 if rule.rollup_kind is not null then perform kivelle_retention_rollup(rule.rollup_kind,item.data); end if;
 processed=processed+row_count;
 end if;
 end if;
 end loop;
 outcome=outcome||jsonb_build_object(rule.key,jsonb_build_object('candidates',candidates,'processed',processed,'batchFull',candidates=p_batch));
 if not p_dry_run then
 update together_retention_policies set last_run_at=cutoff,last_success_at=cutoff,last_error=null,last_candidates=candidates,last_processed=processed,total_processed=total_processed+processed where key=rule.key;
 end if;
 exception when others then
 -- Only SQLSTATE is exposed: SQL errors can otherwise contain private row values.
 outcome=outcome||jsonb_build_object(rule.key,jsonb_build_object('error',sqlstate));
 if not p_dry_run then update together_retention_policies set last_run_at=cutoff,last_error=sqlstate where key=rule.key; end if;
 end;
 end loop;
 update together_retention_runs set finished_at=clock_timestamp(),result=outcome where id=run_id;
 return outcome;
end $$;
select cron.schedule('kivelli-orphan-file-audit','43 * * * *','select public.kivelle_audit_orphan_objects(2)');
commit;
