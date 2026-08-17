begin;

alter table public.together_relationship_states
  add column if not exists engagement_score numeric(8,3) not null default 0,
  add column if not exists genuine_back_and_forth_turns integer not null default 0,
  add column if not exists trivial_engagement_score numeric(6,3) not null default 0,
  add column if not exists chemistry_heat numeric(6,2) not null default 0,
  add column if not exists physical_tension numeric(6,2) not null default 0,
  add column if not exists user_flirt_signals integer not null default 0,
  add column if not exists character_flirt_signals integer not null default 0,
  add column if not exists mutual_flirt_signals integer not null default 0,
  add column if not exists attraction_acknowledged boolean not null default false,
  add column if not exists last_chemistry_change_at timestamptz,
  add column if not exists last_flirt_signal_at timestamptz;

alter table public.together_relationship_states drop constraint if exists together_relationship_engagement_score_check;
alter table public.together_relationship_states add constraint together_relationship_engagement_score_check check(engagement_score>=0);
alter table public.together_relationship_states drop constraint if exists together_relationship_genuine_turns_check;
alter table public.together_relationship_states add constraint together_relationship_genuine_turns_check check(genuine_back_and_forth_turns>=0);
alter table public.together_relationship_states drop constraint if exists together_relationship_trivial_engagement_check;
alter table public.together_relationship_states add constraint together_relationship_trivial_engagement_check check(trivial_engagement_score between 0 and 1.75);
alter table public.together_relationship_states drop constraint if exists together_relationship_chemistry_heat_check;
alter table public.together_relationship_states add constraint together_relationship_chemistry_heat_check check(chemistry_heat between 0 and 100);
alter table public.together_relationship_states drop constraint if exists together_relationship_physical_tension_check;
alter table public.together_relationship_states add constraint together_relationship_physical_tension_check check(physical_tension between 0 and 100);
alter table public.together_relationship_states drop constraint if exists together_relationship_flirt_signal_counts_check;
alter table public.together_relationship_states add constraint together_relationship_flirt_signal_counts_check check(user_flirt_signals>=0 and character_flirt_signals>=0 and mutual_flirt_signals>=0);

comment on column public.together_relationship_states.engagement_score is 'Cumulative reciprocal conversation engagement. Memory creation alone does not imply relationship significance.';
comment on column public.together_relationship_states.genuine_back_and_forth_turns is 'User turns that meaningfully answer, reciprocate, or contribute; independent of message length.';
comment on column public.together_relationship_states.trivial_engagement_score is 'Lifetime low-information acknowledgment contribution, hard capped at 1.75.';
comment on column public.together_relationship_states.chemistry_heat is 'Persistent romantic/physical chemistry, independent from formal relationship stage.';
comment on column public.together_relationship_states.physical_tension is 'Persistent physical tension signal. It does not grant consent or provider capability.';

-- Preserve every existing stage. Existing strangers are backfilled below the new
-- gate so migration alone cannot manufacture a Keep in touch milestone.
update public.together_relationship_states relationship set
  engagement_score=case when instance.relationship_stage='stranger'
    then least(5.5,coalesce(relationship.meaningful_interaction_count,0)*1.5+least(coalesce(relationship.interaction_turn_count,relationship.conversation_count,0),6)*.35)
    else greatest(6,relationship.engagement_score) end,
  genuine_back_and_forth_turns=case when instance.relationship_stage='stranger'
    then least(2,coalesce(relationship.meaningful_interaction_count,0)+case when coalesce(relationship.interaction_turn_count,relationship.conversation_count,0)>=3 then 1 else 0 end)
    else greatest(3,relationship.genuine_back_and_forth_turns) end,
  chemistry_heat=greatest(relationship.chemistry_heat,case instance.relationship_stage
    when 'flirting' then least(55,greatest(28,(relationship.attraction+relationship.romantic_interest)*.45))
    when 'dating' then least(68,greatest(38,(relationship.attraction+relationship.romantic_interest)*.5))
    when 'exclusive' then least(72,greatest(42,(relationship.attraction+relationship.romantic_interest)*.52))
    when 'long_term' then least(76,greatest(45,(relationship.attraction+relationship.romantic_interest)*.52))
    when 'friend' then least(25,greatest(0,(relationship.attraction+relationship.romantic_interest-30)*.25))
    else least(15,greatest(0,(relationship.attraction+relationship.romantic_interest-35)*.2)) end),
  updated_at=relationship.updated_at
from public.together_character_instances instance
where instance.id=relationship.character_instance_id;

update public.together_relationship_states set
  chemistry_heat=least(chemistry_heat,15),
  physical_tension=least(physical_tension,10),
  attraction_acknowledged=false
