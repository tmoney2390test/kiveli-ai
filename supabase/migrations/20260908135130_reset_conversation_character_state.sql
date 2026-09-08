-- Keep every relationship reset aligned with the current character and
-- relationship schema. The original reset predates life state, chemistry,
-- evidence, reflections, and other derived affinity records.
begin;

create or replace function public.kivelle_reset_companion(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_mode text
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  media_paths text[]:=array[]::text[];
  new_conversation_id uuid;
  now_at timestamptz:=now();
  target_continuity_id uuid;
begin
  if p_mode not in ('memory','relationship','full') then raise exception 'invalid reset mode'; end if;
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;

  select instance.continuity_id into target_continuity_id
  from public.together_character_instances instance
  where instance.id=p_character_instance_id and instance.user_id=p_user_id
  for update;
  if target_continuity_id is null then raise exception 'companion not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));

  if p_mode in ('memory','full') then
    if p_mode='memory' then
      update public.together_memories set status='forgotten',embedding=null,pinned=false,updated_at=now_at
      where user_id=p_user_id and character_instance_id=p_character_instance_id and status='active';
    else
      delete from public.together_memories
      where user_id=p_user_id and character_instance_id=p_character_instance_id;
    end if;
    delete from public.together_open_threads
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
  end if;

  if p_mode in ('relationship','full') then
    -- Remove every derived relationship input before recreating the canonical
    -- state row. Re-insertion intentionally uses database defaults so this
    -- operation stays aligned with future baseline changes (currently trust 30).
    delete from public.together_relationship_milestones
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_relationship_evidence
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_relationship_active_days
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_relationship_reflections
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_relationship_place_visits
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_relationship_places
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_character_place_opinion_evidence
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_companion_user_patterns
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_emotional_residue
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_missed_plan_resolutions
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_initiative_state
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_character_social_states
    where user_id=p_user_id and continuity_id=target_continuity_id
      and (character_a_instance_id=p_character_instance_id or character_b_instance_id=p_character_instance_id);

    delete from public.together_relationship_states
    where user_id=p_user_id and character_instance_id=p_character_instance_id;

    update public.together_character_instances set
      relationship_stage='stranger',
      met_at=now_at,
      life_state='alive',
      life_state_summary=null,
      life_state_changed_at=null,
      life_state_source_message_id=null,
      life_state_metadata='{}'::jsonb,
      updated_at=now_at
    where id=p_character_instance_id and user_id=p_user_id and continuity_id=target_continuity_id;

    insert into public.together_relationship_states(character_instance_id,user_id,continuity_id)
    values(p_character_instance_id,p_user_id,target_continuity_id);

    delete from public.together_date_choices
    where date_session_id in(
      select id from public.together_date_sessions
      where user_id=p_user_id and character_instance_id=p_character_instance_id
    );
    update public.together_date_sessions set
      status='locked',current_phase='arrival',phase_index=0,scheduled_for=null,
      started_at=null,completed_at=null,state='{}'::jsonb,updated_at=now_at
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
  end if;

  if p_mode='full' then
    select coalesce(array_agg(storage_path) filter(where storage_path is not null),array[]::text[])
    into media_paths
    from public.together_generated_media
    where user_id=p_user_id and character_instance_id=p_character_instance_id;

    delete from public.together_generated_media
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_proactive_messages
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_story_arc_instances
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_moments
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_life_events
    where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_conversations
    where user_id=p_user_id and character_instance_id=p_character_instance_id;

    update public.together_character_instances set
      relationship_stage='stranger',contact_added_at=null,introduced_at=now_at,
      current_mood=case character_template_id
        when '12000000-0000-4000-8000-000000000002'::uuid then 'adventurous'
        when '12000000-0000-4000-8000-000000000003'::uuid then 'thoughtful'
        else 'curious' end,
      current_location_id=case character_template_id
        when '12000000-0000-4000-8000-000000000002'::uuid then '11000000-0000-4000-8000-000000000003'::uuid
        when '12000000-0000-4000-8000-000000000003'::uuid then '11000000-0000-4000-8000-000000000005'::uuid
        else '11000000-0000-4000-8000-000000000001'::uuid end,
      current_activity=case character_template_id
        when '12000000-0000-4000-8000-000000000002'::uuid then 'heading to Skyline Rooftop'
        when '12000000-0000-4000-8000-000000000003'::uuid then 'finishing a photo walk'
        else 'waiting for coffee' end,
      current_energy='medium',last_simulated_at=now_at,last_event_simulated_at=now_at,
      simulation_seed=encode(extensions.gen_random_bytes(12),'hex'),metadata='{}'::jsonb,updated_at=now_at
    where id=p_character_instance_id and user_id=p_user_id;

    insert into public.together_conversations(user_id,character_instance_id,kind,title,last_read_at)
    values(p_user_id,p_character_instance_id,'first_meeting','First Conversations',now_at)
    returning id into new_conversation_id;
  end if;

  insert into public.together_destructive_action_audit(user_id,character_instance_id,action_type,result_status)
  values(
    p_user_id,p_character_instance_id,
    case p_mode when 'memory' then 'companion_memories_reset' when 'relationship' then 'relationship_reset' else 'companion_full_reset' end,
    'completed'
  );
  return jsonb_build_object('mode',p_mode,'conversationId',new_conversation_id,'storagePaths',to_jsonb(media_paths));
end $$;

revoke all on function public.kivelle_reset_companion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelle_reset_companion(uuid,uuid,text) to service_role;
comment on function public.kivelle_reset_companion(uuid,uuid,text) is
  'Atomically resets owned companion memory or complete relationship state, including life state and all derived affinity records.';

commit;
