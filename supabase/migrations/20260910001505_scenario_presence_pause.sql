-- Canonical scenario placement, character-level routine pause, independent planning.
create table public.together_scenario_definitions(id text primary key,character_template_id uuid not null references public.together_character_templates(id),world_id uuid not null references public.together_worlds(id),location_id uuid not null references public.together_locations(id),title text not null);
alter table public.together_scenario_definitions enable row level security;
revoke all on public.together_scenario_definitions from public,anon,authenticated;
grant all on public.together_scenario_definitions to service_role;
insert into public.together_scenario_definitions values
('jun-01','12000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','The Plus-One Agreement'),
('jun-02','12000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000028','The Interview That Never Aired'),
('jun-03','12000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000012','Everything Before Sunrise'),
('jun-04','12000000-0000-4000-8000-000000000104','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000015','The Hour She Kept'),
('jun-05','12000000-0000-4000-8000-000000000108','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000018','A Dangerous Kind of Honest'),
('jun-06','12000000-0000-4000-8000-000000000109','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000013','The Woman in the Window'),
('jun-07','12000000-0000-4000-8000-000000000121','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000005','The River After Rain'),
('jun-08','12000000-0000-4000-8000-000000000117','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000006','The Photograph He Keeps'),
('jun-09','12000000-0000-4000-8000-000000000115','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000014','The Second Opening'),
('jun-10','12000000-0000-4000-8000-000000000118','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','The Prototype Between Us'),
('por-01','22000000-0000-4000-8008-000000000004','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000010','Anchored Until Morning'),
('por-02','22000000-0000-4000-8008-000000000006','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000015','Someone Else''s Love Story'),
('por-03','22000000-0000-4000-8008-000000000007','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000017','The Unfinished Fitting'),
('por-04','22000000-0000-4000-8008-000000000014','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000023','One Question After Closing'),
('por-05','22000000-0000-4000-8008-000000000021','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000034','The Last Scooter to Bellavista'),
('por-06','22000000-0000-4000-8008-000000000026','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000039','The Bottle Nobody Ordered'),
('por-07','22000000-0000-4000-8008-000000000029','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000040','The Honeymoon Mistake'),
('por-08','22000000-0000-4000-8008-000000000031','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000010','A Berth with Your Name'),
('por-09','22000000-0000-4000-8008-000000000038','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000010','The Reef Beneath the Party'),
('por-10','22000000-0000-4000-8008-000000000041','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000050','The Names Below the Waterline'),
('neo-01','22000000-0000-4000-8009-000000000001','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000008','Wear Someone They Cannot Price'),
('neo-02','22000000-0000-4000-8009-000000000004','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000007','Seven Minutes of Nobody'),
('neo-03','22000000-0000-4000-8009-000000000005','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000049','Her First Bad Date'),
('neo-04','22000000-0000-4000-8009-000000000008','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000020','Desire, Unedited'),
('neo-05','22000000-0000-4000-8009-000000000016','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000030','The Demonstration That Refused'),
('neo-06','22000000-0000-4000-8009-000000000017','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000028','The Leak with Your Reflection'),
('neo-07','22000000-0000-4000-8009-000000000024','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000037','People When Nobody''s Looking'),
('neo-08','22000000-0000-4000-8009-000000000031','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000007','The City Keeps Introducing Us'),
('neo-09','22000000-0000-4000-8009-000000000033','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000008','The Fragrance He Cannot Sell'),
('neo-10','22000000-0000-4000-8009-000000000041','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000034','The Memory Before His Name'),
('ves-01','22000000-0000-4000-8010-000000000001','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000009','A Chapter Left Blank'),
('ves-02','22000000-0000-4000-8010-000000000002','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000013','The Night She Names Herself'),
('ves-03','22000000-0000-4000-8010-000000000008','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000015','The Signature at the Feast'),
('ves-04','22000000-0000-4000-8010-000000000010','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000020','The Room That Waited'),
('ves-05','22000000-0000-4000-8010-000000000019','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000024','Warm Water, No Current'),
('ves-06','22000000-0000-4000-8010-000000000005','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000012','Sanctuary at the Wrong Hour'),
('ves-07','22000000-0000-4000-8010-000000000040','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000045','The Song After Midnight'),
('ves-08','22000000-0000-4000-8010-000000000006','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000008','A Table for the Truth'),
('ves-09','22000000-0000-4000-8010-000000000020','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000024','The Rescue That Came Back'),
('ves-10','22000000-0000-4000-8010-000000000013','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000015','The Clause He Will Not Enforce'),
('nor-01','24000000-0000-4000-8011-000000000001','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000010','Before the Town Wakes'),
('nor-02','24000000-0000-4000-8011-000000000008','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000014','Snowed In with the Manager'),
('nor-03','24000000-0000-4000-8011-000000000010','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000017','The Run She Never Finished'),
('nor-04','24000000-0000-4000-8011-000000000022','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000031','Closed for a Reason'),
('nor-05','24000000-0000-4000-8011-000000000023','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000032','The Forecast They Edited'),
('nor-06','24000000-0000-4000-8011-000000000004','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000013','The Names Beneath the Snow'),
('nor-07','24000000-0000-4000-8011-000000000042','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000049','The Machine That Passed Inspection'),
('nor-08','24000000-0000-4000-8011-000000000013','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000018','The Last Table at the Alpine Room'),
('nor-09','24000000-0000-4000-8011-000000000044','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000047','The Route We Didn''t Take'),
('nor-10','24000000-0000-4000-8011-000000000045','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000051','A Seat at Last Light'),
('eos-01','24000000-0000-4000-8012-000000000021','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000042','Do Not Answer Yet'),
('eos-02','24000000-0000-4000-8012-000000000006','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000019','The Unplanted Harvest'),
('eos-03','24000000-0000-4000-8012-000000000011','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000023','The Ship That Wants a City'),
('eos-04','24000000-0000-4000-8012-000000000003','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000007','The Last Service to Ghost Junction'),
('eos-05','24000000-0000-4000-8012-000000000017','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000035','A Detour Worth Keeping'),
('eos-06','24000000-0000-4000-8012-000000000027','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000048','The Gravity Between Us'),
('eos-07','24000000-0000-4000-8012-000000000008','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000018','A Recipe for Somewhere Else'),
('eos-08','24000000-0000-4000-8012-000000000012','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000030','Beyond the Edge of His Map'),
('eos-09','24000000-0000-4000-8012-000000000002','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000008','The Independence Clause'),
('eos-10','24000000-0000-4000-8012-000000000023','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000041','Warm Water Under Black Ice'),
('vha-01','24000000-0000-4000-8013-000000000001','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000007','The Queen''s Unsent Offer'),
('vha-02','24000000-0000-4000-8013-000000000002','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000013','The Price of One Name'),
('vha-03','24000000-0000-4000-8013-000000000005','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000007','Hold Until the Bells'),
('vha-04','24000000-0000-4000-8013-000000000003','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000011','The Hymn They Buried'),
('vha-05','24000000-0000-4000-8013-000000000019','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000024','A Dragon Owes No Crown'),
('vha-06','24000000-0000-4000-8013-000000000020','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000026','The Crimson Veil Invitation'),
('vha-07','24000000-0000-4000-8013-000000000041','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000046','The Battlefield Remembers'),
('vha-08','24000000-0000-4000-8013-000000000007','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000008','The Prince Who Would Not Kill'),
('vha-09','24000000-0000-4000-8013-000000000029','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000033','The Hunt under Truce'),
('vha-10','24000000-0000-4000-8013-000000000045','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000049','The Rider without a Dragon'),
('cal-01','9ed7daa2-a0a3-52cf-b7f4-ad8d220750ab','31740169-035e-5b10-8c9d-98b206e9f24b','e0526a03-fbb9-5eb9-bdbd-31872d63f11b','The Saloon She Means to Own'),
('cal-02','27a5c487-a218-52b9-8798-2906889b7faa','31740169-035e-5b10-8c9d-98b206e9f24b','3a99c001-cd13-588d-8adf-0ba57d924c39','Two Stakes out of Line'),
('cal-03','63a4bf14-598c-509f-861f-46a1ce3c729b','31740169-035e-5b10-8c9d-98b206e9f24b','b8e6063d-69c1-5791-bb0d-595e8ea26148','Before the Ink Dries'),
('cal-04','ab4cfd68-d04d-5ebb-b874-e33648cca0c3','31740169-035e-5b10-8c9d-98b206e9f24b','7e80c107-194e-5283-9f41-8964f282e145','The Last Song Is Not Goodbye'),
('cal-05','cc342d4a-c160-5567-87aa-07506734b1f9','31740169-035e-5b10-8c9d-98b206e9f24b','4c788a8a-77fd-5fd4-8be8-e4b7a1d9aac0','The Assay That Could Buy a Town'),
('cal-06','48948de7-27bd-5a3c-8053-3afa6e59f55d','31740169-035e-5b10-8c9d-98b206e9f24b','38b0efd4-b1d9-5b32-bc1f-b0b711da47ca','Her Evening, Her Invitation'),
('cal-07','db699624-91b3-5c34-93ec-53c7974498fb','31740169-035e-5b10-8c9d-98b206e9f24b','602be10b-b09b-58df-965e-033a1ea401d8','The Delivery She Won''t Make'),
('cal-08','dc689ec4-8705-5bcc-80f2-00d8c2180e6a','31740169-035e-5b10-8c9d-98b206e9f24b','44c76f68-9a74-55b2-ba70-fe46da0742f6','No Shots Before Sunrise'),
('cal-09','39ed7112-d367-5790-a841-f76c9eab8052','31740169-035e-5b10-8c9d-98b206e9f24b','271261e4-6280-5c1d-be25-dbbdab07ccf9','The Telegram That Arrived Too Late'),
('cal-10','bac209b8-8ee8-50c9-894d-5b767392884a','31740169-035e-5b10-8c9d-98b206e9f24b','8ea973d5-94fe-5c5c-8cb3-84a90abef76e','The Bandit Who Brought a Receipt');

