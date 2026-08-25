begin;

create or replace function public.kivelle_dialogue_context_core(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = public
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
    )
  );
$$;

revoke all on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) to service_role;

comment on function public.kivelle_dialogue_context_core(uuid,uuid,uuid) is
  'Returns the small user/relationship context bundle used by dialogue compilation in one service-only round trip.';

commit;
