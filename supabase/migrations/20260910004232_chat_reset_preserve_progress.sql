create or replace function public.kivelli_reset_chat(p_user uuid,p_continuity uuid,p_conversation uuid,p_mode text,p_request uuid,p_scenario_session uuid default null,p_opening text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare old_chat public.together_conversations%rowtype; fresh public.together_conversations%rowtype; receipt public.together_conversation_reset_receipts%rowtype; target public.together_scenario_sessions%rowtype; saved record; paths text[]; result jsonb; prior_session_count integer;
begin
 if p_mode not in('conversation','scenario') then raise exception 'Invalid reset mode';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':chat-reset:'||p_request::text,0));
 select * into receipt from public.together_conversation_reset_receipts where user_id=p_user and request_id=p_request;
 if found then
  if receipt.conversation_id<>p_conversation or receipt.continuity_id<>p_continuity or receipt.mode<>p_mode then raise exception 'Reset request mismatch';end if;
  return receipt.result;
 end if;
 select * into old_chat from public.together_conversations where id=p_conversation and user_id=p_user and continuity_id=p_continuity and kind in('direct','first_meeting') and user_archived_at is null;
 if not found then raise exception 'Conversation unavailable';end if;
 perform 1 from public.together_character_instances where id=old_chat.character_instance_id and user_id=p_user and continuity_id=p_continuity for update;
 select * into old_chat from public.together_conversations where id=p_conversation and user_id=p_user and continuity_id=p_continuity and user_archived_at is null for update;
 if not found then raise exception 'Conversation unavailable';end if;
 select conversation_session_count into prior_session_count from public.together_relationship_states where character_instance_id=old_chat.character_instance_id and user_id=p_user for update;
 if exists(select 1 from public.together_generated_media where user_id=p_user and conversation_id=p_conversation and status in('queued','generating')) then raise exception 'Wait for the current reply or media request to finish before resetting';end if;
 if exists(select 1 from public.together_dialogue_turns where conversation_id=p_conversation and state not in('completed','cancelled','failed','yielded') and lease_expires_at>now()) then raise exception 'Wait for the current reply to finish before resetting';end if;
 if p_mode='scenario' then
  select * into target from public.together_scenario_sessions where id=p_scenario_session and user_id=p_user and continuity_id=p_continuity and conversation_id=p_conversation for update;
  if not found or nullif(p_opening,'') is null then raise exception 'Scenario unavailable in this conversation';end if;
 end if;
 select coalesce(array_agg(storage_path) filter(where storage_path is not null),'{}'::text[]) into paths from public.together_conversation_attachments where user_id=p_user and conversation_id=p_conversation;
 -- Free the active-chat slot without invoking archive hooks on the scenario yet.
 -- Save/rebind scenario sessions first using a temporarily archived replacement.
 insert into public.together_conversations(user_id,continuity_id,character_instance_id,kind,title,metadata,archived_at,last_read_at)
 values(p_user,p_continuity,old_chat.character_instance_id,old_chat.kind,old_chat.title,jsonb_strip_nulls(jsonb_build_object('chatPreferences',old_chat.metadata->'chatPreferences','pinned',old_chat.metadata->'pinned')),now(),now()) returning * into fresh;
 for saved in select * from public.together_scenario_sessions where conversation_id=p_conversation and user_id=p_user for update loop
  update public.together_scenario_sessions set conversation_id=fresh.id,current_location_id=current_location_id,updated_at=now() where id=saved.id;
 end loop;
 update public.together_proactive_messages set status=case when status='queued' then 'cancelled' else 'opened' end,updated_at=now() where user_id=p_user and conversation_id=p_conversation and status in('queued','sent');
 update public.together_scene_sessions set ended_at=greatest(now(),started_at),updated_at=now() where user_id=p_user and conversation_id=p_conversation and ended_at is null and shared_plan_id is null;
 delete from public.together_conversations where id=p_conversation and user_id=p_user;
 update public.together_conversations set archived_at=null,updated_at=now() where id=fresh.id returning * into fresh;
 if p_mode='scenario' then
  update public.together_scenario_sessions set status='paused',updated_at=now() where id=target.id;
  update public.together_scenario_sessions set status='active',current_location_id=(select location_id from public.together_scenario_definitions where id=target.scenario_id),started_at=now(),updated_at=now() where id=target.id;
  insert into public.together_messages(user_id,conversation_id,character_instance_id,role,content,delivery_status,provider_metadata,content_rating,visibility_scope,moderation_version)
  values(p_user,fresh.id,old_chat.character_instance_id,'assistant',p_opening,'complete',jsonb_build_object('scenarioId',target.scenario_id,'scenarioSessionId',target.id,'source','scenario_opening'),'suggestive','all','scenario-catalogue-v1');
 end if;
 update public.together_relationship_states set conversation_session_count=prior_session_count where character_instance_id=old_chat.character_instance_id and user_id=p_user and prior_session_count is not null;
 result:=jsonb_build_object('conversationId',fresh.id,'characterInstanceId',old_chat.character_instance_id,'mode',p_mode,'storagePaths',to_jsonb(paths));
 insert into public.together_conversation_reset_receipts(user_id,request_id,continuity_id,conversation_id,mode,result) values(p_user,p_request,p_continuity,p_conversation,p_mode,result);
 return result;
end $$;
revoke all on function public.kivelli_reset_chat(uuid,uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelli_reset_chat(uuid,uuid,uuid,text,uuid,uuid,text) to service_role;
