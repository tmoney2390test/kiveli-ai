begin;

-- Reconstruct due commitments before the ordinary progress function runs. This is
-- intentionally separate from client presence: the companion's canonical arrival
-- does not depend on the user having the app open at the scheduled start time.
create or replace function public.kivelle_catch_up_due_commitments(p_user_id uuid,p_character_instance_id uuid,p_now timestamptz default now()) returns void language plpgsql security definer set search_path=public as $$
declare plan_row public.together_shared_plans%rowtype; miss_kind text;
begin
  for plan_row in select * from public.together_shared_plans where user_id=p_user_id and character_instance_id=p_character_instance_id and status='scheduled' and starts_at is not null and starts_at<=p_now order by starts_at for update
  loop
    if plan_row.companion_state in('absent','cancelled') then
      miss_kind:=case when plan_row.companion_state='cancelled' then 'cancelled' else 'character_absent' end;
      update public.together_shared_plans set status=case when miss_kind='cancelled' then 'cancelled' else 'missed' end,missed_at=case when miss_kind='cancelled' then missed_at else coalesce(missed_at,p_now) end,miss_reason=miss_kind,cancelled_at=case when miss_kind='cancelled' then coalesce(cancelled_at,p_now) else cancelled_at end,updated_at=p_now where id=plan_row.id;
      insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata,resolved_at)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',miss_kind,'{}'::jsonb,jsonb_build_object('companionReason',plan_row.companion_reason,'noUserPenalty',true,'offlineCatchUp',true),p_now)
      on conflict(plan_id) do update set status='resolved',miss_reason=excluded.miss_reason,impact_applied='{}'::jsonb,metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,resolved_at=p_now,updated_at=p_now;
      continue;
    end if;
    if plan_row.companion_state='expected' or (plan_row.companion_state='late' and coalesce(plan_row.companion_eta_at,plan_row.starts_at)<=p_now) then
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,'character',plan_row.character_instance_id,case when plan_row.companion_state='late' then coalesce(plan_row.companion_eta_at,plan_row.starts_at) else plan_row.starts_at end,'system',jsonb_build_object('companionState',plan_row.companion_state,'offlineCatchUp',true)) on conflict do nothing;
    end if;
    update public.together_shared_plans set status='active',grace_ends_at=coalesce(grace_ends_at,starts_at+make_interval(mins=>grace_minutes)),updated_at=p_now where id=plan_row.id and status='scheduled';
  end loop;
end $$;
revoke all on function public.kivelle_catch_up_due_commitments(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_catch_up_due_commitments(uuid,uuid,timestamptz) to service_role;

commit;
