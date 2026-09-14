begin;
create table public.together_email_outbox (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('support_new','support_received','support_reply','support_followup','membership_welcome')),
 payload jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 error_code text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index together_email_pending on public.together_email_outbox(next_attempt_at) where status in ('pending','sending');
alter table public.together_email_outbox enable row level security;
revoke all on public.together_email_outbox from public,anon,authenticated;
grant all on public.together_email_outbox to service_role;

-- Transactional events are persisted with the business change. No message bodies,
-- private memories or internal support notes are copied into notification emails.
create function public.kivelle_queue_transactional_email() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner uuid; ticket_no bigint;
begin
 if tg_table_name='together_support_tickets' then
  insert into public.together_email_outbox(event_key,user_id,kind,payload)
  values('support-received:'||new.id,new.user_id,'support_received',jsonb_build_object('ticketNumber',new.ticket_number)) on conflict do nothing;
  insert into public.together_email_outbox(event_key,user_id,kind,payload)
  values('support-new:'||new.id,new.user_id,'support_new',jsonb_build_object('ticketNumber',new.ticket_number,'ticketId',new.id)) on conflict do nothing;
 elsif tg_table_name='together_support_replies' then
  select user_id,ticket_number into owner,ticket_no from public.together_support_tickets where id=new.ticket_id;
  insert into public.together_email_outbox(event_key,user_id,kind,payload)
  values('support-reply:'||new.id,owner,case when new.sender='support' then 'support_reply' else 'support_followup' end,jsonb_build_object('ticketNumber',ticket_no)) on conflict do nothing;
 elsif tg_table_name='together_billing_subscriptions' then
  if new.provider='revenuecat' and new.status in ('active','trialing') and coalesce(new.metadata->>'sandbox','false')<>'true' then
   if tg_op='INSERT' then
    insert into public.together_email_outbox(event_key,user_id,kind,payload)
    values('membership-welcome:'||new.user_id||':'||new.plan_key,new.user_id,'membership_welcome',jsonb_build_object('tier',new.plan_key,'interval',new.billing_interval,'store',new.metadata->>'store','trial',new.status='trialing')) on conflict do nothing;
   elsif old.status not in ('active','trialing') or old.plan_key is distinct from new.plan_key then
    insert into public.together_email_outbox(event_key,user_id,kind,payload)
    values('membership-welcome:'||new.user_id||':'||new.plan_key,new.user_id,'membership_welcome',jsonb_build_object('tier',new.plan_key,'interval',new.billing_interval,'store',new.metadata->>'store','trial',new.status='trialing')) on conflict do nothing;
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.kivelle_queue_transactional_email() from public,anon,authenticated;
grant execute on function public.kivelle_queue_transactional_email() to service_role;
create trigger support_ticket_email after insert on public.together_support_tickets for each row execute function public.kivelle_queue_transactional_email();
create trigger support_reply_email after insert on public.together_support_replies for each row execute function public.kivelle_queue_transactional_email();
create trigger membership_welcome_email after insert or update on public.together_billing_subscriptions for each row execute function public.kivelle_queue_transactional_email();

-- Attempts, including retries, reserve quota atomically across concurrent workers.
create table public.together_email_attempts(id bigint generated always as identity primary key,attempted_at timestamptz not null default now());
alter table public.together_email_attempts enable row level security;
revoke all on public.together_email_attempts from public,anon,authenticated;
grant all on public.together_email_attempts to service_role;
grant usage,select on sequence public.together_email_attempts_id_seq to service_role;
create function public.kivelle_claim_transactional_email() returns setof public.together_email_outbox
language plpgsql security invoker set search_path=public as $$
declare candidate uuid; day_start timestamptz; month_start timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('kivelli-email-quota',0));
 day_start=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 month_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if (select count(*) from public.together_email_attempts where attempted_at>=day_start)>=90
 or (select count(*) from public.together_email_attempts where attempted_at>=month_start)>=2700 then return; end if;
 -- Resend's deduplication expires after 24h. Never retry an uncertain send beyond it.
 update public.together_email_outbox set status='failed',error_code='retry_window_expired'
 where status in ('pending','sending') and first_attempt_at<now()-interval '23 hours';
 select id into candidate from public.together_email_outbox where status in ('pending','sending') and next_attempt_at<=now() order by created_at for update skip locked limit 1;
 if candidate is null then return; end if;
 insert into public.together_email_attempts default values;
 return query update public.together_email_outbox set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '10 minutes' where id=candidate returning *;
end $$;
revoke all on function public.kivelle_claim_transactional_email() from public,anon,authenticated;
grant execute on function public.kivelle_claim_transactional_email() to service_role;
select cron.schedule('kivelli-transactional-email','*/5 * * * *',$$
 select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='together_project_url') || '/functions/v1/together-email-dispatch',
 headers := jsonb_build_object('Content-Type','application/json','x-together-dispatch-secret',(select decrypted_secret from vault.decrypted_secrets where name='together_media_dispatch_secret')),body := '{}'::jsonb,timeout_milliseconds := 10000);
$$);
commit;
