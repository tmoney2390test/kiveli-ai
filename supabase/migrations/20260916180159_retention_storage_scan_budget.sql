begin;
create or replace function public.kivelle_storage_path_referenced(p_path text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare rel record; found_ref boolean;
begin
 if p_path is null or length(p_path)<12 then return true; end if;
 for rel in select c.oid::regclass as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname not like 'together_retention_%'
 and c.relname<>'together_storage_cleanup_jobs'
 order by case when c.relname in ('together_generated_media','together_conversation_attachments','together_account_exports','together_creator_assets','together_media_provider_jobs','together_media_reference_assets') then 0 else 1 end,c.relname loop
 execute format('select exists(select 1 from %s t where strpos(to_jsonb(t)::text,$1)>0)',rel.name) into found_ref using p_path;
 if found_ref then return true; end if;
 end loop;
 return false;
end $$;
-- One object per hourly scan caps the expensive unknown-reference fallback.
select cron.schedule('kivelli-orphan-file-audit','43 * * * *','select public.kivelle_audit_orphan_objects(1)');
commit;
