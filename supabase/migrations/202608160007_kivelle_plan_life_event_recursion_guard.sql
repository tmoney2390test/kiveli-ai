begin;

-- A plan may create its own preparation/waiting life beats. Those derived
-- records describe the plan; they must never be interpreted as an authored
-- event that changes the plan's attendance state again.
create or replace function public.kivelle_apply_life_event_commitment_impact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  impact text;
  plan_id uuid;
  eta timestamptz;
begin
  if new.metadata ? 'canonicalPlanId' then
    return new;
  end if;

  impact := nullif(new.metadata ->> 'commitmentImpact', '');
  if impact not in ('late', 'absent', 'cancelled') then
    return new;
  end if;

  select plan.id
    into plan_id
    from public.together_shared_plans plan
   where plan.user_id = new.user_id
     and plan.character_instance_id = new.character_instance_id
     and plan.status in ('scheduled', 'active')
     and plan.starts_at is not null
     and plan.starts_at <= coalesce(new.ends_at, new.starts_at + interval '4 hours') + interval '2 hours'
     and plan.ends_at >= new.starts_at - interval '2 hours'
   order by abs(extract(epoch from (plan.starts_at - new.starts_at)))
   limit 1;

  if plan_id is null then
    return new;
  end if;

  if impact = 'late' then
    eta := coalesce(new.ends_at, new.starts_at + interval '30 minutes');
  end if;

  perform public.kivelle_mark_character_commitment_exception(
    plan_id,
    impact,
    coalesce(new.narrative_summary, new.title),
    eta
  );
  return new;
end;
$$;

-- Avoid issuing a no-op UPDATE. A repeated authored event should never fire
-- the plan's life-beat trigger chain again once the canonical state is set.
create or replace function public.kivelle_mark_character_commitment_exception(
  p_plan_id uuid,
  p_state text,
  p_reason text default null,
  p_eta timestamptz default null
)
returns public.together_shared_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.together_shared_plans%rowtype;
  normalized_reason text := nullif(btrim(p_reason), '');
  normalized_eta timestamptz := case when p_state = 'late' then p_eta else null end;
begin
  if p_state not in ('late', 'absent', 'cancelled', 'expected') then
    raise exception 'invalid companion state';
  end if;

  update public.together_shared_plans
     set companion_state = p_state,
         companion_reason = normalized_reason,
         companion_eta_at = normalized_eta,
         updated_at = now()
   where id = p_plan_id
     and (
       companion_state is distinct from p_state
       or companion_reason is distinct from normalized_reason
       or companion_eta_at is distinct from normalized_eta
     )
  returning * into result;

  if result.id is null then
    select * into result
      from public.together_shared_plans
     where id = p_plan_id;
  end if;
  return result;
end;
$$;

revoke all on function public.kivelle_mark_character_commitment_exception(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.kivelle_mark_character_commitment_exception(uuid, text, text, timestamptz)
  to service_role;

commit;