alter table public.together_scenario_sessions add column current_location_id uuid references public.together_locations(id), add column activated_at timestamptz not null default now(),add column previous_presence jsonb not null default '{}'::jsonb;
alter table public.together_character_instances add column scenario_state jsonb;
alter table public.together_character_instances drop constraint if exists together_character_instances_current_presence_source_check;
alter table public.together_character_instances add constraint together_character_instances_current_presence_source_check check(current_presence_source in('legacy','schedule','plan','life_event','fallback','scenario'));
update public.together_scenario_sessions s set current_location_id=d.location_id from public.together_scenario_definitions d where d.id=s.scenario_id;
with ranked as(select id,row_number() over(partition by character_instance_id order by updated_at desc,id) n from public.together_scenario_sessions where status='active') update public.together_scenario_sessions set status='paused' where id in(select id from ranked where n>1);
create unique index together_scenario_one_active_character on public.together_scenario_sessions(character_instance_id) where status='active';

create function public.together_scenario_before_change() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.together_scenario_definitions%rowtype;i public.together_character_instances%rowtype;
begin
 select * into i from public.together_character_instances where id=new.character_instance_id and user_id=new.user_id and continuity_id=new.continuity_id for update;
 if not found then raise exception 'Scenario character unavailable' using errcode='42501'; end if;
 select * into d from public.together_scenario_definitions where id=new.scenario_id and character_template_id=i.character_template_id;
 if not found then raise exception 'Scenario definition unavailable' using errcode='23514'; end if;
 new.current_location_id:=coalesce(new.current_location_id,d.location_id);
 if not exists(select 1 from public.together_locations where id=new.current_location_id and world_id=d.world_id) then raise exception 'Scenario location unavailable' using errcode='23514';end if;
 if new.status='active' and (tg_op='INSERT' or old.status<>'active') then
  if exists(select 1 from public.together_plan_attendance a join public.together_shared_plans p on p.id=a.plan_id where p.user_id=new.user_id and p.continuity_id=new.continuity_id and new.character_instance_id=any(array_append(p.participant_instance_ids,p.character_instance_id)) and p.status in('active','scheduled') and a.participant_type='user' and a.left_at is null and p.ends_at>now()) or exists(select 1 from public.together_date_sessions where user_id=new.user_id and character_instance_id=new.character_instance_id and status='active') then raise exception 'End the current event before starting a scenario' using errcode='23514';end if;
  update public.together_scenario_sessions set status='paused',updated_at=now() where character_instance_id=new.character_instance_id and status='active' and id<>new.id;
  new.activated_at:=now();new.previous_presence:=jsonb_build_object('locationId',i.current_location_id,'activity',i.current_activity);
  update public.together_scene_sessions set ended_at=greatest(now(),started_at),updated_at=now() where character_instance_id=new.character_instance_id and ended_at is null;
 end if;return new;
