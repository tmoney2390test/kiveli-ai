begin;

-- The normal chat allowance spans the account; isolated branch Lives have their
-- own existing allowance and do not consume another normal chat slot.
create or replace function public.kivelle_active_conversation_count(p_user_id uuid)
returns integer language sql stable set search_path=public as $$
  select count(*)::integer from public.together_conversations c
  where c.user_id=p_user_id and c.kind in ('direct','first_meeting','group')
    and c.archived_at is null and c.user_archived_at is null
    and not exists(select 1 from public.together_continuities l
      where l.id=c.continuity_id and l.user_id=p_user_id and l.kind='branch')
$$;

create or replace function public.kivelle_enforce_active_conversation_limit()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare active_count integer; active_limit integer;
begin
  if new.kind not in ('direct','first_meeting','group') or new.archived_at is not null
    or new.user_archived_at is not null or exists(select 1 from together_continuities l
      where l.id=new.continuity_id and l.user_id=new.user_id and l.kind='branch') then return new; end if;
  if tg_op='UPDATE' then
    if old.user_id=new.user_id and old.continuity_id is not distinct from new.continuity_id
      and old.kind in ('direct','first_meeting','group') and old.archived_at is null
      and old.user_archived_at is null then return new; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||new.user_id::text,0));
  active_limit:=kivelle_active_conversation_limit(new.user_id);
  select count(*)::integer into active_count from together_conversations c
    where c.user_id=new.user_id and c.id<>new.id and c.kind in ('direct','first_meeting','group')
      and c.archived_at is null and c.user_archived_at is null
      and not exists(select 1 from together_continuities l where l.id=c.continuity_id and l.user_id=new.user_id and l.kind='branch');
  if active_count>=active_limit then raise exception 'ACTIVE_CONVERSATION_LIMIT_REACHED:%',active_limit; end if;
  return new;
end $$;
drop trigger if exists together_conversations_active_limit on public.together_conversations;
create trigger together_conversations_active_limit before insert or update of kind,archived_at,user_archived_at,user_id,continuity_id
  on public.together_conversations for each row execute function public.kivelle_enforce_active_conversation_limit();

-- Preserve the complete branch implementation and its independent 20/50 cap;
-- remove only the obsolete normal-chat admission check. Fail closed if it changed.
do $patch$
declare definition text; old_guard text:= $guard$  select count(*)::integer into v_active_count from public.together_conversations
    where user_id=p_user_id and archived_at is null and user_archived_at is null
      and kind in ('direct','first_meeting','group');
  v_limit:=public.kivelle_active_conversation_limit(p_user_id);
  if v_active_count>=v_limit then raise exception 'ACTIVE_CONVERSATION_LIMIT_REACHED:%',v_limit; end if;$guard$;
begin
  select pg_get_functiondef('public.kivelle_start_chat_branch(uuid,uuid,uuid,uuid)'::regprocedure) into definition;
  if position(old_guard in definition)=0 then raise exception 'BRANCH_ADMISSION_DEFINITION_CHANGED'; end if;
  execute replace(definition,old_guard,'  -- Branch creation uses its separate branch allowance.');
end $patch$;

create or replace function public.kivelle_manage_chat_list(p_user_id uuid,p_category text default 'active',p_offset integer default 0,p_limit integer default 50)
returns jsonb language sql stable set search_path=public as $$
  with chats as materialized (
    select c.id,c.continuity_id,c.character_instance_id,c.kind,c.title,c.archived_at,c.last_message_at,c.created_at,
      coalesce(l.title,'Main Life') as life_title,coalesce(l.kind='branch',false) as is_branch,
      coalesce(t.name,case when c.kind='group' then 'Group chat' else 'Companion' end) as companion_name
    from together_conversations c
    left join together_continuities l on l.id=c.continuity_id and l.user_id=p_user_id
    left join together_character_instances i on i.id=c.character_instance_id and i.user_id=p_user_id
    left join together_character_templates t on t.id=i.character_template_id
    where c.user_id=p_user_id and c.user_archived_at is null and c.kind in ('direct','first_meeting','group')
  ), page as (
    select * from chats where case p_category when 'branches' then is_branch
      when 'archived' then not is_branch and archived_at is not null
      when 'active' then not is_branch and archived_at is null else false end
    order by coalesce(last_message_at,created_at) desc,id desc
    offset greatest(0,p_offset) limit greatest(1,least(p_limit,100))
  )
  select jsonb_build_object('activeCount',(select count(*) from chats where not is_branch and archived_at is null),
    'archivedCount',(select count(*) from chats where not is_branch and archived_at is not null),
    'branchCount',(select count(*) from chats where is_branch),
    'limit',kivelle_active_conversation_limit(p_user_id),
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by coalesce(last_message_at,created_at) desc,id desc) from page),'[]'::jsonb))
$$;

