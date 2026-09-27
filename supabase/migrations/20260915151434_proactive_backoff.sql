-- New accounts opt in; existing saved preferences are intentionally preserved.
alter table public.together_notification_preferences alter column initiative_level set default 'off';
alter table public.together_notification_preferences alter column character_initiated_messages set default false;

-- Serialize different queued candidates targeting the same conversation. This also
-- protects older deployed workers that do not yet perform the early pacing check.
create or replace function public.kivelle_guard_proactive_pacing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prefs public.together_notification_preferences%rowtype;
  level text; base_hours numeric; conversation_hours numeric;
  user_at timestamptz; last_at timestamptz; unanswered integer;
begin
  if coalesce(new.provider_metadata->>'proactive','false') <> 'true' then return new; end if;
  perform 1 from public.together_conversations where id=new.conversation_id and user_id=new.user_id for update;
  if not found then return null; end if;
  -- Explicitly requested calendar reminders retain their independent opt-in.
  if new.provider_metadata->>'messageKind'='plan_reminder' or new.provider_metadata->>'group_plan_id' is not null
    or exists(select 1 from public.together_proactive_messages p where p.id::text=new.provider_metadata->>'proactive_message_id'
      and p.user_id=new.user_id and (p.dedupe_key like 'plan:pre:%' or p.dedupe_key like 'group-plan:pre:%')) then return new; end if;
  select * into prefs from public.together_notification_preferences where user_id=new.user_id;
  level:=coalesce(prefs.companion_initiative_levels->>new.character_instance_id::text,prefs.initiative_level,'off');
  if level='off' then return null; end if;
  base_hours:=case level when 'frequent' then 8 when 'natural' then 18 else 36 end;
  conversation_hours:=case level when 'frequent' then 3 when 'natural' then 5 else 12 end;
  select max(created_at) into user_at from public.together_messages
    where conversation_id=new.conversation_id and user_id=new.user_id and role='user' and delivery_status is distinct from 'failed';
  if user_at is null or user_at > now()-make_interval(secs=>(conversation_hours*3600)::double precision) then return null; end if;
  select max(m.created_at),count(*) filter(where m.created_at>=user_at) into last_at,unanswered
    from public.together_messages m where m.conversation_id=new.conversation_id and m.user_id=new.user_id
    and m.role='assistant' and m.provider_metadata->>'proactive'='true'
    and coalesce(m.provider_metadata->>'messageKind','')<>'plan_reminder'
    and m.provider_metadata->>'group_plan_id' is null
    and not exists(select 1 from public.together_proactive_messages p where p.id::text=m.provider_metadata->>'proactive_message_id'
      and p.user_id=new.user_id and (p.dedupe_key like 'plan:pre:%' or p.dedupe_key like 'group-plan:pre:%'));
  if unanswered>=3 or (last_at is not null and last_at>now()-make_interval(secs=>(base_hours*power(2,unanswered)*3600)::double precision)) then return null; end if;
  return new;
end $$;
revoke all on function public.kivelle_guard_proactive_pacing() from public,anon,authenticated;
drop trigger if exists kivelle_proactive_pacing_guard on public.together_messages;
create trigger kivelle_proactive_pacing_guard before insert on public.together_messages
for each row execute function public.kivelle_guard_proactive_pacing();
