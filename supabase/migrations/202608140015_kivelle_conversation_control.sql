-- Conversation ownership, read state, reset transactions, and PhotoGen-safe deletion semantics.
alter table public.together_conversations add column if not exists last_read_at timestamptz;
alter table public.together_conversations add column if not exists last_assistant_message_at timestamptz;
update public.together_conversations conversation set last_assistant_message_at=(select max(message.created_at) from public.together_messages message where message.conversation_id=conversation.id and message.role='assistant') where last_assistant_message_at is null;
update public.together_conversations set kind='direct',updated_at=now() where kind='introduction' and archived_at is null;

with ranked as (
  select id,row_number() over(partition by user_id,character_instance_id order by coalesce(last_message_at,created_at) desc,id desc) as position
  from public.together_conversations
  where archived_at is null and kind in ('direct','first_meeting')
)
update public.together_conversations conversation
set archived_at=now(),updated_at=now()
from ranked where ranked.id=conversation.id and ranked.position>1;

create unique index if not exists together_conversations_one_active_direct_idx
on public.together_conversations(user_id,character_instance_id)
where archived_at is null and kind in ('direct','first_meeting');
create index if not exists together_conversations_history_idx on public.together_conversations(user_id,character_instance_id,archived_at,last_message_at desc);
create index if not exists together_messages_page_idx on public.together_messages(conversation_id,created_at desc,id desc);

create table if not exists public.together_destructive_action_audit(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  character_instance_id uuid references public.together_character_instances(id) on delete set null,
  action_type text not null check(action_type in ('conversation_deleted','companion_memories_reset','relationship_reset','companion_full_reset')),
  result_status text not null check(result_status in ('completed','failed')),created_at timestamptz not null default now()
);
alter table public.together_destructive_action_audit enable row level security;
create policy "Users read their destructive action audit" on public.together_destructive_action_audit for select using(auth.uid()=user_id);

create table if not exists public.together_storage_cleanup_jobs(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null,storage_path text not null,status text not null default 'pending' check(status in ('pending','complete')),
  attempt_count integer not null default 0,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists together_storage_cleanup_pending_idx on public.together_storage_cleanup_jobs(status,created_at) where status='pending';
alter table public.together_storage_cleanup_jobs enable row level security;

create or replace function public.kivelle_start_conversation(p_user_id uuid,p_character_instance_id uuid)
returns public.together_conversations language plpgsql security definer set search_path=public,extensions as $$
declare created public.together_conversations;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));
  update public.together_conversations set archived_at=now(),updated_at=now()
    where user_id=p_user_id and character_instance_id=p_character_instance_id and archived_at is null and kind in ('direct','first_meeting');
  insert into public.together_conversations(user_id,character_instance_id,kind,title,summary,summary_through,summary_message_count,last_read_at)
    values(p_user_id,p_character_instance_id,'direct',to_char(current_timestamp,'FMDay FMMonth DD'),null,null,0,now()) returning * into created;
  return created;
end $$;

