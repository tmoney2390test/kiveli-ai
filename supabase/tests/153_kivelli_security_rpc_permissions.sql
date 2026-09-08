begin;
select plan(12);
select ok(not has_function_privilege('anon', signature, 'execute'), signature || ' rejects anonymous callers')
from unnest(array['public.kivelle_delete_conversation(uuid,uuid)','public.kivelle_reset_companion(uuid,uuid,text)','public.kivelle_restore_conversation(uuid,uuid)','public.kivelle_start_conversation(uuid,uuid)']) signature;
select ok(not has_function_privilege('authenticated', signature, 'execute'), signature || ' requires backend authorization')
from unnest(array['public.kivelle_delete_conversation(uuid,uuid)','public.kivelle_reset_companion(uuid,uuid,text)','public.kivelle_restore_conversation(uuid,uuid)','public.kivelle_start_conversation(uuid,uuid)']) signature;
select ok(has_function_privilege('service_role', signature, 'execute'), signature || ' remains available to backend')
from unnest(array['public.kivelle_delete_conversation(uuid,uuid)','public.kivelle_reset_companion(uuid,uuid,text)','public.kivelle_restore_conversation(uuid,uuid)','public.kivelle_start_conversation(uuid,uuid)']) signature;
select * from finish();
rollback;
