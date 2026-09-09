begin;
create table public.together_world_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  version integer not null default 0 check(version>=0),
  state jsonb not null default '{}'::jsonb check(jsonb_typeof(state)='object'),
  updated_at timestamptz not null default now(),
  primary key(continuity_id,world_id)
);
create table public.together_world_progress_actions (
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  world_id uuid not null references public.together_worlds(id) on delete cascade,
  request_id text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(continuity_id,world_id,request_id)
);
alter table public.together_world_progress enable row level security;
alter table public.together_world_progress_actions enable row level security;
revoke all on public.together_world_progress,public.together_world_progress_actions from public,anon,authenticated;
grant select,insert,update,delete on public.together_world_progress,public.together_world_progress_actions to service_role;

create or replace function public.kivelle_commit_world_progress(p_user_id uuid,p_continuity_id uuid,p_world_id uuid,p_expected_version integer,p_request_id text,p_state jsonb,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_version integer; old_state jsonb; existing_result jsonb; transition jsonb;
begin
  if not exists(select 1 from together_continuities where id=p_continuity_id and user_id=p_user_id) then raise exception 'WORLD_PROGRESS_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtext(p_continuity_id::text||p_world_id::text));
  select result into existing_result from together_world_progress_actions where continuity_id=p_continuity_id and world_id=p_world_id and request_id=p_request_id and user_id=p_user_id;
  if found then return existing_result; end if;
  select version,state into old_version,old_state from together_world_progress where continuity_id=p_continuity_id and world_id=p_world_id and user_id=p_user_id for update;
  if coalesce(old_version,0)<>p_expected_version then raise exception 'WORLD_PROGRESS_CONFLICT'; end if;
  insert into together_world_progress(user_id,continuity_id,world_id,version,state) values(p_user_id,p_continuity_id,p_world_id,p_expected_version+1,p_state)
  on conflict(continuity_id,world_id) do update set version=excluded.version,state=excluded.state,updated_at=now();
  insert into together_world_progress_actions(user_id,continuity_id,world_id,request_id,result) values(p_user_id,p_continuity_id,p_world_id,p_request_id,p_result);
  for transition in select value from jsonb_array_elements(coalesce(p_state->'transitions','[]'::jsonb))
    where value->>'kind' in ('absence','relocation') and not coalesce(old_state->'transitions','[]'::jsonb) @> jsonb_build_array(value)
  loop
    -- A saved departure takes priority over previously accepted plans. End the
    -- in-person scene and defer affected dates in this same transaction.
    update together_shared_plans p set status='cancelled',cancelled_at=now(),updated_at=now(),metadata=p.metadata||jsonb_build_object('cancelledByWorldStory',transition->>'arcSlug')
    where p.user_id=p_user_id and p.continuity_id=p_continuity_id and p.world_id=p_world_id and p.status in('proposed','scheduled','active')
      and exists(select 1 from together_character_instances i where i.user_id=p_user_id and i.continuity_id=p_continuity_id and i.character_template_id=(transition->>'departingCharacterId')::uuid and (i.id=p.character_instance_id or i.id=any(p.participant_instance_ids)))
      and coalesce(p.ends_at,'infinity'::timestamptz)>(transition->>'recordedAt')::timestamptz
      and (transition->>'kind'='relocation' or coalesce(p.starts_at,now())<(transition->>'returnAt')::timestamptz);
    update together_date_sessions d set status='deferred',updated_at=now(),state=d.state||jsonb_build_object('deferredByWorldStory',transition->>'arcSlug')
    from together_character_instances i where d.character_instance_id=i.id and d.user_id=p_user_id and d.continuity_id=p_continuity_id
      and i.character_template_id=(transition->>'departingCharacterId')::uuid and d.status in('upcoming','active')
      and (transition->>'kind'='relocation' or coalesce(d.scheduled_for,d.started_at,now())<(transition->>'returnAt')::timestamptz);
    update together_scene_sessions s set ended_at=now(),updated_at=now() from together_character_instances i
    where s.character_instance_id=i.id and s.user_id=p_user_id and s.continuity_id=p_continuity_id and s.ended_at is null
      and i.character_template_id=(transition->>'departingCharacterId')::uuid;
  end loop;
  -- Rebuild only the affected world's passive schedules after a saved transition.
  delete from together_character_schedule_events e using together_character_instances i,together_character_world_presence p
  where e.character_instance_id=i.id and i.character_version_id=p.character_version_id and p.world_id=p_world_id
    and e.user_id=p_user_id and i.continuity_id=p_continuity_id and e.source in('recurring','generated') and e.ends_at>now();
  return p_result;
end $$;
revoke all on function public.kivelle_commit_world_progress(uuid,uuid,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_commit_world_progress(uuid,uuid,uuid,integer,text,jsonb,jsonb) to service_role;

-- An unknown hideout is not reachable through the raw authenticated catalog either.
create policy location_saved_access on public.together_locations as restrictive for select to anon,authenticated
using (coalesce(access_metadata->>'publicMapVisible','true')<>'false');
create policy calders_schedule_server_projection on public.together_schedule_templates as restrictive for select to anon,authenticated
using (coalesce(metadata->>'source','')<>'calders_run_authoring_v1');
create policy calders_home_server_projection on public.together_character_homes as restrictive for select to anon,authenticated
using (world_id<>'31740169-035e-5b10-8c9d-98b206e9f24b'::uuid);
commit;

;
