-- Activate the annual-plan monthly credit sweep after production Vault
-- configuration is present. Secrets remain in Vault and never enter source.
do $$
declare
  v_project_url text;
  v_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'together_project_url'
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kivelle_billing_grant_secret'
  limit 1;

  if exists(select 1 from cron.job where jobname = 'kivelli-annual-monthly-credit-grants') then
    perform cron.unschedule('kivelli-annual-monthly-credit-grants');
  end if;

  -- Production has both values in Vault and receives the scheduled sweep.
  -- Fresh local, CI, and preview databases intentionally omit production
  -- secrets, so applying the schema must remain safe in those environments.
  if nullif(v_project_url, '') is not null and nullif(v_secret, '') is not null then
    perform cron.schedule(
      'kivelli-annual-monthly-credit-grants',
      '17 5 * * *',
      format($job$
        select net.http_post(
          url := %L || '/functions/v1/together-billing-grants',
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'x-kivelle-billing-grant-secret', %L
          ),
          body := '{}'::jsonb
        );
      $job$, v_project_url, v_secret)
    );
  end if;
end $$;
