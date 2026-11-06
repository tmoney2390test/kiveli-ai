-- Native iOS dialogue defaults to a non-explicit ceiling. Only the service
-- role may read or change this release control; clients receive a safe boolean
-- projection from authenticated Edge Functions.
create table public.together_ops_content_controls (
  control_key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.together_ops_content_controls (control_key, enabled)
values ('ios_explicit_dialogue', false)
on conflict (control_key) do nothing;

alter table public.together_ops_content_controls enable row level security;
revoke all on table public.together_ops_content_controls from public, anon, authenticated;
grant select, update on table public.together_ops_content_controls to service_role;

create function public.kivelle_ops_set_ios_explicit_dialogue(
  p_actor_user_id uuid,
  p_expected_enabled boolean,
  p_enabled boolean,
  p_reason text,
  p_request_id text
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  current_row public.together_ops_content_controls%rowtype;
begin
  if p_actor_user_id is null or p_enabled is null or p_expected_enabled is null
    or length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'CONTENT_CONTROL_INVALID';
  end if;
  select * into current_row from public.together_ops_content_controls
    where control_key = 'ios_explicit_dialogue' for update;
  if not found then raise exception 'CONTENT_CONTROL_MISSING'; end if;
  if current_row.enabled is distinct from p_expected_enabled then
    raise exception 'CONTENT_CONTROL_STALE';
  end if;
  if current_row.enabled is distinct from p_enabled then
    update public.together_ops_content_controls
      set enabled = p_enabled, updated_at = now(), updated_by = p_actor_user_id
      where control_key = 'ios_explicit_dialogue'
      returning * into current_row;
    insert into public.together_ops_audit_log
      (actor_user_id, actor_role, action, target_type, target_id, request_id, reason_safe, metadata)
    values
      (p_actor_user_id, 'admin', 'ios_explicit_dialogue_changed', 'content_control',
       'ios_explicit_dialogue', left(p_request_id, 160), left(btrim(p_reason), 500),
       jsonb_build_object('previousEnabled', p_expected_enabled, 'enabled', p_enabled));
  end if;
  return jsonb_build_object('enabled', current_row.enabled,
    'updatedAt', current_row.updated_at, 'updatedBy', current_row.updated_by);
end $$;

revoke all on function public.kivelle_ops_set_ios_explicit_dialogue(uuid, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.kivelle_ops_set_ios_explicit_dialogue(uuid, boolean, boolean, text, text)
  to service_role;
