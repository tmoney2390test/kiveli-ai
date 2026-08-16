begin;

-- Relationship Engine V2 schema. Runtime evaluation and evidence backfill live in
-- the next migration so existing production relationships are never evaluated
-- against a half-installed engine.
alter table public.together_relationship_states
  add column if not exists stage_entered_at timestamptz,
  add column if not exists dating_started_at timestamptz,
  add column if not exists exclusive_at timestamptz,
  add column if not exists long_term_at timestamptz,
  add column if not exists romance_path_status text not null default 'open',
  add column if not exists relationship_health_cache text not null default 'steady',
  add column if not exists evidence_summary_cache jsonb not null default '{}'::jsonb,
  add column if not exists last_major_milestone_at timestamptz,
  add column if not exists next_milestone_kind text,
  add column if not exists next_milestone_eligible_at timestamptz,
  add column if not exists next_milestone_presentable boolean not null default false,
  add column if not exists relationship_defining_date_session_id uuid references public.together_date_sessions(id) on delete set null,
  add column if not exists dating_invitation_accepted_at timestamptz,
  add column if not exists major_conflict_started_at timestamptz,
  add column if not exists last_repair_completed_at timestamptz;

alter table public.together_relationship_states drop constraint if exists together_relationship_states_romance_path_status_check;
alter table public.together_relationship_states add constraint together_relationship_states_romance_path_status_check check(romance_path_status in('open','friends_only'));
alter table public.together_relationship_states drop constraint if exists together_relationship_states_relationship_health_cache_check;
alter table public.together_relationship_states add constraint together_relationship_states_relationship_health_cache_check check(relationship_health_cache in('strained','uncertain','steady','warm','close'));

-- Preserve every current relationship stage. Timestamps are conservative backfills,
-- not inferred historical claims about exactly when a declaration happened.
update public.together_relationship_states relationship set
  stage_entered_at=coalesce(relationship.stage_entered_at,instance.updated_at,instance.created_at,now()),
  dating_started_at=case when instance.relationship_stage in('dating','exclusive','long_term') then coalesce(relationship.dating_started_at,instance.updated_at,instance.created_at,now()) else relationship.dating_started_at end,
  exclusive_at=case when instance.relationship_stage in('exclusive','long_term') then coalesce(relationship.exclusive_at,instance.updated_at,instance.created_at,now()) else relationship.exclusive_at end,
  long_term_at=case when instance.relationship_stage='long_term' then coalesce(relationship.long_term_at,instance.updated_at,instance.created_at,now()) else relationship.long_term_at end
from public.together_character_instances instance where instance.id=relationship.character_instance_id;

alter table public.together_relationship_milestones drop constraint if exists together_relationship_milestones_kind_check;
alter table public.together_relationship_milestones add constraint together_relationship_milestones_kind_check check(kind in('keep_in_touch','friendship_deepened','romantic_spark','first_date_invitation','dating_start','exclusivity','long_term','repair'));

create table if not exists public.together_relationship_evidence(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  evidence_type text not null check(evidence_type in('meaningful_conversation','romantic_signal','shared_plan_completed','date_completed','trip_completed','major_shared_moment','commitment_kept','commitment_missed','repair_completed','future_planning')),
  quality numeric(5,4) not null default .5 check(quality between 0 and 1),
  valence numeric(5,4) not null default 0 check(valence between -1 and 1),
  source_type text not null check(source_type in('message','shared_plan','date_session','trip','moment','milestone','repair','migration')),
  source_id text not null,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(character_instance_id,evidence_type,source_type,source_id)
);
create index if not exists together_relationship_evidence_character_time_idx on public.together_relationship_evidence(character_instance_id,occurred_at desc);
create index if not exists together_relationship_evidence_character_type_idx on public.together_relationship_evidence(character_instance_id,evidence_type,occurred_at desc);
create index if not exists together_relationship_evidence_active_day_idx on public.together_relationship_evidence(character_instance_id,local_date);

alter table public.together_relationship_evidence enable row level security;
drop policy if exists together_relationship_evidence_own_read on public.together_relationship_evidence;
create policy together_relationship_evidence_own_read on public.together_relationship_evidence for select to authenticated using(user_id=auth.uid());
grant select on public.together_relationship_evidence to authenticated;

create or replace function public.kivelle_relationship_local_date(p_at timestamptz,p_timezone text default 'UTC') returns date language plpgsql stable as $$
begin
  begin
    return (p_at at time zone coalesce(nullif(p_timezone,''),'UTC'))::date;
  exception when others then
    return (p_at at time zone 'UTC')::date;
  end;
end $$;

create or replace function public.kivelle_insert_relationship_evidence(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_type text,
  p_source_type text,
  p_source_id text,
  p_occurred_at timestamptz default now(),
  p_quality numeric default .5,
  p_valence numeric default 0,
  p_timezone text default 'UTC',
  p_metadata jsonb default '{}'::jsonb
) returns public.together_relationship_evidence language plpgsql security definer set search_path=public as $$
declare
  v_continuity_id uuid;
  v_result public.together_relationship_evidence%rowtype;
begin
  select instance.continuity_id into v_continuity_id
  from public.together_character_instances instance
  where instance.id=p_character_instance_id and instance.user_id=p_user_id;
  if v_continuity_id is null then return v_result; end if;

  insert into public.together_relationship_evidence(
    user_id,continuity_id,character_instance_id,evidence_type,quality,valence,
    source_type,source_id,occurred_at,local_date,metadata
  ) values(
    p_user_id,v_continuity_id,p_character_instance_id,p_type,
    greatest(0,least(1,coalesce(p_quality,.5))),
    greatest(-1,least(1,coalesce(p_valence,0))),
    p_source_type,p_source_id,coalesce(p_occurred_at,now()),
    public.kivelle_relationship_local_date(coalesce(p_occurred_at,now()),p_timezone),
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(character_instance_id,evidence_type,source_type,source_id) do update set
    quality=greatest(public.together_relationship_evidence.quality,excluded.quality),
    valence=excluded.valence,
    occurred_at=least(public.together_relationship_evidence.occurred_at,excluded.occurred_at),
    metadata=public.together_relationship_evidence.metadata||excluded.metadata
  returning * into v_result;
  return v_result;
end $$;
revoke all on function public.kivelle_insert_relationship_evidence(uuid,uuid,text,text,text,timestamptz,numeric,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_insert_relationship_evidence(uuid,uuid,text,text,text,timestamptz,numeric,numeric,text,jsonb) to service_role;

-- Date templates describe experiences, not relationship declarations. Dating is now
-- owned by the relationship-defining Date + explicit dating_start milestone.
update public.together_date_templates
set metadata=metadata #- '{completion_effects,relationship_stage}',updated_at=now()
where metadata #>> '{completion_effects,relationship_stage}' is not null;

comment on table public.together_relationship_evidence is 'Canonical relationship-history ledger. Metrics describe feeling; evidence records what actually happened; explicit milestones own stage changes.';
comment on column public.together_relationship_states.relationship_health_cache is 'Derived health is separate from stage; an exclusive or long-term relationship can still be strained.';
comment on column public.together_relationship_states.relationship_defining_date_session_id is 'The accepted first-Date path. Completing this Date can create a dating_start milestone in any world.';
comment on column public.together_relationship_states.romance_path_status is 'Explicit romance-path choice. friends_only suppresses romantic milestones until the user clearly reopens the path.';

commit;
