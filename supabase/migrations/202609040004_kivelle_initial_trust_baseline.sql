begin;

-- New companions begin with a modest presumption of good faith.
alter table public.together_relationship_states
  alter column trust set default 30;

-- Bring forward only untouched placeholder relationships created under the
-- old baseline. Any interaction, evidence, or earned consequence preserves
-- the existing score exactly as it is.
update public.together_relationship_states relationship set
  trust=30,
  last_relationship_delta='{}'::jsonb,
  recent_direction='steady',
  updated_at=now()
where relationship.trust<30
  and coalesce(relationship.interaction_turn_count,0)=0
  and coalesce(relationship.conversation_count,0)=0
  and coalesce(relationship.conversation_session_count,0)=0
  and coalesce(relationship.meaningful_interaction_count,0)=0
  and not exists(
    select 1 from public.together_relationship_evidence evidence
    where evidence.character_instance_id=relationship.character_instance_id
  );

comment on column public.together_relationship_states.trust is
  'Earned reliability and emotional safety from 0 to 100. New and previously untouched relationships begin at 30; earned scores are preserved.';

commit;
