create or replace function public.kivelle_begin_plan_experience(p_user_id uuid,p_continuity_id uuid,p_character_instance_id uuid,p_plan_id uuid,p_request_id text,p_now timestamptz default now(),p_source text default 'app') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;ids uuid[];
begin
 select array_append(participant_instance_ids,character_instance_id) into ids from public.together_shared_plans where id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=p_character_instance_id;
 if ids is null then raise exception 'commitment is unavailable';end if;
 perform 1 from public.together_character_instances where id=any(ids) and user_id=p_user_id and continuity_id=p_continuity_id order by id for update;
 if exists(select 1 from public.together_scenario_sessions where user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=any(ids) and status='active') and p_source<>'scenario_confirmed' then raise exception 'SCENARIO_PAUSE_REQUIRED: Join this event and pause the scenario?';end if;
 update public.together_scenario_sessions set status='paused',updated_at=now() where user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=any(ids) and status='active';
 result:=public.kivelle_begin_plan_experience_before_scenarios(p_user_id,p_continuity_id,p_character_instance_id,p_plan_id,p_request_id,p_now,case when p_source='scenario_confirmed' then 'app' else p_source end);
 update public.together_character_instances i set current_location_id=p.location_id,current_activity=p.title,current_presence_source='plan',updated_at=now() from public.together_shared_plans p where p.id=p_plan_id and i.id=any(ids) and i.user_id=p_user_id and i.continuity_id=p_continuity_id;
 return result;
end $$;