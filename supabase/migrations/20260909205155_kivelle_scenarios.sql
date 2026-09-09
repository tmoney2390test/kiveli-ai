create table public.together_scenario_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  conversation_id uuid not null references public.together_conversations(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete cascade,
  scenario_id text not null check (scenario_id ~ '^(jun|por|neo|ves|nor|eos|vha|cal)-[0-9]{2}$'),
  status text not null default 'active' check (status in ('active','paused','completed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,continuity_id,scenario_id)
);
create unique index together_scenario_one_active on public.together_scenario_sessions(conversation_id) where status='active';
create index together_scenario_user_life on public.together_scenario_sessions(user_id,continuity_id,updated_at desc);
alter table public.together_scenario_sessions enable row level security;
revoke all on public.together_scenario_sessions from anon,authenticated;
grant select on public.together_scenario_sessions to authenticated;
grant all on public.together_scenario_sessions to service_role;
create policy scenario_owner_read on public.together_scenario_sessions for select to authenticated using ((select auth.uid())=user_id);

-- Internal service-only transaction: serialized per conversation, idempotent per
-- Life/scenario. The server supplies reviewed catalogue content, never the client.
create or replace function public.together_start_scenario(
 p_user uuid,p_continuity uuid,p_conversation uuid,p_character uuid,p_template uuid,p_scenario text,p_opening text
) returns public.together_scenario_sessions language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.together_scenario_sessions;
begin
 perform 1 from public.together_conversations c join public.together_character_instances i on i.id=p_character
 where c.id=p_conversation and c.user_id=p_user and c.character_instance_id=i.id and c.continuity_id=p_continuity and c.user_archived_at is null
 and i.user_id=p_user and i.continuity_id=p_continuity and i.character_template_id=p_template
 for update of c;
 if not found then raise exception 'Scenario conversation unavailable' using errcode='42501'; end if;
 select * into result from public.together_scenario_sessions where user_id=p_user and continuity_id=p_continuity and scenario_id=p_scenario;
 if found and result.conversation_id<>p_conversation then
   raise exception 'Resume this scenario from its original conversation' using errcode='23514';
 end if;
 update public.together_scenario_sessions set status='paused',updated_at=now() where conversation_id=p_conversation and status='active' and scenario_id<>p_scenario;
 if result.id is null then
   insert into public.together_scenario_sessions(user_id,continuity_id,conversation_id,character_instance_id,scenario_id)
   values(p_user,p_continuity,p_conversation,p_character,p_scenario) returning * into result;
   insert into public.together_messages(user_id,conversation_id,character_instance_id,role,content,delivery_status,provider_metadata,content_rating,visibility_scope,moderation_version)
   values(p_user,p_conversation,p_character,'assistant',p_opening,'complete',jsonb_build_object('scenarioId',p_scenario,'scenarioSessionId',result.id,'source','scenario_opening'),'suggestive','all','scenario-catalogue-v1');
 else
   update public.together_scenario_sessions set status='active',updated_at=now() where id=result.id returning * into result;
 end if;
 return result;
end $$;
revoke all on function public.together_start_scenario(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.together_start_scenario(uuid,uuid,uuid,uuid,uuid,text,text) to service_role;
