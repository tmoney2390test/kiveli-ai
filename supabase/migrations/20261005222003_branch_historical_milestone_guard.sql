begin;

-- Branch creation snapshots already-earned relationship milestones. The normal
-- insert guard evaluates a *new* proposal against today's evidence, which a
-- historical milestone in the new Life cannot satisfy. Accept only an exact
-- historical milestone belonging to the source Life and the same resident;
-- all ordinary milestone proposals still use the canonical evaluator.
create or replace function public.kivelle_guard_relationship_milestone_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_state jsonb;
begin
  if exists (
    select 1
    from public.together_character_instances branch_instance
    join public.together_continuities branch_life
      on branch_life.id=branch_instance.continuity_id
      and branch_life.user_id=branch_instance.user_id
    join public.together_character_instances source_instance
      on source_instance.continuity_id::text=branch_life.metadata->>'sourceContinuityId'
      and source_instance.character_template_id=branch_instance.character_template_id
      and source_instance.user_id=branch_instance.user_id
    join public.together_relationship_milestones source_milestone
      on source_milestone.character_instance_id=source_instance.id
      and source_milestone.continuity_id=source_instance.continuity_id
      and source_milestone.user_id=source_instance.user_id
    where branch_instance.id=new.character_instance_id
      and branch_instance.user_id=new.user_id
      and branch_life.id=new.continuity_id
      and branch_life.kind='branch'
      and branch_life.metadata->>'createdFrom'='chat_branch'
      and source_milestone.eligibility_key=new.eligibility_key
      and source_milestone.kind=new.kind
      and source_milestone.status=new.status
      and source_milestone.from_stage=new.from_stage
      and source_milestone.to_stage is not distinct from new.to_stage
      and source_milestone.chosen_action is not distinct from new.chosen_action
      and source_milestone.created_at=new.created_at
      and source_milestone.resolved_at is not distinct from new.resolved_at
      and source_milestone.title=new.title
      and source_milestone.body=new.body
      and source_milestone.prompt=new.prompt
  ) then
    return new;
  end if;

  v_state:=public.kivelle_relationship_progression_state(new.user_id,new.character_instance_id,now());
  if coalesce(v_state->>'kind','')<>new.kind
    or not coalesce((v_state->>'eligible')::boolean,false)
    or not coalesce((v_state->>'presentable')::boolean,false) then
    raise exception 'relationship milestone is not canonically eligible or presentable';
  end if;
  return new;
end $$;

commit;
