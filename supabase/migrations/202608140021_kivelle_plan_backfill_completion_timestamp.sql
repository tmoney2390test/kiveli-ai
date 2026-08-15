update public.together_shared_plans
set completed_at = coalesce(ends_at, updated_at, now()),
    updated_at = now()
where status = 'completed'
  and completed_at is null;