end $$;
create trigger scenario_before_change before insert or update of status,current_location_id on public.together_scenario_sessions for each row execute function public.together_scenario_before_change();

-- Even old workers cannot overwrite the active scenario with routine presence.
create function public.together_scenario_guard_presence() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare s record;
begin
 select a.*,d.title,d.world_id into s from public.together_scenario_sessions a join public.together_scenario_definitions d on d.id=a.scenario_id where a.character_instance_id=new.id and a.user_id=new.user_id and a.continuity_id=new.continuity_id and a.status='active';
 if found then
 new.current_location_id:=s.current_location_id;new.current_activity:=s.title;new.current_presence_source:='scenario';new.current_schedule_event_id:=null;new.current_interruptibility:='open';
 new.scenario_state:=jsonb_build_object('sessionId',s.id,'scenarioId',s.scenario_id,'title',s.title,'conversationId',s.conversation_id,'locationId',s.current_location_id,'worldId',s.world_id,'startedAt',s.activated_at);
 else new.scenario_state:=null;end if;return new;
end $$;
create trigger scenario_guard_presence before update on public.together_character_instances for each row execute function public.together_scenario_guard_presence();

create function public.together_scenario_sync_presence() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare character_id uuid;prior jsonb;
begin
 if tg_op='DELETE' and old.status<>'active' then return null;end if;
 if tg_op='UPDATE' and old.status<>'active' and new.status<>'active' then return null;end if;
 character_id:=case when tg_op='DELETE' then old.character_instance_id else new.character_instance_id end;
 prior:=case when tg_op='DELETE' then old.previous_presence else new.previous_presence end;
 if not exists(select 1 from public.together_scenario_sessions where character_instance_id=character_id and status='active') then
 update public.together_character_instances set scenario_state=null,current_presence_source='fallback',current_schedule_event_id=null,current_location_id=coalesce((prior->>'locationId')::uuid,current_location_id),current_activity=coalesce(prior->>'activity','Having some unstructured time'),last_simulated_at=now(),last_event_simulated_at=now(),updated_at=now() where id=character_id;
 update public.together_scene_sessions set ended_at=greatest(now(),started_at),updated_at=now() where character_instance_id=character_id and ended_at is null and state ? 'scenarioSessionId';
 else update public.together_character_instances set last_simulated_at=now(),last_event_simulated_at=now(),updated_at=now() where id=character_id;end if;
 return null;
