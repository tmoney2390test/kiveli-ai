-- Together proactive Life System: deterministic event identity, message delivery identity,
-- and a secured half-hour dispatcher.

alter table public.together_life_events add column if not exists simulation_key text;
update public.together_life_events set simulation_key = 'legacy:' || id::text where simulation_key is null or simulation_key = '';
alter table public.together_life_events alter column simulation_key set not null;
create unique index if not exists together_life_events_simulation_key_uidx on public.together_life_events(character_instance_id,simulation_key);

alter table public.together_proactive_messages add column if not exists dedupe_key text;
alter table public.together_proactive_messages add column if not exists context jsonb not null default '{}'::jsonb;
update public.together_proactive_messages set dedupe_key = 'legacy:' || id::text where dedupe_key is null or dedupe_key = '';
alter table public.together_proactive_messages alter column dedupe_key set not null;
create unique index if not exists together_proactive_messages_dedupe_uidx on public.together_proactive_messages(character_instance_id,dedupe_key);

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'together-life-dispatch' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'together-life-dispatch',
    '*/30 * * * *',
    $dispatch$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'together_project_url') || '/functions/v1/together-life-dispatch',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-together-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'together_life_dispatch_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    $dispatch$
  );
end $$;

comment on column public.together_life_events.simulation_key is 'Deterministic key that makes lazy and scheduled simulation idempotent.';
comment on column public.together_proactive_messages.dedupe_key is 'One proactive communication per underlying event or open thread.';
comment on column public.together_proactive_messages.context is 'Application-owned delivery context; never model-authoritative state.';
