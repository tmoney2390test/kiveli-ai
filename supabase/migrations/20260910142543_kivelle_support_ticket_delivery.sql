begin;

create sequence if not exists public.together_support_ticket_number_seq
  as bigint
  start with 10001;

alter table public.together_support_tickets
  add column if not exists ticket_number bigint;

alter sequence public.together_support_ticket_number_seq
  owned by public.together_support_tickets.ticket_number;

alter table public.together_support_tickets
  alter column ticket_number set default nextval('public.together_support_ticket_number_seq');

update public.together_support_tickets
set ticket_number = nextval('public.together_support_ticket_number_seq')
where ticket_number is null;

alter table public.together_support_tickets
  alter column ticket_number set not null;

create unique index if not exists together_support_ticket_number_uidx
  on public.together_support_tickets(ticket_number);

grant usage, select on sequence public.together_support_ticket_number_seq
  to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.together_support_tickets'::regclass
      and conname = 'together_support_ticket_number_positive'
  ) then
    alter table public.together_support_tickets
      add constraint together_support_ticket_number_positive
      check(ticket_number > 0);
  end if;
end
$$;

comment on column public.together_support_tickets.ticket_number is
  'Stable human-readable support reference used in user confirmations and notification subjects.';

commit;
