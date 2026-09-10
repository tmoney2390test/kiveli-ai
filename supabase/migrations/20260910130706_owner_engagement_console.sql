create table public.together_engagement_events (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null, event_name text not null check(event_name in('page_view','onboarding_step','foreground_ping')),
 surface text not null check(surface in('home','chat','group_chat','explore','companions','scenarios','creator','call','world','moments','settings','onboarding','other')),
 step text check(step in('world','companion','scenario')), active_seconds smallint not null default 0 check(active_seconds between 0 and 60),
 platform text not null check(platform in('web','ios','android','other')), created_at timestamptz not null default now()
);
alter table public.together_engagement_events enable row level security;
revoke all on public.together_engagement_events from anon,authenticated;
grant all on public.together_engagement_events to service_role;
create index together_engagement_events_time_user_idx on public.together_engagement_events(created_at,user_id);
create index together_engagement_events_user_time_idx on public.together_engagement_events(user_id,created_at);

create table public.together_ops_account_labels (
 user_id uuid primary key references auth.users(id) on delete cascade,
 segment text not null check(segment in('customer','test','staff')),
 reason text not null,updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now()
);
alter table public.together_ops_account_labels enable row level security;
revoke all on public.together_ops_account_labels from anon,authenticated;
grant all on public.together_ops_account_labels to service_role;
insert into public.together_ops_account_labels(user_id,segment,reason)
 select id,'test','Existing authorized QA account' from auth.users where lower(email)='test7@test.com' on conflict do nothing;

create function public.kivelle_record_engagement(p_user uuid,p_id uuid,p_session uuid,p_event text,p_surface text,p_step text,p_seconds integer,p_platform text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.together_profiles where user_id=p_user and coalesce(privacy_settings->>'analytics','true')<>'false') then return false;end if;
 insert into public.together_engagement_events(id,user_id,session_id,event_name,surface,step,active_seconds,platform)
 values(p_id,p_user,p_session,p_event,p_surface,p_step,case when p_event='foreground_ping' then greatest(0,least(60,p_seconds)) else 0 end,p_platform) on conflict(id) do nothing;
 return found;
