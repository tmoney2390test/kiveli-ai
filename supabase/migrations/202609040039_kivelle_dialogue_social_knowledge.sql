begin;

-- Character-to-character canon belongs in the existing one-round-trip dialogue
-- context. It is resolved by template rather than by the user's contact list, so
-- a companion remembers established people before the user has met them. Private
-- user-created templates remain visible only to their owner.
create or replace function public.kivelle_dialogue_context_core(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public,pg_temp
as $$
  select jsonb_build_object(
    'profile',(
      select jsonb_build_object(
        'experience_timezone',p.experience_timezone,
        'interests',p.interests,
        'memory_categories',p.memory_categories,
        'content_preferences',p.content_preferences,
        'conversation_preferences',p.conversation_preferences,
        'multimodal_preferences',p.multimodal_preferences,
        'privacy_settings',p.privacy_settings
      ) from public.together_profiles p where p.user_id=p_user_id
    ),
    'entitlements',(
      select jsonb_build_object('entitlement_keys',e.entitlement_keys)
      from public.together_entitlements e where e.user_id=p_user_id
    ),
    'continuity',(
      select jsonb_build_object(
        'id',c.id,
        'kind',c.kind,
        'title',c.title,
        'together_user_personas',jsonb_build_array(to_jsonb(persona))
      )
      from public.together_continuities c
      join public.together_user_personas persona on persona.id=c.persona_id and persona.user_id=p_user_id
      where c.id=p_continuity_id and c.user_id=p_user_id
    ),
    'notificationPreferences',(
      select jsonb_build_object('timezone',n.timezone)
      from public.together_notification_preferences n where n.user_id=p_user_id
    ),
    'relationship',(
      select to_jsonb(r)
      from public.together_relationship_states r
      where r.user_id=p_user_id and r.character_instance_id=p_character_instance_id
    ),
    'milestone',(
      select jsonb_build_object('id',m.id,'kind',m.kind,'title',m.title,'body',m.body,'prompt',m.prompt,'choices',m.choices)
      from public.together_relationship_milestones m
      where m.user_id=p_user_id and m.character_instance_id=p_character_instance_id and m.status='pending'
      order by m.created_at desc limit 1
    ),
    'patterns',coalesce((
      select jsonb_agg(to_jsonb(pattern_row) order by pattern_row.confidence desc)
      from (
        select pattern.*
        from public.together_companion_user_patterns pattern
        where pattern.user_id=p_user_id and pattern.character_instance_id=p_character_instance_id and pattern.status='active'
        order by pattern.confidence desc limit 8
      ) pattern_row
    ),'[]'::jsonb),
    'residue',(
      select to_jsonb(residue)
      from public.together_emotional_residue residue
      where residue.user_id=p_user_id and residue.character_instance_id=p_character_instance_id
      limit 1
    ),
    'socialKnowledge',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',social.id,
          'character_template_id',social.other_template_id,
          'name',social.name,
          'slug',social.slug,
          'relationship',social.relationship_type,
          'history',social.history,
          'affinity',social.affinity,
          'trust',social.trust,
          'direction',social.direction,
          'private_tension',social.private_tension,
          'knowledge_scope',social.knowledge_scope,
          'user_has_met',social.user_has_met
        ) order by social.salience desc,social.name
      )
      from (
        select deduped.*
        from (
          select distinct on(candidate.other_template_id) candidate.*
          from (
            select
              edge.id,
              other.id as other_template_id,
              other.name,
              other.slug,
              edge.relationship_type,
              edge.history,
              edge.affinity,
              edge.trust,
              case when edge.source_template_id=current_character.character_template_id then 'outgoing' else 'incoming' end as direction,
              private_edge.private_tension,
              coalesce(private_edge.knowledge_scope,edge.metadata->>'knowledgeScope','direct') as knowledge_scope,
              exists(
                select 1
                from public.together_character_instances met
                where met.user_id=p_user_id
                  and met.continuity_id=p_continuity_id
                  and met.character_template_id=other.id
                  and met.introduced_at is not null
              ) as user_has_met,
              case when edge.source_template_id=current_character.character_template_id then 1 else 0 end as outgoing_rank,
              (case when edge.source_template_id=current_character.character_template_id then 100 else 0 end)
                + edge.affinity + edge.trust
                + case when exists(
                    select 1 from public.together_character_instances met_rank
                    where met_rank.user_id=p_user_id
                      and met_rank.continuity_id=p_continuity_id
                      and met_rank.character_template_id=other.id
                      and met_rank.introduced_at is not null
                  ) then 10 else 0 end as salience
            from public.together_character_instances current_character
            join public.together_character_relationship_edges edge
              on edge.source_template_id=current_character.character_template_id
              or edge.target_template_id=current_character.character_template_id
            join public.together_character_templates other
              on other.id=case
                when edge.source_template_id=current_character.character_template_id then edge.target_template_id
                else edge.source_template_id
              end
            left join public.together_character_relationship_private private_edge
              on private_edge.world_id=edge.world_id
              and private_edge.source_template_id=current_character.character_template_id
              and private_edge.target_template_id=other.id
            where current_character.id=p_character_instance_id
              and current_character.user_id=p_user_id
              and current_character.continuity_id=p_continuity_id
              and (
                (other.creator_id=p_user_id and other.lifecycle_status in('ready','published'))
                or (
                  other.creator_id is null
                  and other.published=true
                  and other.can_be_selected=true
                  and other.visibility<>'private'
                  and other.lifecycle_status<>'archived'
                )
              )
          ) candidate
          order by candidate.other_template_id,candidate.outgoing_rank desc,candidate.salience desc
        ) deduped
        order by deduped.salience desc,deduped.name
        limit 48
      ) social
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) to service_role;
comment on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) is
  'Server-only dialogue context including owner-scoped canonical character relationship knowledge.';

commit;