end $$;
create trigger scenario_sync_presence after insert or update of status,current_location_id or delete on public.together_scenario_sessions for each row execute function public.together_scenario_sync_presence();

create function public.together_scenario_archive_cleanup() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.archived_at is not null or new.user_archived_at is not null then update public.together_scenario_sessions set status='paused',updated_at=now() where conversation_id=new.id and status='active';end if;return new;
end $$;
create trigger scenario_archive_cleanup after update of archived_at,user_archived_at on public.together_conversations for each row execute function public.together_scenario_archive_cleanup();

create function public.together_scenario_scene_moved() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.together_scenario_sessions%rowtype;
begin
 if new.ended_at is not null or new.shared_plan_id is not null then return new;end if;
 select * into s from public.together_scenario_sessions where character_instance_id=new.character_instance_id and conversation_id=new.conversation_id and user_id=new.user_id and continuity_id=new.continuity_id and status='active';
 if found and new.started_at>=s.activated_at then
 update public.together_scenario_sessions set current_location_id=new.location_id,updated_at=now() where id=s.id and current_location_id is distinct from new.location_id;
 new.state:=new.state||jsonb_build_object('scenarioSessionId',s.id);end if;return new;
end $$;
create trigger scenario_scene_moved before insert or update of location_id on public.together_scene_sessions for each row execute function public.together_scenario_scene_moved();

create function public.together_defer_scenario_plans(p_user uuid,p_character uuid,p_now timestamptz) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.together_shared_plans p set status='proposed',metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object('scenarioNeedsReschedule',true,'scenarioDeferredAt',p_now),updated_at=p_now
 where p.user_id=p_user and p.status in('scheduled','active') and p.ends_at<=p_now and p_character=any(array_append(p.participant_instance_ids,p.character_instance_id))
 and not exists(select 1 from public.together_plan_attendance a where a.plan_id=p.id and a.participant_type='user')
 and exists(select 1 from public.together_scenario_sessions s where s.user_id=p.user_id and s.continuity_id=p.continuity_id and s.character_instance_id=any(array_append(p.participant_instance_ids,p.character_instance_id)) and s.activated_at<=p.ends_at and (s.status='active' or s.updated_at>=p.starts_at));
end $$;

alter function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) rename to kivelle_begin_plan_experience_before_scenarios;
create function public.kivelle_begin_plan_experience(p_user_id uuid,p_continuity_id uuid,p_character_instance_id uuid,p_plan_id uuid,p_request_id text,p_now timestamptz default now(),p_source text default 'app') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;ids uuid[];
begin
 select array_append(participant_instance_ids,character_instance_id) into ids from public.together_shared_plans where id=p_plan_id and user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=p_character_instance_id;
 if ids is null then raise exception 'commitment is unavailable';end if;
 perform 1 from public.together_character_instances where id=any(ids) and user_id=p_user_id and continuity_id=p_continuity_id order by id for update;
 if exists(select 1 from public.together_scenario_sessions where user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=any(ids) and status='active') and p_source<>'scenario_confirmed' then raise exception 'SCENARIO_PAUSE_REQUIRED: Join this event and pause the scenario?';end if;
 update public.together_scenario_sessions set status='paused',updated_at=now() where user_id=p_user_id and continuity_id=p_continuity_id and character_instance_id=any(ids) and status='active';
 result:=public.kivelle_begin_plan_experience_before_scenarios(p_user_id,p_continuity_id,p_character_instance_id,p_plan_id,p_request_id,p_now,p_source);
 update public.together_character_instances i set current_location_id=p.location_id,current_activity=p.title,current_presence_source='plan',updated_at=now() from public.together_shared_plans p where p.id=p_plan_id and i.id=any(ids) and i.user_id=p_user_id and i.continuity_id=p_continuity_id;
 return result;
