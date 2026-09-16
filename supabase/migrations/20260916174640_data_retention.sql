begin;

-- Predicates are deployment-owned SQL, never supplied by a browser or RPC caller.
create table public.together_retention_policies (
 key text primary key, label text not null, relation_name text not null,
 predicate_sql text not null, update_sql text, rollup_kind text,
 enabled boolean not null default false, retention_note text not null,
 last_run_at timestamptz, last_success_at timestamptz, last_error text,
 last_candidates integer not null default 0, last_processed integer not null default 0,
 total_processed bigint not null default 0
);
create table public.together_retention_holds (
 policy_key text not null references public.together_retention_policies(key) on delete cascade,
 record_id text not null default '*', reason text not null, expires_at timestamptz,
 created_at timestamptz not null default now(), primary key(policy_key,record_id)
);
create table public.together_retention_daily (
 day date not null, kind text not null, dimensions jsonb not null,
 records bigint not null default 0, failures bigint not null default 0,
 duration_ms numeric not null default 0, cost_usd numeric not null default 0,
 input_tokens bigint not null default 0, output_tokens bigint not null default 0,
 primary key(day,kind,dimensions)
);
-- Daily identities preserve distinct-user/cohort calculations and cascade on account deletion.
create table public.together_retention_activity_days (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null, event_name text not null, records bigint not null,
 primary key(user_id,day,event_name)
);
create table public.together_retention_runs (
 id bigint generated always as identity primary key, started_at timestamptz not null default now(),
 finished_at timestamptz, dry_run boolean not null, result jsonb not null default '{}'
);
do $$ declare t text; begin
 foreach t in array array['together_retention_policies','together_retention_holds','together_retention_daily','together_retention_activity_days','together_retention_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.together_retention_runs_id_seq to service_role;

insert into public.together_retention_policies(key,label,relation_name,predicate_sql,update_sql,rollup_kind,retention_note) values
('asset_grants','Expired media access','public.together_adult_asset_grants',$p$t.expires_at < $1 - interval '1 day'$p$,null,null,'One day after expiry; media files remain.'),
('suggestions','Expired suggestions','public.together_dialogue_suggestion_cache',$p$t.expires_at < $1 - interval '1 day'$p$,null,null,'One day after expiry.'),
('cron_success','Successful scheduled jobs','cron.job_run_details',$p$t.status='succeeded' and t.end_time < $1 - interval '7 days'$p$,null,'cron','Seven days; daily aggregates thirteen months.'),
('cron_failure','Failed scheduled jobs','cron.job_run_details',$p$t.status='failed' and t.end_time < $1 - interval '30 days'$p$,null,'cron','Thirty days; running jobs excluded.'),
('performance','Performance events','public.together_client_performance_events',$p$t.created_at < $1 - interval '30 days'$p$,null,'performance','Thirty days raw; thirteen months daily latency buckets.'),
('analytics','Engagement events','public.together_analytics_events',$p$t.created_at < $1 - interval '90 days'$p$,null,'analytics','Ninety days raw; thirteen months daily counts and account-scoped activity.'),
('ai_usage','AI usage details','public.together_ai_usage_events',$p$t.created_at < $1 - interval '90 days'$p$,null,'ai_usage','Ninety days raw; thirteen months model/tier costs and tokens. Credit ledger excluded.'),
('cleanup_jobs','Completed file deletion jobs','public.together_storage_cleanup_jobs',$p$t.status='complete' and t.updated_at < $1 - interval '30 days' and not exists(select 1 from public.together_account_deletion_jobs j where j.status<>'complete' and t.id=any(j.storage_job_ids))$p$,null,null,'Thirty days after completion; active deletion references excluded.'),
('export_metadata','Expired export metadata','public.together_account_exports',$p$t.status in ('expired','failed') and t.storage_path is null and t.updated_at < $1 - interval '30 days'$p$,null,null,'Thirty days after expiry/failure and confirmed file removal.'),
('email_attempts','Email rate budget history','public.together_email_attempts',$p$t.attempted_at < date_trunc('month',$1 at time zone 'UTC') at time zone 'UTC' - interval '1 day'$p$,null,null,'Preserve current UTC month and one-day grace for free-plan rate budget.'),
('email_payloads','Delivered email payloads','public.together_email_outbox',$p$t.status='sent' and t.sent_at < $1 - interval '30 days' and t.payload <> '{}'::jsonb$p$,'payload=''{}''::jsonb',null,'Thirty days after delivery; event identity stays for deduplication.'),
('closed_quotes','Settled context manifests','public.together_context_quotes',$p$t.status='closed' and t.closed_at < $1 - interval '30 days' and t.manifest <> '{}'::jsonb$p$,'manifest=''{}''::jsonb',null,'Thirty days after settlement; quote, receipt and bucket accounting remain.'),
('webhook_metadata','Processed media callback details','public.together_media_provider_webhook_receipts',$p$t.processed_at < $1 - interval '90 days' and t.metadata <> '{}'::jsonb$p$,'metadata=''{}''::jsonb',null,'Ninety days after processing; callback identity retained.'),
('client_errors','Resolved client diagnostics','public.together_client_error_events',$p$t.created_at < $1 - interval '12 months' and not exists(select 1 from public.together_ops_incidents i where i.id=t.incident_id and i.status<>'resolved')$p$,null,null,'Twelve months; open incidents protected.'),
('support_replies','Resolved support replies','public.together_support_replies',$p$exists(select 1 from public.together_support_tickets s where s.id=t.ticket_id and s.status in ('resolved','closed') and greatest(s.resolved_at,s.updated_at) < $1 - interval '12 months' and s.category not in ('billing','safety') and not exists(select 1 from public.together_ops_incidents i where i.id=s.incident_id and i.status<>'resolved')) and not exists(select 1 from public.together_retention_holds h where h.policy_key='support_content' and h.record_id in ('*',t.ticket_id::text) and (h.expires_at is null or h.expires_at>$1))$p$,null,null,'Twelve months after final resolution; billing, safety and held cases excluded.'),
('support_content','Resolved support content','public.together_support_tickets',$p$t.status in ('resolved','closed') and t.resolved_at is not null and greatest(t.resolved_at,t.updated_at) < $1 - interval '12 months' and t.category not in ('billing','safety') and not (t.metadata ? 'retentionPurgedAt') and not exists(select 1 from public.together_ops_incidents i where i.id=t.incident_id and i.status<>'resolved')$p$,$u$subject='Expired support request',message='Content removed after the support retention period.',metadata=jsonb_build_object('retentionPurgedAt',$1)$u$,null,'Twelve months; compact ticket identity and recovery audit remain.'),
('routine_schedule','Past routine schedule blocks','public.together_character_schedule_events',$p$t.ends_at < $1 - interval '30 days' and t.source in ('recurring','generated') and coalesce(t.metadata->>'outcomeEligible','false')<>'true' and not exists(select 1 from public.together_character_instances i where i.current_schedule_event_id=t.id) and not exists(select 1 from public.together_character_schedule_overrides o where o.schedule_event_id=t.id) and not exists(select 1 from public.together_life_events e where e.metadata->>'scheduleEventId'=t.id::text) and not (t.metadata ?| array['sharedPlanId','scenarioSessionId','commitmentId','storyArcId'])$p$,null,null,'Thirty days after end; referenced outcomes, active blocks, plans and scenarios excluded.'),
('archived_messages','Expired archived message content','public.together_messages',$p$not (t.provider_metadata ? 'retentionPurgedAt') and exists(select 1 from public.together_conversations c where c.id=t.conversation_id and c.user_archived_at is not null and c.restore_until<$1) and not exists(select 1 from public.together_context_quotes q where q.conversation_id=t.conversation_id and q.status='reserved') and not exists(select 1 from public.together_dialogue_turns d where d.conversation_id=t.conversation_id and d.state in ('planning','generating')) and not exists(select 1 from public.together_support_tickets s where s.conversation_id=t.conversation_id and s.status not in ('resolved','closed')) and not exists(select 1 from public.together_safety_reports s where s.message_id=t.id and s.status not in ('resolved','dismissed'))$p$,$u$content='[Archived message expired]',safe_bridge=null,user_metadata='{}'::jsonb,provider_metadata=jsonb_build_object('retentionPurgedAt',$1)||case when provider_metadata ? 'contextCharge' then jsonb_build_object('contextCharge',provider_metadata->'contextCharge') else '{}'::jsonb end$u$,null,'After thirty-day archive deadline: remove message body, preserve receipt anchors, memories, episodes and saved media.'),
('retention_runs','Retention execution history','public.together_retention_runs',$p$t.finished_at < $1 - interval '30 days'$p$,null,null,'Thirty days; lifetime counters remain.'),
('daily_rollups','Expired aggregate reports','public.together_retention_daily',$p$t.day < ($1 at time zone 'UTC')::date - interval '13 months'$p$,null,null,'Thirteen months.'),
('activity_rollups','Expired daily activity','public.together_retention_activity_days',$p$t.day < ($1 at time zone 'UTC')::date - interval '13 months'$p$,null,null,'Thirteen months; also cascades on account deletion.');

create index if not exists together_retention_grants_expiry on public.together_adult_asset_grants(expires_at);
create index if not exists together_retention_performance_age on public.together_client_performance_events(created_at);
create index if not exists together_retention_cleanup_age on public.together_storage_cleanup_jobs(updated_at) where status='complete';
create index if not exists together_retention_run_age on public.together_retention_runs(finished_at);
create index if not exists together_retention_activity_age on public.together_retention_activity_days(day);

create function public.kivelle_retention_rollup(p_kind text,p_row jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d date; dims jsonb; ms numeric; cost numeric=0; failed bigint=0; bucket text; uid uuid;
begin
 d=(coalesce((p_row->>'created_at')::timestamptz,(p_row->>'start_time')::timestamptz) at time zone 'UTC')::date;
 if d is null or d < (now() at time zone 'UTC')::date-interval '13 months' then return; end if;
 ms=coalesce((p_row->>'duration_ms')::numeric,(p_row->>'latency_ms')::numeric,0);
 bucket=case when ms<=100 then '0-100' when ms<=250 then '101-250' when ms<=500 then '251-500' when ms<=1000 then '501-1000' when ms<=2500 then '1001-2500' when ms<=5000 then '2501-5000' when ms<=10000 then '5001-10000' else '10001+' end;
 if p_kind='cron' then
 dims=jsonb_build_object('jobId',p_row->>'jobid','status',p_row->>'status');
 ms=greatest(0,extract(epoch from ((p_row->>'end_time')::timestamptz-(p_row->>'start_time')::timestamptz))*1000);
 failed=case when p_row->>'status'='failed' then 1 else 0 end;
 elsif p_kind='performance' then
 dims=jsonb_build_object('surface',p_row->>'surface','operation',p_row->>'operation','platform',p_row->>'platform','version',p_row->>'app_version','build',p_row->>'build_id','latencyBucket',bucket);
 failed=case when p_row->>'success'='false' then 1 else 0 end;
 elsif p_kind='ai_usage' then
 dims=jsonb_build_object('provider',p_row->>'provider','model',p_row->>'model','operation',p_row->>'operation','tier',p_row->>'subscription_tier','latencyBucket',bucket);
 cost=coalesce((p_row->>'provider_cost_usd')::numeric,(p_row->>'estimated_cost_usd')::numeric,0);
 failed=case when p_row->>'success'='false' then 1 else 0 end;
 else
 dims=jsonb_build_object('event',p_row->>'event_name');
 uid=(p_row->>'user_id')::uuid;
 if uid is not null and exists(select 1 from auth.users where id=uid) then
 insert into together_retention_activity_days values(uid,d,p_row->>'event_name',1)
 on conflict(user_id,day,event_name) do update set records=together_retention_activity_days.records+1;
 end if;
 end if;
 insert into together_retention_daily(day,kind,dimensions,records,failures,duration_ms,cost_usd,input_tokens,output_tokens)
 values(d,p_kind,dims,1,failed,ms,cost,coalesce((p_row->>'input_tokens')::bigint,0),coalesce((p_row->>'output_tokens')::bigint,0))
 on conflict(day,kind,dimensions) do update set records=together_retention_daily.records+1,
 failures=together_retention_daily.failures+excluded.failures,duration_ms=together_retention_daily.duration_ms+excluded.duration_ms,
 cost_usd=together_retention_daily.cost_usd+excluded.cost_usd,input_tokens=together_retention_daily.input_tokens+excluded.input_tokens,output_tokens=together_retention_daily.output_tokens+excluded.output_tokens;
end $$;

create function public.kivelle_run_retention(p_dry_run boolean default true,p_batch integer default 500,p_policy text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='25s' set lock_timeout='2s' as $$
declare rule record; item record; cutoff timestamptz=now(); started timestamptz=clock_timestamp();
 run_id bigint; candidates integer; processed integer; row_count integer; query text; predicate text; outcome jsonb='{}';
begin
 if p_batch is null or p_batch<1 or p_batch>1000 or p_dry_run is null then raise exception 'RETENTION_INVALID_ARGUMENT'; end if;
 if not pg_try_advisory_xact_lock(74640,1) then return jsonb_build_object('busy',true); end if;
 insert into together_retention_runs(dry_run) values(p_dry_run) returning id into run_id;
 for rule in select * from together_retention_policies where (p_policy is null or key=p_policy) and (p_dry_run or enabled) order by case when key='support_content' then 2 else 1 end,key loop
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

create function public.kivelle_retention_status() returns jsonb language sql security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('key',key,'label',label,'enabled',enabled,'note',retention_note,'lastRunAt',last_run_at,'lastSuccessAt',last_success_at,'lastError',last_error,'lastCandidates',last_candidates,'lastProcessed',last_processed,'totalProcessed',total_processed) order by key),'[]') from together_retention_policies),
 'recentRuns',(select coalesce(jsonb_agg(r),'[]') from(select started_at,finished_at,dry_run,result from together_retention_runs order by id desc limit 5)r),
 'rollups',(select coalesce(jsonb_agg(r),'[]') from(select kind,sum(records) as records,sum(cost_usd) as cost_usd,min(day) as oldest,max(day) as newest from together_retention_daily group by kind)r),
 'attention',exists(select 1 from together_retention_policies where enabled and (last_error is not null or last_success_at is null or last_success_at<now()-interval '26 hours')),
 'holds',(select count(*) from together_retention_holds where expires_at is null or expires_at>now())
);
$$;
revoke all on function public.kivelle_retention_rollup(text,jsonb),public.kivelle_run_retention(boolean,integer,text),public.kivelle_retention_status() from public,anon,authenticated;
grant execute on function public.kivelle_run_retention(boolean,integer,text),public.kivelle_retention_status() to service_role;

-- Deployment enables individually reviewed policies after a dry run. Frequent bounded
-- batches drain backlog without a long transaction; steady-state work is small.
select cron.schedule('kivelli-data-retention','23 * * * *','select public.kivelle_run_retention(false,500)');
commit;