end $$;
revoke all on function public.kivelle_record_engagement(uuid,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.kivelle_record_engagement(uuid,uuid,uuid,text,text,text,integer,text) to service_role;

-- Bounded aggregate reports. Never return messages, media URLs or identities.
create function public.kivelle_engagement_dashboard(p_from timestamptz,p_to timestamptz,p_tier text default 'all',p_include_internal boolean default false,p_internal_ids uuid[] default '{}')
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='15s' as $$
declare result jsonb; end_at timestamptz=least(p_to,now()); previous_from timestamptz;
begin
 if p_from is null or p_to is null or p_tier is null or p_from>=end_at or end_at-p_from>interval '93 days' or p_tier not in('all','free','paid') then raise exception 'INVALID_REPORT_RANGE';end if;
 previous_from=p_from-(end_at-p_from);
 with base_accounts as materialized (
  select p.user_id,p.created_at,coalesce(p.privacy_settings->>'analytics','true')<>'false' consent,
   case when e.tier in('kivelle_plus','kivelle_max','together_plus','unlimited') and (e.expires_at is null or e.expires_at>end_at) then 'paid' else 'free' end tier,
   coalesce(l.segment,'customer')<>'customer' or p.user_id=any(p_internal_ids) or coalesce(u.raw_app_meta_data->>'together_admin','false')='true' or coalesce(u.raw_app_meta_data->>'together_internal','false')='true' or coalesce(u.raw_app_meta_data->>'together_ops_role','') in('admin','support','viewer') internal
  from public.together_profiles p join auth.users u on u.id=p.user_id left join public.together_entitlements e on e.user_id=p.user_id left join public.together_ops_account_labels l on l.user_id=p.user_id where p.created_at<end_at
 ), accounts as materialized (
  select * from base_accounts where consent and (p_include_internal or not internal) and (p_tier='all' or tier=p_tier)
 ), human as materialized (
  select m.id,m.user_id,m.character_instance_id,m.conversation_id,m.created_at
  from public.together_messages m join accounts a on a.user_id=m.user_id
  where m.role='user' and m.delivery_status='complete' and coalesce(m.provider_metadata->>'uiHidden','false')<>'true'
   and m.created_at>=least(previous_from,p_from-interval '31 days') and m.created_at<end_at
 ), activity as materialized (
  select user_id,created_at from human
  union all select e.user_id,e.created_at from public.together_engagement_events e join accounts a using(user_id)
   where e.created_at>=least(previous_from,p_from-interval '31 days') and e.created_at<end_at and e.event_name in('page_view','foreground_ping')
 ), current_human as materialized (select * from human where created_at>=p_from), previous_human as (select * from human where created_at>=previous_from and created_at<p_from),
 daily as (
  select (d at time zone 'UTC')::date as day,(select count(distinct user_id) from activity where created_at>=greatest(d,p_from) and created_at<d+interval '1 day') active,
   (select count(*) from current_human where created_at>=d and created_at<d+interval '1 day') messages,
   (select count(*) from accounts where created_at>=greatest(d,p_from) and created_at<least(d+interval '1 day',end_at)) signups
  from generate_series(date_trunc('day',p_from at time zone 'UTC') at time zone 'UTC',date_trunc('day',(end_at-interval '1 microsecond') at time zone 'UTC') at time zone 'UTC',interval '1 day') d
 ), cohorts as (
  select date_trunc('week',a.created_at at time zone 'UTC')::date week,n.day,
   count(*) filter(where ((a.created_at at time zone 'UTC')::date+n.day+1)::timestamp at time zone 'UTC'<=end_at) eligible,
   count(*) filter(where ((a.created_at at time zone 'UTC')::date+n.day+1)::timestamp at time zone 'UTC'<=end_at and exists(select 1 from human h where h.user_id=a.user_id and (h.created_at at time zone 'UTC')::date=(a.created_at at time zone 'UTC')::date+n.day)) returned
  from accounts a cross join(values(1),(7),(30)) n(day) where a.created_at>=p_from and a.created_at<end_at group by 1,2
 ), new_accounts as materialized (select * from accounts where created_at>=p_from and created_at<end_at),
 funnel as (
  select a.user_id,
   exists(select 1 from public.together_engagement_events e where e.user_id=a.user_id and e.event_name='onboarding_step' and e.created_at>=a.created_at and e.created_at<end_at) started,
   exists(select 1 from public.together_character_instances c where c.user_id=a.user_id and c.created_at>=a.created_at and c.created_at<end_at) companion,
   exists(select 1 from current_human h where h.user_id=a.user_id and exists(select 1 from public.together_messages reply where reply.conversation_id=h.conversation_id and reply.role='assistant' and reply.delivery_status='complete' and reply.created_at>=h.created_at and reply.created_at<end_at and coalesce(reply.provider_metadata->>'proactive','false')<>'true')) exchanged,
   (select count(distinct (h.created_at at time zone 'UTC')::date)>1 from current_human h where h.user_id=a.user_id) returned
  from new_accounts a
 ), character_days as (
  select c.character_template_id,h.user_id,(h.created_at at time zone 'UTC')::date as day,count(*) messages
  from current_human h join public.together_character_instances c on c.id=h.character_instance_id group by 1,2,3
 ), character_users as (
  select character_template_id,user_id,sum(messages) messages,count(*) days from character_days group by 1,2
 ), character_stats as (
  select t.id,t.name,t.slug,count(*) users,sum(c.messages) messages,count(*) filter(where c.days>1) as "returning"
  from character_users c join public.together_character_templates t on t.id=c.character_template_id group by t.id,t.name,t.slug order by users desc,messages desc limit 30
 ), world_stats as (
  select w.id,w.name,count(distinct h.user_id) users,count(*) messages from current_human h
  join public.together_character_instances c on c.id=h.character_instance_id
  join public.together_locations l on l.id=c.current_location_id join public.together_worlds w on w.id=l.world_id
  group by w.id,w.name order by users desc limit 20
 ), scenarios as (
  select s.scenario_id,count(*) sessions,count(distinct s.user_id) users,count(*) filter(where s.status='completed') completed,count(*) filter(where s.status='paused') paused,count(*) filter(where s.status='active') active
  from public.together_scenario_sessions s join accounts a using(user_id) where s.started_at>=p_from and s.started_at<end_at group by s.scenario_id order by users desc limit 80
 ), media as materialized (
  select m.media_type,m.status,m.generation_ms,m.attempt_count from public.together_generated_media m join accounts a using(user_id) where m.created_at>=p_from and m.created_at<end_at
 ), media_stats as (
  select media_type,count(*) requested,count(*) filter(where status='ready') ready,count(*) filter(where status='failed') failed,count(*) filter(where status not in('ready','failed')) pending,
   percentile_cont(.95) within group(order by generation_ms) filter(where generation_ms>0) p95_ms,count(*) filter(where attempt_count>1) retried
  from media group by media_type
 ), costs as (
  select x.provider,x.model,count(*) requests,count(*) filter(where not x.success) failed,sum(coalesce(x.provider_cost_usd,x.estimated_cost_usd,0)) cost,
   count(*) filter(where coalesce(x.provider_cost_usd,x.estimated_cost_usd) is not null) priced,
   percentile_cont(.95) within group(order by x.latency_ms) filter(where x.latency_ms>0) p95_ms
  from public.together_ai_usage_events x join accounts a using(user_id) where x.created_at>=p_from and x.created_at<end_at group by 1,2 order by cost desc
 ), feature_events as (
  select e.event_name,count(*) events,count(distinct e.user_id) users from public.together_analytics_events e join accounts a using(user_id)
  where e.created_at>=p_from and e.created_at<end_at and e.event_name in('date_started','date_completed','moment_created','moment_viewed','story_campaign_started','story_campaign_resumed','story_ending_reached','subscription_checkout_started','credit_checkout_started','credit_purchase_completed','subscription_started','subscription_cancelled','paywall_viewed','initiative_preferences_updated') group by 1
 ), proactive as (
  select count(*) queued,count(*) filter(where q.status in('sent','opened')) delivered,count(*) filter(where q.status='opened') opened,count(*) filter(where q.status in('cancelled','expired','failed')) suppressed,
   count(*) filter(where q.sent_message_id is not null and exists(select 1 from public.together_messages sent join public.together_messages response on response.conversation_id=sent.conversation_id and response.user_id=q.user_id and response.role='user' and response.delivery_status='complete' and response.created_at>sent.created_at and response.created_at<=least(sent.created_at+interval '24 hours',end_at) where sent.id=q.sent_message_id)) replied
  from public.together_proactive_messages q join accounts a using(user_id) where q.created_at>=p_from and q.created_at<end_at and coalesce(q.context->>'messageKind','')<>'plan_reminder' and not(coalesce(q.context,'{}') ? 'groupPlanId') and coalesce(q.dedupe_key,'') not like 'plan:pre:%' and coalesce(q.dedupe_key,'') not like 'group-plan:pre:%'
 )
 select jsonb_build_object(
  'generatedAt',now(),'from',p_from,'to',end_at,'previousFrom',previous_from,'tier',p_tier,'includeInternal',p_include_internal,
  'coverage',jsonb_build_object('eligibleAccounts',(select count(*) from accounts),'excludedInternal',(select count(*) from base_accounts where internal),'optedOut',(select count(*) from base_accounts where not consent),'instrumentedSince',(select min(created_at) from public.together_engagement_events),'timezone','UTC'),
  'summary',jsonb_build_object('activeUsers',(select count(distinct user_id) from activity where created_at>=p_from),'chatters',(select count(distinct user_id) from current_human),'messages',(select count(*) from current_human),'signups',(select count(*) from new_accounts),'previousChatters',(select count(distinct user_id) from previous_human),'previousMessages',(select count(*) from previous_human),'previousSignups',(select count(*) from accounts where created_at>=previous_from and created_at<p_from),'returningChatters',(select count(distinct h.user_id) from current_human h where exists(select 1 from public.together_messages old where old.user_id=h.user_id and old.role='user' and old.delivery_status='complete' and old.created_at<p_from and coalesce(old.provider_metadata->>'uiHidden','false')<>'true')),'paidAccounts',(select count(*) from accounts where tier='paid'),'active5m',(select count(distinct user_id) from activity where created_at>=end_at-interval '5 minutes'),'dau',(select count(distinct user_id) from activity where created_at>=end_at-interval '1 day'),'wau',(select count(distinct user_id) from activity where created_at>=end_at-interval '7 days'),'mau',(select count(distinct user_id) from activity where created_at>=end_at-interval '30 days')),
  'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily),'[]'),
  'cohorts',coalesce((select jsonb_agg(to_jsonb(cohorts) order by week,day) from cohorts),'[]'),
  'activation',jsonb_build_object('accounts',(select count(*) from new_accounts),'onboardingViewed',(select count(*) from funnel where started),'companionSelected',(select count(*) from funnel where companion),'successfulExchange',(select count(*) from funnel where exchanged),'secondChatDay',(select count(*) from funnel where returned)),
  'characters',coalesce((select jsonb_agg(to_jsonb(character_stats)) from character_stats),'[]'),
  'worlds',coalesce((select jsonb_agg(to_jsonb(world_stats)) from world_stats),'[]'),
  'scenarios',coalesce((select jsonb_agg(to_jsonb(scenarios)) from scenarios),'[]'),
  'media',coalesce((select jsonb_agg(to_jsonb(media_stats)) from media_stats),'[]'),
  'providers',coalesce((select jsonb_agg(to_jsonb(costs)) from costs),'[]'),
  'features',coalesce((select jsonb_agg(to_jsonb(feature_events)) from feature_events),'[]'),
  'proactive',(select to_jsonb(proactive) from proactive),
  'foreground', (select jsonb_build_object('sessions',count(distinct (e.user_id,e.session_id)),'minutes',round(coalesce(sum(e.active_seconds),0)/60.0,1),'accounts',count(distinct e.user_id)) from public.together_engagement_events e join accounts a using(user_id) where e.created_at>=p_from and e.created_at<end_at),
  'platforms',(select coalesce(jsonb_agg(x),'[]') from(select e.platform,count(distinct e.user_id) users,round(sum(e.active_seconds)/60.0,1) minutes from public.together_engagement_events e join accounts a using(user_id) where e.created_at>=p_from and e.created_at<end_at group by 1) x)
 ) into result;
 return result;
end $$;
revoke all on function public.kivelle_engagement_dashboard(timestamptz,timestamptz,text,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.kivelle_engagement_dashboard(timestamptz,timestamptz,text,boolean,uuid[]) to service_role;
-- Human activity already uses together_messages_daily_user_allowance_idx.
create index if not exists together_analytics_events_user_time_idx on public.together_analytics_events(user_id,created_at);
create index together_ops_account_labels_actor_idx on public.together_ops_account_labels(updated_by);

create function public.kivelle_label_engagement_account(p_actor uuid,p_target uuid,p_segment text,p_reason text,p_request text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_segment not in('customer','test','staff') or length(trim(p_reason))<8 or length(p_reason)>500 then raise exception 'INVALID_ACCOUNT_LABEL';end if;
 if not exists(select 1 from together_profiles where user_id=p_target) then raise exception 'ACCOUNT_NOT_FOUND';end if;
 insert into together_ops_account_labels(user_id,segment,reason,updated_by) values(p_target,p_segment,p_reason,p_actor)
 on conflict(user_id) do update set segment=excluded.segment,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 insert into together_ops_audit_log(actor_user_id,actor_role,action,target_type,target_id,request_id,reason_safe,metadata)
 values(p_actor,'admin','engagement_account_labeled','user',p_target::text,p_request,p_reason,jsonb_build_object('segment',p_segment));
end $$;
revoke all on function public.kivelle_label_engagement_account(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.kivelle_label_engagement_account(uuid,uuid,text,text,text) to service_role;
