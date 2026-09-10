begin;
select plan(5);

select has_column('public','together_support_tickets','ticket_number','support tickets have a human-readable reference');
select col_not_null('public','together_support_tickets','ticket_number','every support ticket receives a reference');
select col_has_default('public','together_support_tickets','ticket_number','support references are assigned server-side');
select has_index('public','together_support_tickets','together_support_ticket_number_uidx','support references are unique and indexed');
select ok(
  has_sequence_privilege('service_role','public.together_support_ticket_number_seq','USAGE'),
  'service role can allocate support ticket numbers'
);

select * from finish();
rollback;
