alter table public.together_notification_preferences
 add column companion_quiet_hours jsonb not null default '{}' check(jsonb_typeof(companion_quiet_hours)='object'),
 add column life_quiet_hours jsonb not null default '{}' check(jsonb_typeof(life_quiet_hours)='object');

-- Patch only the supplied companion keys, under one row lock. Other settings survive.
create function public.kivelle_patch_companion_preferences(p_user_id uuid,p_character_id uuid,p_life_id uuid,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare prefs public.together_notification_preferences%rowtype; quiet jsonb; ids text[]; level text;
begin
 perform 1 from public.together_character_instances where id=p_character_id and user_id=p_user_id and continuity_id=p_life_id for update;
 if not found then raise exception 'COMPANION_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended('proactive-preferences:'||p_user_id::text,0));
 if not exists(select 1 from public.together_entitlements where user_id=p_user_id and tier in('kivelle_plus','kivelle_max','together_plus','unlimited') and (expires_at is null or expires_at>now())) then raise exception 'PROACTIVE_PAID_REQUIRED';end if;
 insert into public.together_notification_preferences(user_id) values(p_user_id) on conflict do nothing;
 select * into prefs from public.together_notification_preferences where user_id=p_user_id for update;
 if p_patch ? 'frequency' then
  level=p_patch->>'frequency';
  if level not in('default','off','occasional','natural','frequent') or level is null then raise exception 'INVALID_FREQUENCY';end if;
  prefs.companion_initiative_levels=coalesce(prefs.companion_initiative_levels,'{}')-p_character_id::text;
  if level<>'default' then prefs.companion_initiative_levels=prefs.companion_initiative_levels||jsonb_build_object(p_character_id::text,level);end if;
 end if;
 if p_patch ? 'quietHours' then
  quiet=p_patch->'quietHours';
  if quiet<>'null'::jsonb then
   if jsonb_typeof(quiet)<>'object' or coalesce(quiet->>'start','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(quiet->>'end','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or jsonb_typeof(quiet->'enabled') is distinct from 'boolean' or not exists(select 1 from pg_timezone_names where name=quiet->>'timezone') then raise exception 'INVALID_QUIET_HOURS';end if;
   if (quiet->>'enabled')::boolean and quiet->>'start'=quiet->>'end' then raise exception 'QUIET_HOURS_NEED_DIFFERENT_TIMES';end if;
  end if;
  if coalesce((p_patch->>'applyAllQuietHours')::boolean,false) then
   select array_agg(id::text) into ids from public.together_character_instances where user_id=p_user_id and continuity_id=p_life_id;
   prefs.companion_quiet_hours=prefs.companion_quiet_hours-coalesce(ids,array[]::text[]);
   prefs.life_quiet_hours=prefs.life_quiet_hours-p_life_id::text;
   if quiet<>'null'::jsonb then prefs.life_quiet_hours=prefs.life_quiet_hours||jsonb_build_object(p_life_id::text,quiet);end if;
  else
   prefs.companion_quiet_hours=prefs.companion_quiet_hours-p_character_id::text;
   if quiet<>'null'::jsonb then prefs.companion_quiet_hours=prefs.companion_quiet_hours||jsonb_build_object(p_character_id::text,quiet);end if;
  end if;
 end if;
 update public.together_notification_preferences set companion_initiative_levels=prefs.companion_initiative_levels,companion_quiet_hours=prefs.companion_quiet_hours,life_quiet_hours=prefs.life_quiet_hours,updated_at=now() where user_id=p_user_id returning * into prefs;
 if coalesce(prefs.companion_initiative_levels->>p_character_id::text,prefs.initiative_level,case when prefs.character_initiated_messages then 'natural' else 'off' end)='off' then
  update public.together_proactive_messages set status='cancelled',updated_at=now(),context=coalesce(context,'{}')||'{"skipReason":"initiative_off"}' where user_id=p_user_id and character_instance_id=p_character_id and status='queued' and coalesce(context->>'messageKind','')<>'plan_reminder' and not(context ? 'groupPlanId') and coalesce(dedupe_key,'') not like 'plan:pre:%' and coalesce(dedupe_key,'') not like 'group-plan:pre:%';
 end if;
 return to_jsonb(prefs);
end $$;

-- One policy is used before generation, before commit, and for push retries.
create function public.kivelle_proactive_delivery_policy(p_user_id uuid,p_proactive_id uuid,p_now timestamptz default now(),p_check_cadence boolean default true)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.together_notification_preferences%rowtype; q public.together_proactive_messages%rowtype; c public.together_character_instances%rowtype; quiet jsonb; level text; reminder boolean; local_time time; starts time; ends time; reason text; gap_hours int; idle_hours int;
begin
 select * into q from public.together_proactive_messages where id=p_proactive_id and user_id=p_user_id;
 if not found then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select * into c from public.together_character_instances where id=q.character_instance_id and user_id=p_user_id;
 if not found or c.continuity_id is distinct from q.continuity_id then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select * into p from public.together_notification_preferences where user_id=p_user_id;
 reminder=coalesce(q.context->>'messageKind','')='plan_reminder' or q.context ? 'groupPlanId' or coalesce(q.dedupe_key,'') like 'plan:pre:%' or coalesce(q.dedupe_key,'') like 'group-plan:pre:%';
 quiet=coalesce(p.companion_quiet_hours->c.id::text,p.life_quiet_hours->c.continuity_id::text,jsonb_build_object('start',coalesce(p.quiet_hours_start,'23:00'::time)::text,'end',coalesce(p.quiet_hours_end,'08:00'::time)::text,'timezone',coalesce(p.timezone,'UTC'),'enabled',coalesce((to_jsonb(p)->>'quiet_hours_enabled')::boolean,true)));
 level=coalesce(p.companion_initiative_levels->>c.id::text,p.initiative_level,case when p.character_initiated_messages=false then 'off' else 'natural' end);
 if reminder then
  if p.date_reminders=false or to_jsonb(p)->>'plan_reminders'='false' then reason='reminders_off';end if;
 else
  if not exists(select 1 from public.together_entitlements where user_id=p_user_id and tier in('kivelle_plus','kivelle_max','together_plus','unlimited') and (expires_at is null or expires_at>p_now)) then reason='paid_required';
  elsif level='off' then reason='initiative_off';
  elsif c.scenario_state is not null then reason='scenario_active';
  elsif (to_jsonb(p)->>'initiative_snoozed_until')::timestamptz>p_now then reason='initiative_snoozed';end if;
 end if;
 if reason is null and coalesce((quiet->>'enabled')::boolean,true) then
  local_time=(p_now at time zone (quiet->>'timezone'))::time;starts=(quiet->>'start')::time;ends=(quiet->>'end')::time;
  if (starts<ends and local_time>=starts and local_time<ends) or (starts>ends and (local_time>=starts or local_time<ends)) then reason='quiet_hours';end if;
 end if;
 if reason is null and not reminder and p_check_cadence then
  gap_hours=case level when 'occasional' then 36 when 'frequent' then 8 else 18 end;
  idle_hours=case level when 'occasional' then 12 when 'frequent' then 3 else 5 end;
  if exists(select 1 from public.together_messages m where m.user_id=p_user_id and m.character_instance_id=c.id and m.role='assistant' and m.provider_metadata->>'proactive'='true' and coalesce(m.provider_metadata->>'messageKind','')<>'plan_reminder' and m.created_at>p_now-make_interval(hours=>gap_hours) and m.provider_metadata->>'proactive_message_id' is distinct from q.id::text) then reason='frequency_cooldown';
  elsif exists(select 1 from public.together_messages m where m.user_id=p_user_id and m.character_instance_id=c.id and m.role='user' and m.delivery_status<>'failed' and m.created_at>p_now-make_interval(hours=>idle_hours)) then reason='conversation_active';end if;
 end if;
 return jsonb_build_object('allowed',reason is null,'reason',reason,'quietHours',quiet,'frequency',level);
end $$;

create function public.kivelle_guard_proactive_delivery() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare policy jsonb; proactive_id uuid;
begin
 if new.role<>'assistant' or coalesce(new.provider_metadata->>'proactive','false')<>'true' then return new;end if;
 proactive_id=nullif(new.provider_metadata->>'proactive_message_id','')::uuid;
 perform 1 from public.together_character_instances where id=new.character_instance_id and user_id=new.user_id for update;
 perform pg_advisory_xact_lock(hashtextextended('proactive-preferences:'||new.user_id::text,0));
 perform 1 from public.together_notification_preferences where user_id=new.user_id for update;
 perform 1 from public.together_entitlements where user_id=new.user_id for share;
 policy=public.kivelle_proactive_delivery_policy(new.user_id,proactive_id,clock_timestamp(),true);
 if not coalesce((policy->>'allowed')::boolean,false) then raise exception 'PROACTIVE_DELIVERY_BLOCKED:%',policy->>'reason';end if;
 return new;
end $$;
create trigger proactive_delivery_policy_guard before insert on public.together_messages for each row execute function public.kivelle_guard_proactive_delivery();
revoke all on function public.kivelle_patch_companion_preferences(uuid,uuid,uuid,jsonb),public.kivelle_proactive_delivery_policy(uuid,uuid,timestamptz,boolean),public.kivelle_guard_proactive_delivery() from public,anon,authenticated;
grant execute on function public.kivelle_patch_companion_preferences(uuid,uuid,uuid,jsonb),public.kivelle_proactive_delivery_policy(uuid,uuid,timestamptz,boolean),public.kivelle_guard_proactive_delivery() to service_role;

create function public.kivelle_patch_notification_defaults(p_user_id uuid,p_patch jsonb,p_companion_patch jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare prefs public.together_notification_preferences%rowtype; item record;
begin
 perform pg_advisory_xact_lock(hashtextextended('proactive-preferences:'||p_user_id::text,0));
 insert into public.together_notification_preferences(user_id) values(p_user_id) on conflict do nothing;
 select * into prefs from public.together_notification_preferences where user_id=p_user_id for update;
 for item in select * from jsonb_each(p_companion_patch) loop
  if not exists(select 1 from public.together_character_instances where id::text=item.key and user_id=p_user_id) then raise exception 'COMPANION_UNAVAILABLE';end if;
  if item.value<>'null'::jsonb and item.value#>>'{}' not in('off','occasional','natural','frequent') then raise exception 'INVALID_FREQUENCY';end if;
  prefs.companion_initiative_levels=coalesce(prefs.companion_initiative_levels,'{}')-item.key;
  if item.value<>'null'::jsonb then prefs.companion_initiative_levels=prefs.companion_initiative_levels||jsonb_build_object(item.key,item.value);end if;
 end loop;
 update public.together_notification_preferences set
  push_enabled=(p_patch->>'pushEnabled')::boolean,character_initiated_messages=p_patch->>'initiativeLevel'<>'off',initiative_level=p_patch->>'initiativeLevel',
  companion_initiative_levels=prefs.companion_initiative_levels,date_reminders=(p_patch->>'dateReminders')::boolean,world_event_updates=(p_patch->>'worldEventUpdates')::boolean,
  quiet_hours_start=(p_patch->>'quietHoursStart')::time,quiet_hours_end=(p_patch->>'quietHoursEnd')::time,timezone=p_patch->>'timezone',updated_at=now()
 where user_id=p_user_id returning * into prefs;
 update public.together_proactive_messages q set status='cancelled',updated_at=now(),context=coalesce(q.context,'{}')||'{"skipReason":"initiative_off"}'
 where q.user_id=p_user_id and q.status='queued' and coalesce(q.context->>'messageKind','')<>'plan_reminder' and not(coalesce(q.context,'{}') ? 'groupPlanId') and coalesce(q.dedupe_key,'') not like 'plan:pre:%' and coalesce(q.dedupe_key,'') not like 'group-plan:pre:%'
 and coalesce(prefs.companion_initiative_levels->>q.character_instance_id::text,prefs.initiative_level)='off';
 return to_jsonb(prefs);
end $$;
revoke all on function public.kivelle_patch_notification_defaults(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_patch_notification_defaults(uuid,jsonb,jsonb) to service_role;

create index together_messages_proactive_cadence_idx on public.together_messages(user_id,character_instance_id,created_at desc) where role='assistant' and provider_metadata->>'proactive'='true';
