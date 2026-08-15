begin;

alter table public.together_generated_media
  add column if not exists queue_priority integer not null default 0 check(queue_priority between 0 and 20);

create index if not exists together_generated_media_priority_dispatch_idx
  on public.together_generated_media(status,queue_priority desc,next_attempt_at,created_at)
  where status in ('queued','generating');

create or replace function public.kivelle_claim_media_jobs(p_limit integer default 5)
returns setof public.together_generated_media
language plpgsql security definer set search_path=public,extensions as $$
begin
  return query
  with claimable as (
    select id from public.together_generated_media
    where status='queued' and coalesce(next_attempt_at,'-infinity'::timestamptz)<=now()
    order by queue_priority desc,created_at
    for update skip locked
    limit least(greatest(p_limit,1),20)
  )
  update public.together_generated_media media
  set status='generating',claimed_at=now(),attempt_count=media.attempt_count+1,updated_at=now()
  from claimable where media.id=claimable.id returning media.*;
end $$;
revoke all on function public.kivelle_claim_media_jobs(integer) from public,anon,authenticated;
grant execute on function public.kivelle_claim_media_jobs(integer) to service_role;

commit;
