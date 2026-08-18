-- Explicit production testing allowance requested for test7@test.com.
-- Use the canonical credit ledger rather than a runtime email bypass so usage,
-- refunds, and idempotency continue to behave exactly like normal media usage.
do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
    from auth.users
   where lower(email)=lower('test7@test.com')
   limit 1;

  if target_user_id is null then
    raise notice 'test7@test.com does not exist; testing credit grant skipped';
    return;
  end if;

  perform public.kivelle_grant_permanent_credits(
    target_user_id,
    5000,
    'adjustment',
    'test-account:media-testing:v1',
    'account',
    target_user_id::text,
    jsonb_build_object(
      'reason','Approved Kivelle media testing allowance',
      'scope','test7@test.com',
      'migration','202608180003'
    )
  );
end
$$;