create or replace function public.kivelle_save_chats_to_history(p_user_id uuid,p_conversation_ids uuid[])
returns jsonb language plpgsql set search_path=public,extensions as $$
declare ids uuid[]; saved uuid[]; busy uuid[]; stamp timestamptz:=now();
begin
  select array_agg(distinct id) into ids from unnest(p_conversation_ids) id where id is not null;
  if coalesce(cardinality(ids),0) not between 1 and 50 then raise exception 'INVALID_CHAT_SELECTION'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  perform 1 from together_conversations where id=any(ids) and user_id=p_user_id order by id for update;
  if (select count(*) from together_conversations c where c.id=any(ids) and c.user_id=p_user_id
    and c.user_archived_at is null and c.kind in ('direct','first_meeting','group')
    and not exists(select 1 from together_continuities l where l.id=c.continuity_id and l.user_id=p_user_id and l.kind='branch'))<>cardinality(ids)
    then raise exception 'CHAT_SELECTION_UNAVAILABLE'; end if;
  select coalesce(array_agg(distinct conversation_id),'{}'::uuid[]) into busy from together_dialogue_turns
    where user_id=p_user_id and conversation_id=any(ids) and state in ('planning','generating');
  select coalesce(array_agg(id),'{}'::uuid[]) into saved from unnest(ids) id where not id=any(busy);
  update together_conversations set archived_at=coalesce(archived_at,stamp),updated_at=stamp
    where user_id=p_user_id and id=any(saved) and archived_at is null;
  update together_proactive_messages set status='cancelled',updated_at=stamp
    where user_id=p_user_id and conversation_id=any(saved) and status='queued';
  -- Deliberately leave user_archived_at and restore_until null. No removal timer,
  -- message deletion, attachment deletion, or media-generation cancellation.
  return jsonb_build_object('archivedIds',saved,'busyIds',busy,'activeCount',kivelle_active_conversation_count(p_user_id));
end $$;

create or replace function public.kivelle_resume_saved_chat(p_user_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql set search_path=public,extensions as $$
declare target together_conversations; current_ids uuid[]; stamp timestamptz:=now();
begin
  perform pg_advisory_xact_lock(hashtextextended('kivelle-active-conversations:'||p_user_id::text,0));
  select * into target from together_conversations where id=p_conversation_id and user_id=p_user_id for update;
  if not found or target.user_archived_at is not null or target.kind not in ('direct','first_meeting','group')
    or exists(select 1 from together_continuities where id=target.continuity_id and user_id=p_user_id and kind='branch')
    then raise exception 'CHAT_SELECTION_UNAVAILABLE'; end if;
  if target.archived_at is not null then
    select coalesce(array_agg(id),'{}'::uuid[]) into current_ids from together_conversations
      where user_id=p_user_id and continuity_id=target.continuity_id and character_instance_id=target.character_instance_id
        and target.kind<>'group' and kind in ('direct','first_meeting') and id<>target.id
        and archived_at is null and user_archived_at is null;
    if exists(select 1 from together_dialogue_turns where user_id=p_user_id and conversation_id=any(current_ids||array[target.id])
      and state in ('planning','generating')) then raise exception 'CHAT_REPLY_IN_PROGRESS'; end if;
    update together_conversations set archived_at=stamp,updated_at=stamp where user_id=p_user_id and id=any(current_ids);
    update together_proactive_messages set status='cancelled',updated_at=stamp where user_id=p_user_id and conversation_id=any(current_ids) and status='queued';
    update together_conversations set archived_at=null,updated_at=stamp where user_id=p_user_id and id=target.id;
    -- The existing admission trigger validates the resulting account total.
  end if;
  return jsonb_build_object('id',target.id,'continuityId',target.continuity_id,'kind',target.kind,'characterInstanceId',target.character_instance_id);
end $$;

revoke all on function public.kivelle_active_conversation_count(uuid) from public,anon,authenticated;
revoke all on function public.kivelle_manage_chat_list(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.kivelle_save_chats_to_history(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.kivelle_resume_saved_chat(uuid,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_active_conversation_count(uuid) to service_role;
grant execute on function public.kivelle_manage_chat_list(uuid,text,integer,integer) to service_role;
grant execute on function public.kivelle_save_chats_to_history(uuid,uuid[]) to service_role;
grant execute on function public.kivelle_resume_saved_chat(uuid,uuid) to service_role;
commit;
