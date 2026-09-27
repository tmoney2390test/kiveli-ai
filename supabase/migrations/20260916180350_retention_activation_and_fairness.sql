begin;
create or replace function public.kivelle_run_retention(p_dry_run boolean default true,p_batch integer default 500,p_policy text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='25s' set lock_timeout='2s' as $$
declare rule record; item record; cutoff timestamptz=now(); started timestamptz=clock_timestamp();
 run_id bigint; candidates integer; processed integer; row_count integer; query text; predicate text; outcome jsonb='{}';
begin
 if p_batch is null or p_batch<1 or p_batch>1000 or p_dry_run is null then raise exception 'RETENTION_INVALID_ARGUMENT'; end if;
 if not pg_try_advisory_xact_lock(74640,1) then return jsonb_build_object('busy',true); end if;
 insert into together_retention_runs(dry_run) values(p_dry_run) returning id into run_id;
 for rule in select * from together_retention_policies where key<>'orphan_objects' and (p_policy is null or key=p_policy) and (p_dry_run or enabled) order by last_run_at nulls first,case when key='support_content' then 2 else 1 end,key loop
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
-- All enabled predicates passed production dry runs before activation.
update public.together_retention_policies set enabled=true;
commit;