where romance_path_status='friends_only';

-- Retain the mature V2 evaluator for every later stage, while placing one
-- authoritative engagement gate in front of its Stranger transition.
do $$
begin
  if to_regprocedure('public.kivelle_relationship_progression_state_pre_chemistry_v2(uuid,uuid,timestamptz)') is null then
    alter function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz)
      rename to kivelle_relationship_progression_state_pre_chemistry_v2;
  end if;
end $$;

create or replace function public.kivelle_relationship_progression_state(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  result jsonb;
  stage text;
  score numeric:=0;
  genuine_turns integer:=0;
  blockers text[]:='{}';
  blocker text;
  eligible boolean:=false;
  presentable boolean:=false;
begin
  result:=public.kivelle_relationship_progression_state_pre_chemistry_v2(p_user_id,p_character_instance_id,p_now);
  select instance.relationship_stage,relationship.engagement_score,relationship.genuine_back_and_forth_turns
    into stage,score,genuine_turns
  from public.together_relationship_states relationship
  join public.together_character_instances instance on instance.id=relationship.character_instance_id
  where relationship.user_id=p_user_id and relationship.character_instance_id=p_character_instance_id;
  if stage is distinct from 'stranger' then return result; end if;

  for blocker in select jsonb_array_elements_text(coalesce(result->'blockers','[]'::jsonb)) loop
    if blocker<>'needs_meaningful_interaction' then blockers:=array_append(blockers,blocker); end if;
  end loop;
  eligible:=score>=6 and genuine_turns>=3;
  if score<6 then blockers:=array_append(blockers,'needs_more_engagement'); end if;
  if genuine_turns<3 then blockers:=array_append(blockers,'needs_more_reciprocal_turns'); end if;
  presentable:=eligible and not (blockers && array['active_commitment','unresolved_missed_commitment','companion_busy','poor_moment','milestone_cooldown']::text[]);
  result:=jsonb_set(result,'{eligible}',to_jsonb(eligible),true);
  result:=jsonb_set(result,'{presentable}',to_jsonb(presentable),true);
  result:=jsonb_set(result,'{blockers}',to_jsonb(blockers),true);
  result:=jsonb_set(result,'{evidence,engagementScore}',to_jsonb(score),true);
  result:=jsonb_set(result,'{evidence,genuineBackAndForthTurns}',to_jsonb(genuine_turns),true);
  return result;
end $$;
revoke all on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.kivelle_relationship_progression_state(uuid,uuid,timestamptz) to service_role;

create or replace function public.kivelle_relationship_chemistry_guard() returns trigger language plpgsql set search_path=public as $$
begin
  new.engagement_score:=greatest(0,coalesce(new.engagement_score,0));
  new.genuine_back_and_forth_turns:=greatest(0,coalesce(new.genuine_back_and_forth_turns,0));
  new.trivial_engagement_score:=greatest(0,least(1.75,coalesce(new.trivial_engagement_score,0)));
  new.chemistry_heat:=greatest(0,least(100,coalesce(new.chemistry_heat,0)));
  new.physical_tension:=greatest(0,least(100,coalesce(new.physical_tension,0)));
  new.user_flirt_signals:=greatest(0,coalesce(new.user_flirt_signals,0));
  new.character_flirt_signals:=greatest(0,coalesce(new.character_flirt_signals,0));
  new.mutual_flirt_signals:=greatest(0,coalesce(new.mutual_flirt_signals,0));
  if new.romance_path_status='friends_only' then
    new.chemistry_heat:=least(new.chemistry_heat,15);
    new.physical_tension:=least(new.physical_tension,10);
    new.attraction_acknowledged:=false;
  end if;
  return new;
end $$;
drop trigger if exists together_relationship_chemistry_guard on public.together_relationship_states;
create trigger together_relationship_chemistry_guard before insert or update of
  engagement_score,genuine_back_and_forth_turns,trivial_engagement_score,chemistry_heat,physical_tension,
  user_flirt_signals,character_flirt_signals,mutual_flirt_signals,romance_path_status
on public.together_relationship_states for each row execute function public.kivelle_relationship_chemistry_guard();

create index if not exists together_relationship_engagement_idx on public.together_relationship_states(user_id,engagement_score,genuine_back_and_forth_turns);

do $$
declare relationship_row record;
begin
  for relationship_row in select user_id,character_instance_id from public.together_relationship_states loop
    perform public.kivelle_evaluate_relationship_progression(relationship_row.user_id,relationship_row.character_instance_id,now());
  end loop;
end $$;

commit;