end $$;

create or replace function public.together_start_scenario(
 p_user uuid,p_continuity uuid,p_conversation uuid,p_character uuid,p_template uuid,p_scenario text,p_opening text
) returns public.together_scenario_sessions language plpgsql security invoker set search_path=public,pg_temp as $$
declare result public.together_scenario_sessions;
begin
 perform 1 from public.together_character_instances where id=p_character and user_id=p_user and continuity_id=p_continuity for update;
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


create or replace function public.kivelle_catch_up_due_commitments(p_user_id uuid,p_character_instance_id uuid,p_now timestamptz default now()) returns void language plpgsql security definer set search_path=public as $$
declare plan_row public.together_shared_plans%rowtype; miss_kind text;
begin
 perform public.together_defer_scenario_plans(p_user_id,p_character_instance_id,p_now);
  for plan_row in select * from public.together_shared_plans where user_id=p_user_id and character_instance_id=p_character_instance_id and not exists(select 1 from public.together_scenario_sessions hold where hold.user_id=p_user_id and hold.status='active' and hold.character_instance_id=any(array_append(together_shared_plans.participant_instance_ids,together_shared_plans.character_instance_id))) and status='scheduled' and starts_at is not null and starts_at<=p_now order by starts_at for update
  loop
    if plan_row.companion_state in('absent','cancelled') then
      miss_kind:=case when plan_row.companion_state='cancelled' then 'cancelled' else 'character_absent' end;
      update public.together_shared_plans set status=case when miss_kind='cancelled' then 'cancelled' else 'missed' end,missed_at=case when miss_kind='cancelled' then missed_at else coalesce(missed_at,p_now) end,miss_reason=miss_kind,cancelled_at=case when miss_kind='cancelled' then coalesce(cancelled_at,p_now) else cancelled_at end,updated_at=p_now where id=plan_row.id;
      insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata,resolved_at)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',miss_kind,'{}'::jsonb,jsonb_build_object('companionReason',plan_row.companion_reason,'noUserPenalty',true,'offlineCatchUp',true),p_now)
      on conflict(plan_id) do update set status='resolved',miss_reason=excluded.miss_reason,impact_applied='{}'::jsonb,metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,resolved_at=p_now,updated_at=p_now;
      continue;
    end if;
    if plan_row.companion_state='expected' or (plan_row.companion_state='late' and coalesce(plan_row.companion_eta_at,plan_row.starts_at)<=p_now) then
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,'character',plan_row.character_instance_id,case when plan_row.companion_state='late' then coalesce(plan_row.companion_eta_at,plan_row.starts_at) else plan_row.starts_at end,'system',jsonb_build_object('companionState',plan_row.companion_state,'offlineCatchUp',true)) on conflict do nothing;
    end if;
    update public.together_shared_plans set status='active',grace_ends_at=coalesce(grace_ends_at,starts_at+make_interval(mins=>grace_minutes)),updated_at=p_now where id=plan_row.id and status='scheduled';
  end loop;
end $$;


create or replace function public.kivelle_progress_shared_plans_core(
  p_user_id uuid,
  p_character_instance_id uuid,
  p_now timestamptz default now()
)
returns setof public.together_shared_plans
language plpgsql
security definer
set search_path=public
as $$
declare
  plan_row public.together_shared_plans%rowtype;
  memory_id uuid;
  plan_significance numeric;
  plan_summary text;
  prior_misses integer;
  penalty integer;
  current_relationship_stage text;
  impact jsonb;
  miss_kind text;
