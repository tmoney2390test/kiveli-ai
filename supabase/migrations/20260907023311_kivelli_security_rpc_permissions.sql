-- These operations are authorized by the Edge Function before using its server client.
-- An authenticated client must not bypass suspension, rate-limit, and ownership checks.
revoke all on function public.kivelle_delete_conversation(uuid,uuid) from public, anon, authenticated;
revoke all on function public.kivelle_reset_companion(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.kivelle_restore_conversation(uuid,uuid) from public, anon, authenticated;
revoke all on function public.kivelle_start_conversation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.kivelle_delete_conversation(uuid,uuid) to service_role;
grant execute on function public.kivelle_reset_companion(uuid,uuid,text) to service_role;
grant execute on function public.kivelle_restore_conversation(uuid,uuid) to service_role;
grant execute on function public.kivelle_start_conversation(uuid,uuid) to service_role;
