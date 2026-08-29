begin;
select plan(3);

select has_column(
  'public',
  'together_voice_call_sessions',
  'first_user_response_at',
  'calls record the first finalized user response'
);
select has_column(
  'public',
  'together_voice_call_sessions',
  'billing_started_at',
  'voice billing has an explicit deferred start time'
);
select has_index(
  'public',
  'together_voice_call_sessions',
  'together_voice_call_billing_started_idx',
  'deferred billing audits are indexed'
);

select * from finish();
rollback;