begin
 perform public.together_defer_scenario_plans(p_user_id,p_character_instance_id,p_now);
  for plan_row in
    select * from public.together_shared_plans
    where user_id=p_user_id and character_instance_id=p_character_instance_id and not exists(select 1 from public.together_scenario_sessions hold where hold.user_id=p_user_id and hold.status='active' and hold.character_instance_id=any(array_append(together_shared_plans.participant_instance_ids,together_shared_plans.character_instance_id)))
      and status='scheduled' and starts_at is not null and starts_at<=p_now and ends_at>p_now
    order by starts_at for update
  loop
    if plan_row.companion_state in('absent','cancelled') then
      miss_kind:=case when plan_row.companion_state='cancelled' then 'cancelled' else 'character_absent' end;
      update public.together_shared_plans
      set status=case when miss_kind='cancelled' then 'cancelled' else 'missed' end,
          missed_at=case when miss_kind='cancelled' then missed_at else p_now end,
          miss_reason=miss_kind,
          cancelled_at=case when miss_kind='cancelled' then coalesce(cancelled_at,p_now) else cancelled_at end,
          updated_at=p_now
      where id=plan_row.id;
      insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'resolved',miss_kind,'{}'::jsonb,jsonb_build_object('companionReason',plan_row.companion_reason,'noUserPenalty',true))
      on conflict(plan_id) do nothing;
      continue;
    end if;
    if plan_row.companion_state='expected'
      or (plan_row.companion_state='late' and plan_row.companion_eta_at is not null and plan_row.companion_eta_at<=p_now)
    then
      insert into public.together_plan_attendance(user_id,continuity_id,plan_id,participant_type,character_instance_id,joined_at,source,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.id,'character',plan_row.character_instance_id,case when plan_row.companion_state='late' then plan_row.companion_eta_at else plan_row.starts_at end,'system',jsonb_build_object('companionState',plan_row.companion_state))
      on conflict do nothing;
    end if;
    update public.together_shared_plans
    set status='active',grace_ends_at=coalesce(grace_ends_at,starts_at+make_interval(mins=>grace_minutes)),updated_at=p_now
    where id=plan_row.id and status='scheduled';
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_started',jsonb_build_object('planId',plan_row.id,'source',plan_row.source))
    on conflict do nothing;
  end loop;

  for plan_row in
    update public.together_shared_plans plan
    set status='missed',missed_at=coalesce(plan.missed_at,p_now),miss_reason='user_absent',updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id and not exists(select 1 from public.together_scenario_sessions hold where hold.user_id=p_user_id and hold.status='active' and hold.character_instance_id=any(array_append(plan.participant_instance_ids,plan.character_instance_id)))
      and plan.status='active' and plan.participation_mode='live'
      and coalesce(plan.grace_ends_at,plan.starts_at+make_interval(mins=>plan.grace_minutes))<=p_now
      and exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='character')
      and not exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user')
    returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    select count(*) into prior_misses
    from public.together_shared_plans previous
    where previous.user_id=plan_row.user_id and previous.character_instance_id=plan_row.character_instance_id
      and previous.status='missed' and previous.miss_reason='user_absent' and previous.id<>plan_row.id;
    select instance.relationship_stage into current_relationship_stage
    from public.together_character_instances as instance
    where instance.id=plan_row.character_instance_id;
    penalty:=1+case when plan_significance>=.65 then 1 else 0 end
      +case when plan_significance>=.85 then 1 else 0 end
      +case when current_relationship_stage in('dating','exclusive','long_term') then 1 else 0 end
      +least(2,prior_misses);
    impact:=jsonb_build_object('trust',-least(5,penalty),'respect',-least(4,greatest(1,penalty-1)),'conflict',least(5,penalty),'affinity',case when plan_significance>=.75 then -1 else 0 end);
    update public.together_relationship_states
    set trust=greatest(0,trust-least(5,penalty)),respect=greatest(0,respect-least(4,greatest(1,penalty-1))),
        conflict=least(100,conflict+least(5,penalty)),affinity=greatest(0,affinity+case when plan_significance>=.75 then -1 else 0 end),
        last_relationship_delta=impact,recent_direction='strained',updated_at=p_now
    where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id;
    insert into public.together_missed_plan_resolutions(user_id,continuity_id,plan_id,character_instance_id,status,miss_reason,impact_applied,metadata)
    values(plan_row.user_id,plan_row.continuity_id,plan_row.id,plan_row.character_instance_id,'awaiting_explanation','user_absent',impact,jsonb_build_object('priorMisses',prior_misses,'significance',plan_significance,'waitedMinutes',greatest(0,extract(epoch from(p_now-plan_row.starts_at))/60)::integer))
    on conflict(plan_id) do update
    set status='awaiting_explanation',miss_reason='user_absent',impact_applied=excluded.impact_applied,
        metadata=public.together_missed_plan_resolutions.metadata||excluded.metadata,updated_at=p_now;
    if plan_row.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_missed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'status','missed','missReason','user_absent','locationId',plan_row.location_id))
      on conflict do nothing;
    end if;
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_missed',jsonb_build_object('planId',plan_row.id,'reason','user_absent','priorMisses',prior_misses));
  end loop;

  for plan_row in
    update public.together_shared_plans plan
    set status='completed',completed_at=coalesce(plan.completed_at,p_now),updated_at=p_now
    where plan.user_id=p_user_id and plan.character_instance_id=p_character_instance_id and not exists(select 1 from public.together_scenario_sessions hold where hold.user_id=p_user_id and hold.status='active' and hold.character_instance_id=any(array_append(plan.participant_instance_ids,plan.character_instance_id)))
      and plan.status='active' and plan.ends_at<=p_now
      and (plan.participation_mode<>'live' or exists(select 1 from public.together_plan_attendance attendance where attendance.plan_id=plan.id and attendance.participant_type='user'))
    returning plan.*
  loop
    plan_significance:=greatest(0,least(1,coalesce((plan_row.metadata->>'significance')::numeric,.45)));
    plan_summary:=coalesce(nullif(plan_row.metadata->>'completionSummary',''),'User and their companion spent time together for '||plan_row.title||'.');
    if plan_row.source='date' then
      insert into public.together_analytics_events(user_id,event_name,properties)
      values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source','date','effectsOwnedBy','date_session'));
      continue;
    end if;
    if plan_row.legacy_life_event_id is not null then
      update public.together_life_events
      set event_type='shared_plan_completed',title=plan_row.title,narrative_summary=plan_summary,starts_at=plan_row.starts_at,
          ends_at=plan_row.ends_at,location_id=plan_row.location_id,significance=plan_significance,user_should_know=true,
          metadata=metadata||jsonb_build_object('canonicalPlanId',plan_row.id,'completedAt',p_now)
      where id=plan_row.legacy_life_event_id;
    else
      insert into public.together_life_events(user_id,continuity_id,character_instance_id,event_type,title,narrative_summary,participant_instance_ids,location_id,significance,starts_at,ends_at,resulting_state_changes,user_should_know,proactive_message_appropriate,metadata,shared_plan_id)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'shared_plan_completed',plan_row.title,plan_summary,array[plan_row.character_instance_id],plan_row.location_id,plan_significance,plan_row.starts_at,plan_row.ends_at,jsonb_build_object('sharedActivity',plan_row.activity_key),true,plan_significance>=.65,jsonb_build_object('canonicalPlanId',plan_row.id,'source',plan_row.source),plan_row.id)
      on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
    end if;
    if plan_significance>=.42 then
      insert into public.together_memories(user_id,continuity_id,character_instance_id,memory_type,canonical_text,dedupe_key,importance,confidence,sensitivity_category,status,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,'episodic',plan_summary,'shared-plan:'||plan_row.id::text,plan_significance,.95,'none','active',jsonb_build_object('sharedPlanId',plan_row.id,'locationId',plan_row.location_id))
      on conflict(character_instance_id,dedupe_key) do update
      set canonical_text=excluded.canonical_text,importance=greatest(public.together_memories.importance,excluded.importance),updated_at=p_now
      returning id into memory_id;
    end if;
    if plan_significance>=.5 then
      update public.together_relationship_states
      set affinity=least(100,affinity+1),familiarity=least(100,familiarity+1),last_interaction_quality='shared_experience',
          last_relationship_delta='{"affinity":1,"familiarity":1}'::jsonb,recent_direction='improving',updated_at=p_now
      where user_id=plan_row.user_id and character_instance_id=plan_row.character_instance_id;
    end if;
    if plan_significance>=.72 then
      insert into public.together_moments(user_id,continuity_id,character_instance_id,title,occurred_at,location_id,summary,participant_instance_ids,linked_memory_ids,relationship_impact,media,moment_type,shared_plan_id)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.title,plan_row.ends_at,plan_row.location_id,plan_summary,array[plan_row.character_instance_id],case when memory_id is null then '{}'::uuid[] else array[memory_id] end,'{"affinity":1,"familiarity":1}'::jsonb,'[]'::jsonb,'shared_plan',plan_row.id)
      on conflict(shared_plan_id) where shared_plan_id is not null do nothing;
    end if;
    if plan_row.source_conversation_id is not null then
      insert into public.together_conversation_events(user_id,continuity_id,character_instance_id,conversation_id,event_type,entity_type,entity_id,metadata)
      values(plan_row.user_id,plan_row.continuity_id,plan_row.character_instance_id,plan_row.source_conversation_id,'plan_completed','shared_plan',plan_row.id,jsonb_build_object('title',plan_row.title,'startsAt',plan_row.starts_at,'endsAt',plan_row.ends_at,'status','completed','locationId',plan_row.location_id))
      on conflict do nothing;
    end if;
    insert into public.together_analytics_events(user_id,event_name,properties)
    values(plan_row.user_id,'plan_completed',jsonb_build_object('planId',plan_row.id,'source',plan_row.source));
  end loop;

  return query
  select * from public.together_shared_plans
  where user_id=p_user_id and character_instance_id=p_character_instance_id
  order by starts_at nulls last,created_at;
