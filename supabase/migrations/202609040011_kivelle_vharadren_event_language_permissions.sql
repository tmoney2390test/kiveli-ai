begin;

-- 010 was deployed while its source-pack audit was still running. Keep the
-- pure presentation helper private even though it contains no private canon.
revoke all on function public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.kivelle_vharadren_schedule_variants(text,text,text,integer,text,text[],text,text) to service_role;

commit;
