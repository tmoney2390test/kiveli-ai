begin;

-- Memory records are served through together-memory so entitlement and
-- privacy-only projections cannot be bypassed through the public data API.
revoke select,update,delete on table public.together_memories from authenticated;
revoke select on table public.together_relationship_reflections from authenticated;
revoke select on table public.together_companion_user_patterns from authenticated;

-- Memory continuity remains available on every tier. These grants govern the
-- subscriber-facing inspector and manual curation tools only.
update public.together_entitlements
set entitlement_keys=(
  select array_agg(distinct key order by key)
  from unnest(
    coalesce(entitlement_keys,'{}'::text[])
    || array['memory_inspector','memory_manual_control']::text[]
  ) as key
), updated_at=now()
where tier in('kivelle_plus','kivelle_max');

update public.together_entitlements
set entitlement_keys=array(
  select key
  from unnest(coalesce(entitlement_keys,'{}'::text[])) as key
  where key not in('memory_inspector','memory_manual_control')
  order by key
), updated_at=now()
where tier='free';

-- Dialogue retrieval must honor the same category privacy controls used when
-- storing new memories. Include them in the existing one-round-trip context
-- bundle rather than adding latency to each reply.
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

create or replace function public.kivelle_forget_memory_scope(
  p_user_id uuid,
  p_continuity_id uuid,
  p_character_instance_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  now_at timestamptz:=now();
  forgotten_count integer:=0;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_continuities where id=p_continuity_id and user_id=p_user_id) then raise exception 'life not found'; end if;
  if p_character_instance_id is not null and not exists(
    select 1 from public.together_character_instances
    where id=p_character_instance_id and user_id=p_user_id and continuity_id=p_continuity_id
  ) then raise exception 'companion not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_continuity_id::text||':memory-privacy',0));

  update public.together_memories
  set status='forgotten',embedding=null,pinned=false,valid_to=now_at,updated_at=now_at
  where user_id=p_user_id and continuity_id=p_continuity_id and status='active'
    and (p_character_instance_id is null or character_instance_id=p_character_instance_id);
  get diagnostics forgotten_count=row_count;

  delete from public.together_open_threads
  where user_id=p_user_id
    and character_instance_id in(
      select id from public.together_character_instances
      where user_id=p_user_id and continuity_id=p_continuity_id
        and (p_character_instance_id is null or id=p_character_instance_id)
    );

  delete from public.together_companion_user_patterns
  where user_id=p_user_id and continuity_id=p_continuity_id
    and (p_character_instance_id is null or character_instance_id=p_character_instance_id);

  return jsonb_build_object(
    'forgotten',true,
    'count',forgotten_count,
    'scope',case when p_character_instance_id is null then 'life' else 'companion' end
  );
end $$;

revoke all on function public.kivelle_forget_memory_scope(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_forget_memory_scope(uuid,uuid,uuid) to service_role;

commit;