end
$$;



revoke all on function public.together_scenario_before_change() from public,anon,authenticated;
grant execute on function public.together_scenario_before_change() to service_role;

revoke all on function public.together_scenario_guard_presence() from public,anon,authenticated;
grant execute on function public.together_scenario_guard_presence() to service_role;

revoke all on function public.together_scenario_sync_presence() from public,anon,authenticated;
grant execute on function public.together_scenario_sync_presence() to service_role;

revoke all on function public.together_scenario_archive_cleanup() from public,anon,authenticated;
grant execute on function public.together_scenario_archive_cleanup() to service_role;

revoke all on function public.together_scenario_scene_moved() from public,anon,authenticated;
grant execute on function public.together_scenario_scene_moved() to service_role;

revoke all on function public.together_defer_scenario_plans(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.together_defer_scenario_plans(uuid,uuid,timestamptz) to service_role;

revoke all on function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.kivelle_begin_plan_experience(uuid,uuid,uuid,uuid,text,timestamptz,text) to service_role;

update public.together_character_instances set updated_at=now() where id in(select character_instance_id from public.together_scenario_sessions where status='active');

-- Authored dates use the same explicit transition as shared events.
create function public.together_scenario_date_guard() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.status='active' and old.status<>'active' and exists(select 1 from public.together_scenario_sessions where user_id=new.user_id and character_instance_id=new.character_instance_id and status='active') then raise exception 'SCENARIO_PAUSE_REQUIRED';end if;return new;
end $$;
create trigger scenario_date_guard before update of status on public.together_date_sessions for each row execute function public.together_scenario_date_guard();
create function public.together_start_date_with_scenario(p_user uuid,p_continuity uuid,p_session uuid,p_pause boolean,p_state jsonb,p_schedule_now boolean default false) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.together_date_sessions%rowtype; place_id uuid;
begin
 select * into d from public.together_date_sessions where id=p_session and user_id=p_user and continuity_id=p_continuity;
 if not found then raise exception 'Date unavailable';end if;
 perform 1 from public.together_character_instances where id=d.character_instance_id and user_id=p_user and continuity_id=p_continuity for update;
 select * into d from public.together_date_sessions where id=p_session and user_id=p_user and continuity_id=p_continuity for update;
 if d.status not in('unlocked','upcoming','deferred') then raise exception 'Date is not ready';end if;
 if not p_pause and exists(select 1 from public.together_scenario_sessions where character_instance_id=d.character_instance_id and user_id=p_user and status='active') then raise exception 'SCENARIO_PAUSE_REQUIRED';end if;
 update public.together_scenario_sessions set status='paused',updated_at=now() where character_instance_id=d.character_instance_id and user_id=p_user and continuity_id=p_continuity and status='active';
 update public.together_date_sessions set status='active',current_phase='arrival',phase_index=0,started_at=now(),state=p_state,scheduled_for=case when p_schedule_now then now() else scheduled_for end,updated_at=now() where id=p_session returning * into d;
 select location_id into place_id from public.together_date_templates where id=d.date_template_id;
 update public.together_character_instances set current_location_id=place_id,current_activity='On a date',current_presence_source='plan',updated_at=now() where id=d.character_instance_id and user_id=p_user;
 return to_jsonb(d);
end $$;
revoke all on function public.together_scenario_date_guard() from public,anon,authenticated;
grant execute on function public.together_scenario_date_guard() to service_role;
revoke all on function public.together_start_date_with_scenario(uuid,uuid,uuid,boolean,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.together_start_date_with_scenario(uuid,uuid,uuid,boolean,jsonb,boolean) to service_role;

create function public.together_scenario_guard_ambient_message() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if coalesce(new.provider_metadata->>'proactive','false')<>'true' then return new;end if;
 perform 1 from public.together_character_instances where id=new.character_instance_id and user_id=new.user_id for update;
 if exists(select 1 from public.together_scenario_sessions where character_instance_id=new.character_instance_id and user_id=new.user_id and status='active') and not exists(select 1 from public.together_proactive_messages where id::text=new.provider_metadata->>'proactive_message_id' and user_id=new.user_id and context->>'messageKind'='plan_reminder') then return null;end if;
 return new;
end $$;
create trigger scenario_guard_ambient_message before insert on public.together_messages for each row execute function public.together_scenario_guard_ambient_message();
create function public.together_scenario_guard_ambient_event() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.event_type<>'schedule_outcome' and coalesce(new.metadata->>'source','') not in('scheduled_dispatch','conversation_continued') then return new;end if;
 perform 1 from public.together_character_instances where id=new.character_instance_id and user_id=new.user_id for update;
 if exists(select 1 from public.together_scenario_sessions where character_instance_id=new.character_instance_id and user_id=new.user_id and status='active') then return null;end if;return new;
end $$;
create trigger scenario_guard_ambient_event before insert on public.together_life_events for each row execute function public.together_scenario_guard_ambient_event();
revoke all on function public.together_scenario_guard_ambient_message() from public,anon,authenticated;
grant execute on function public.together_scenario_guard_ambient_message() to service_role;
revoke all on function public.together_scenario_guard_ambient_event() from public,anon,authenticated;
grant execute on function public.together_scenario_guard_ambient_event() to service_role;