create or replace function public.kivelle_reset_companion(p_user_id uuid,p_character_instance_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare media_paths text[]:=array[]::text[]; new_conversation_id uuid; now_at timestamptz:=now();
begin
  if p_mode not in ('memory','relationship','full') then raise exception 'invalid reset mode'; end if;
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if not exists(select 1 from public.together_character_instances where id=p_character_instance_id and user_id=p_user_id) then raise exception 'companion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_character_instance_id::text,0));

  if p_mode in ('memory','full') then
    if p_mode='memory' then
      update public.together_memories set status='forgotten',embedding=null,pinned=false,updated_at=now_at where user_id=p_user_id and character_instance_id=p_character_instance_id and status='active';
    else
      delete from public.together_memories where user_id=p_user_id and character_instance_id=p_character_instance_id;
    end if;
    delete from public.together_open_threads where user_id=p_user_id and character_instance_id=p_character_instance_id;
  end if;

  if p_mode in ('relationship','full') then
    update public.together_relationship_states set
      trust=default,comfort=default,attraction=default,affinity=default,familiarity=default,respect=default,
      conflict=default,romantic_interest=default,commitment=default,conversation_count=default,
      active_major_conflict=default,recent_direction=default,updated_at=now_at
      where user_id=p_user_id and character_instance_id=p_character_instance_id;
    update public.together_character_instances set relationship_stage='stranger',updated_at=now_at where id=p_character_instance_id and user_id=p_user_id;
    delete from public.together_relationship_milestones where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_date_choices where date_session_id in(select id from public.together_date_sessions where user_id=p_user_id and character_instance_id=p_character_instance_id);
    update public.together_date_sessions set status='locked',current_phase='arrival',phase_index=0,scheduled_for=null,started_at=null,completed_at=null,state='{}'::jsonb,updated_at=now_at where user_id=p_user_id and character_instance_id=p_character_instance_id;
  end if;

  if p_mode='full' then
    select coalesce(array_agg(storage_path) filter(where storage_path is not null),array[]::text[]) into media_paths from public.together_generated_media where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_generated_media where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_proactive_messages where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_story_arc_instances where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_moments where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_life_events where user_id=p_user_id and character_instance_id=p_character_instance_id;
    delete from public.together_conversations where user_id=p_user_id and character_instance_id=p_character_instance_id;
    update public.together_character_instances set relationship_stage='stranger',contact_added_at=null,introduced_at=now_at,
      current_mood=case character_template_id when '12000000-0000-4000-8000-000000000002'::uuid then 'adventurous' when '12000000-0000-4000-8000-000000000003'::uuid then 'thoughtful' else 'curious' end,
      current_location_id=case character_template_id when '12000000-0000-4000-8000-000000000002'::uuid then '11000000-0000-4000-8000-000000000003'::uuid when '12000000-0000-4000-8000-000000000003'::uuid then '11000000-0000-4000-8000-000000000005'::uuid else '11000000-0000-4000-8000-000000000001'::uuid end,
      current_activity=case character_template_id when '12000000-0000-4000-8000-000000000002'::uuid then 'heading to Skyline Rooftop' when '12000000-0000-4000-8000-000000000003'::uuid then 'finishing a photo walk' else 'waiting for coffee' end,
      current_energy='medium',last_simulated_at=now_at,last_event_simulated_at=now_at,simulation_seed=encode(extensions.gen_random_bytes(12),'hex'),metadata='{}'::jsonb,updated_at=now_at where id=p_character_instance_id and user_id=p_user_id;
    insert into public.together_conversations(user_id,character_instance_id,kind,title,last_read_at) values(p_user_id,p_character_instance_id,'first_meeting','First Conversations',now_at) returning id into new_conversation_id;
  end if;

  insert into public.together_destructive_action_audit(user_id,character_instance_id,action_type,result_status) values(p_user_id,p_character_instance_id,case p_mode when 'memory' then 'companion_memories_reset' when 'relationship' then 'relationship_reset' else 'companion_full_reset' end,'completed');
  return jsonb_build_object('mode',p_mode,'conversationId',new_conversation_id,'storagePaths',to_jsonb(media_paths));
end $$;

create or replace function public.kivelle_delete_conversation(p_user_id uuid,p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare target public.together_conversations; media_paths text[]:=array[]::text[]; new_conversation_id uuid; was_active boolean;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  select * into target from public.together_conversations where id=p_conversation_id and user_id=p_user_id for update;
  if target.id is null then raise exception 'conversation not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||target.character_instance_id::text,0));
  was_active:=target.archived_at is null and target.kind in ('direct','first_meeting');
  select coalesce(array_agg(media.storage_path) filter(where media.storage_path is not null),array[]::text[])
    into media_paths
    from public.together_generated_media media
    where media.user_id=p_user_id and media.message_id in(select id from public.together_messages where conversation_id=p_conversation_id)
      and media.moment_id is null and media.date_session_id is null and media.life_event_id is null;
  delete from public.together_generated_media media
    where media.user_id=p_user_id and media.message_id in(select id from public.together_messages where conversation_id=p_conversation_id)
      and media.moment_id is null and media.date_session_id is null and media.life_event_id is null;
  delete from public.together_conversations where id=p_conversation_id and user_id=p_user_id;
  if was_active then
    insert into public.together_conversations(user_id,character_instance_id,kind,title,summary,summary_through,summary_message_count,last_read_at)
      values(p_user_id,target.character_instance_id,'direct',to_char(current_timestamp,'FMDay FMMonth DD'),null,null,0,now())
      returning id into new_conversation_id;
  end if;
  insert into public.together_destructive_action_audit(user_id,character_instance_id,action_type,result_status)
    values(p_user_id,target.character_instance_id,'conversation_deleted','completed');
  return jsonb_build_object('deleted',true,'characterInstanceId',target.character_instance_id,'conversationId',new_conversation_id,'storagePaths',to_jsonb(media_paths));
end $$;

create or replace function public.kivelle_prune_deleted_message_references() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.together_moments set source_message_ids=array_remove(source_message_ids,old.id),updated_at=now() where old.id=any(source_message_ids);
  return old;
end $$;
drop trigger if exists together_message_reference_cleanup on public.together_messages;
create trigger together_message_reference_cleanup before delete on public.together_messages for each row execute function public.kivelle_prune_deleted_message_references();

create or replace function public.kivelle_reject_archived_conversation_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.together_conversations where id=new.conversation_id and archived_at is not null) then raise exception using errcode='23514',message='CONVERSATION_ARCHIVED'; end if;
  return new;
end $$;
drop trigger if exists together_message_active_conversation_guard on public.together_messages;
create trigger together_message_active_conversation_guard before insert on public.together_messages for each row execute function public.kivelle_reject_archived_conversation_message();

create or replace function public.kivelle_update_conversation_message_state() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.together_conversations set last_message_at=new.created_at,last_assistant_message_at=case when new.role='assistant' then new.created_at else last_assistant_message_at end,updated_at=new.created_at where id=new.conversation_id;
  return new;
end $$;
drop trigger if exists together_message_conversation_state on public.together_messages;
create trigger together_message_conversation_state after insert on public.together_messages for each row execute function public.kivelle_update_conversation_message_state();

grant execute on function public.kivelle_start_conversation(uuid,uuid) to authenticated,service_role;
grant execute on function public.kivelle_reset_companion(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.kivelle_delete_conversation(uuid,uuid) to authenticated,service_role;
grant select on public.together_destructive_action_audit to authenticated;
