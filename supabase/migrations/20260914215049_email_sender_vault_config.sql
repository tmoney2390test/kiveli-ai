-- The project is at its Edge environment-secret cap. Expose only this one
-- encrypted credential to the service role, never the general decrypted view.
create function public.kivelle_email_sender_key() returns text
language sql stable security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='kivelli_resend_api_key' limit 1;
$$;
revoke all on function public.kivelle_email_sender_key() from public,anon,authenticated;
grant execute on function public.kivelle_email_sender_key() to service_role;
