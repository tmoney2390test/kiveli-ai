-- Scenario checkpoints are private to a player, Life and companion. No global canon changes.
alter table public.together_scenario_sessions drop constraint together_scenario_sessions_scenario_id_check;
alter table public.together_scenario_sessions add constraint together_scenario_sessions_scenario_id_check check (scenario_id ~ '^(jun|por|neo|ves|nor|eos|vha|cal)-[0-9]{2}$' or scenario_id ~ '^story-[a-z0-9-]{1,100}$');
alter table public.together_scenario_sessions add column revision integer not null default 0;
alter table public.together_scenario_sessions add column story_progress jsonb not null default '{"chapterIndex":0,"checkpoints":[]}';
create table public.together_scenario_receipts (
 session_id uuid not null references public.together_scenario_sessions(id) on delete cascade,
 request_id uuid not null, result jsonb not null, primary key(session_id,request_id)
);
alter table public.together_scenario_receipts enable row level security;
revoke all on public.together_scenario_receipts from public,anon,authenticated;
grant all on public.together_scenario_receipts to service_role;
create function public.together_scenario_revision() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 new.revision:=old.revision+1;
 return new;
end $$;
create trigger scenario_revision before update of status,current_location_id,story_progress on public.together_scenario_sessions for each row execute function public.together_scenario_revision();
create trigger scenario_checkpoint_context after update of story_progress on public.together_scenario_sessions for each row execute function public.together_scenario_context_changed();

create function public.together_scenario_checkpoint(p_user uuid,p_continuity uuid,p_session uuid,p_request uuid,p_revision integer,p_note text,p_chapter_count integer)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s public.together_scenario_sessions; receipt jsonb; idx integer; checkpoint jsonb;
begin
 -- Match start/resume lock order, so simultaneous starts cannot strand a checkpoint.
 perform 1 from public.together_character_instances i join public.together_scenario_sessions x on x.character_instance_id=i.id
 where x.id=p_session and x.user_id=p_user and x.continuity_id=p_continuity for update of i;
 if not found then raise exception 'Scenario unavailable' using errcode='42501';end if;
 perform 1 from public.together_conversations c join public.together_scenario_sessions x on x.conversation_id=c.id
 where x.id=p_session and c.user_id=p_user and c.continuity_id=p_continuity and c.archived_at is null and c.user_archived_at is null for update of c;
 if not found then raise exception 'Conversation unavailable' using errcode='42501';end if;
 select * into s from public.together_scenario_sessions where id=p_session and user_id=p_user and continuity_id=p_continuity for update;
 select result into receipt from public.together_scenario_receipts where session_id=s.id and request_id=p_request;
 if found then
  if receipt->'story_progress'->'checkpoints'->-1->>'note'<>trim(p_note) or (receipt->>'revision')::integer<>p_revision+1 then raise exception 'Checkpoint request mismatch' using errcode='22023';end if;
  return to_jsonb(s);
 end if;
 if s.revision<>p_revision or s.status<>'active' then raise exception 'SCENARIO_CHANGED' using errcode='40001';end if;
 if exists(select 1 from public.together_dialogue_turns where conversation_id=s.conversation_id and state not in('completed','cancelled','failed','yielded') and lease_expires_at>now()) then raise exception 'WAIT_FOR_REPLY' using errcode='23514';end if;
 idx:=coalesce((s.story_progress->>'chapterIndex')::integer,0);
 if p_chapter_count<2 or p_chapter_count>12 or idx>=p_chapter_count or char_length(trim(p_note))<10 or char_length(p_note)>600 then raise exception 'Invalid checkpoint' using errcode='22023';end if;
 if not exists(select 1 from public.together_messages where conversation_id=s.conversation_id and user_id=p_user and role='user' and created_at>coalesce((s.story_progress->>'chapterStartedAt')::timestamptz,s.started_at) and coalesce(provider_metadata->>'source','')<>'scenario_checkpoint') then raise exception 'PLAY_CHAPTER_FIRST' using errcode='23514';end if;
 checkpoint:=jsonb_build_object('chapterIndex',idx,'note',trim(p_note),'savedAt',clock_timestamp(),'locationId',s.current_location_id);
 update public.together_scenario_sessions set story_progress=jsonb_build_object('chapterIndex',least(idx+1,p_chapter_count-1),'chapterStartedAt',clock_timestamp(),'checkpoints',coalesce(s.story_progress->'checkpoints','[]'::jsonb)||jsonb_build_array(checkpoint)),status=case when idx=p_chapter_count-1 then 'completed' else 'active' end,updated_at=clock_timestamp() where id=s.id returning * into s;
 insert into public.together_messages(user_id,conversation_id,character_instance_id,role,content,delivery_status,provider_metadata,content_rating,visibility_scope,moderation_version)
 values(p_user,s.conversation_id,s.character_instance_id,'user','Story checkpoint: '||trim(p_note),'complete',jsonb_build_object('source','scenario_checkpoint','scenarioSessionId',s.id,'chapterIndex',idx),'suggestive','all','scenario-checkpoint-v1');
 receipt:=to_jsonb(s);
 insert into public.together_scenario_receipts values(s.id,p_request,receipt);
 return receipt;
end $$;
revoke all on function public.together_scenario_checkpoint(uuid,uuid,uuid,uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.together_scenario_checkpoint(uuid,uuid,uuid,uuid,integer,text,integer) to service_role;
-- Generated canonical placements and timer opt-out for converted arcs only.
insert into public.together_scenario_definitions(id,character_template_id,world_id,location_id,title) values
('story-eos-missing-seventeen-hours','24000000-0000-4000-8012-000000000029','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000011','The Seventeen Missing Hours'),
('eos-01','24000000-0000-4000-8012-000000000021','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000042','Do Not Answer Yet'),
('eos-09','24000000-0000-4000-8012-000000000002','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000008','The Independence Clause'),
('eos-08','24000000-0000-4000-8012-000000000012','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000030','Beyond the Edge of His Map'),
('story-neon-kyo-rating-change','22000000-0000-4000-8009-000000000017','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000028','The Rating Changed'),
('story-neon-kyo-offline-truth','22000000-0000-4000-8009-000000000024','10000000-0000-4000-8000-000000000009','28000000-0000-4000-8000-000000000037','A Night Completely Offline'),
('ves-01','22000000-0000-4000-8010-000000000001','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000009','A Chapter Left Blank'),
('ves-05','22000000-0000-4000-8010-000000000019','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000024','Warm Water, No Current'),
('story-vespormoor-missing-corridors','22000000-0000-4000-8010-000000000030','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000031','The Missing Corridors'),
('story-vespormoor-observatory-signal','22000000-0000-4000-8010-000000000029','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000034','The Observatory Signal'),
('ves-04','22000000-0000-4000-8010-000000000010','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000020','The Room That Waited'),
('story-vespormoor-northern-silence','22000000-0000-4000-8010-000000000034','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000044','The Northern Silence'),
('story-vespormoor-old-portrait','22000000-0000-4000-8010-000000000027','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000028','The Old Portrait'),
('por-08','22000000-0000-4000-8008-000000000031','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000010','A Berth with Your Name'),
('story-port-vervelle-small-table','22000000-0000-4000-8008-000000000032','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000049','The Small Table'),
('story-port-vervelle-no-scoreboard','22000000-0000-4000-8008-000000000033','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000020','No Scoreboard'),
('story-port-vervelle-off-the-clock','22000000-0000-4000-8008-000000000034','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000047','Off the Clock'),
('story-port-vervelle-one-of-one','22000000-0000-4000-8008-000000000039','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000036','One of One'),
('story-port-vervelle-after-burnout','22000000-0000-4000-8008-000000000035','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000033','After the Shift'),
('story-port-vervelle-free-sound','22000000-0000-4000-8008-000000000036','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000022','The Free Sound'),
('story-port-vervelle-old-stone-new-money','22000000-0000-4000-8008-000000000037','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000035','Old Stone, New Money'),
('por-09','22000000-0000-4000-8008-000000000038','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000010','The Reef Beneath the Party'),
('story-port-vervelle-own-vintage','22000000-0000-4000-8008-000000000040','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000039','His Own Vintage'),
('por-10','22000000-0000-4000-8008-000000000041','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000050','The Names Below the Waterline'),
('story-port-vervelle-serious-reputation','22000000-0000-4000-8008-000000000042','10000000-0000-4000-8000-000000000008','27000000-0000-4000-8000-000000000031','The Reputation'),
('story-juniper-summer-after','12000000-0000-4000-8000-000000000123','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000005','The Summer After'),
('jun-07','12000000-0000-4000-8000-000000000121','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000005','The River After Rain'),
('story-juniper-one-more-shift','12000000-0000-4000-8000-000000000115','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000014','One More Shift'),
('jun-04','12000000-0000-4000-8000-000000000104','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000015','The Hour She Kept'),
('story-juniper-unclosed-file','12000000-0000-4000-8000-000000000109','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000108','The Unclosed File'),
('story-juniper-first-big-piece','12000000-0000-4000-8000-000000000105','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000020','The First Big Piece'),
('story-juniper-second-location','12000000-0000-4000-8000-000000000106','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000008','Second Location'),
('jun-02','12000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000028','The Interview That Never Aired'),
('story-juniper-keep-the-room','12000000-0000-4000-8000-000000000119','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000014','Keep the Room'),
('story-juniper-story-she-wont-air','12000000-0000-4000-8000-000000000112','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000016','The Story She Won''t Air'),
('story-juniper-last-train-north','22000000-0000-4000-8001-000000000201','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000106','Last Train North'),
('story-juniper-choice-after-midnight','22000000-0000-4000-8001-000000000202','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000029','The Choice After Midnight'),
('story-juniper-riverside-vote','22000000-0000-4000-8001-000000000203','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000108','The Riverside Vote'),
('story-juniper-high-water','22000000-0000-4000-8001-000000000204','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000104','High Water'),
('story-juniper-keep-it-small','22000000-0000-4000-8001-000000000205','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000009','Keep It Small'),
('story-juniper-anonymous-source','22000000-0000-4000-8001-000000000206','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000019','The Anonymous Source'),
('story-juniper-signal-upgrade','22000000-0000-4000-8001-000000000207','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000106','The Signal Upgrade'),
('story-juniper-rivermark-offer','22000000-0000-4000-8001-000000000208','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000105','The Rivermark Offer'),
('story-juniper-accessible-city','22000000-0000-4000-8001-000000000209','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000108','The Accessible City'),
('story-juniper-night-platform','22000000-0000-4000-8001-000000000210','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000106','Night Platform'),
('story-juniper-closed-door-briefing','22000000-0000-4000-8001-000000000211','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000108','The Closed-Door Briefing'),
('story-juniper-landing-season','22000000-0000-4000-8001-000000000212','10000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000104','The Landing Season'),
('story-juniper-unit-she-built','22000000-0000-4000-8001-000000000213','10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000029','The Unit She Built'),
('story-vespormoor-stone-that-remembers','22000000-0000-4000-8010-000000000046','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000030','The Stone That Remembers'),
('story-vespormoor-repeated-patient','22000000-0000-4000-8010-000000000047','10000000-0000-4000-8000-000000000010','29000000-0000-4000-8000-000000000033','The Repeated Patient'),
('nor-06','24000000-0000-4000-8011-000000000004','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000013','The Names Beneath the Snow'),
('story-northvale-silver-basin-line','24000000-0000-4000-8011-000000000039','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000032','The Silver Basin Line'),
('story-northvale-one-more-winter','24000000-0000-4000-8011-000000000015','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000026','One More Winter'),
('story-northvale-last-reel','24000000-0000-4000-8011-000000000003','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000011','The Last Reel'),
('story-northvale-second-descent','24000000-0000-4000-8011-000000000025','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000035','Second Descent'),
('story-northvale-broken-cable','24000000-0000-4000-8011-000000000026','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000028','The Broken Cable'),
('story-northvale-cabin-mile-nine','24000000-0000-4000-8011-000000000005','10000000-0000-4000-8000-000000000011','2b000000-0000-4000-8000-000000000009','The Cabin at Mile Nine'),
('story-the-ashen-crown','24000000-0000-4000-8013-000000000038','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000044','The Ashen Crown'),
('vha-05','24000000-0000-4000-8013-000000000019','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000024','A Dragon Owes No Crown'),
('story-feast-of-falling-embers','24000000-0000-4000-8013-000000000001','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000008','The Feast of Falling Embers'),
('story-eos-ghost-passenger','24000000-0000-4000-8012-000000000014','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000023','The Ghost Passenger'),
('story-deepnail-awakening','24000000-0000-4000-8013-000000000013','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000020','The Dragon Beneath Deepnail'),
('vha-02','24000000-0000-4000-8013-000000000002','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000013','The Price of One Name'),
('vha-04','24000000-0000-4000-8013-000000000003','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000011','The Hymn They Buried'),
('story-the-prison-fleet','24000000-0000-4000-8013-000000000033','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000039','The Prison Fleet'),
('story-roots-outlive-crowns','24000000-0000-4000-8013-000000000024','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000030','Roots Outlive Crowns'),
('story-what-sinks-shall-rise','24000000-0000-4000-8013-000000000031','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000037','What Sinks Shall Rise'),
('vha-07','24000000-0000-4000-8013-000000000041','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000046','The Battlefield Remembers'),
('story-velvet-law','24000000-0000-4000-8013-000000000004','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000010','The Velvet Law'),
('story-the-scarlet-marriage','24000000-0000-4000-8013-000000000015','10000000-0000-4000-8000-000000000013','2d000000-0000-4000-8000-000000000021','The Scarlet Marriage'),
('cal-02','27a5c487-a218-52b9-8798-2906889b7faa','31740169-035e-5b10-8c9d-98b206e9f24b','3a99c001-cd13-588d-8adf-0ba57d924c39','Two Stakes out of Line'),
('story-calders-the-borrowed-horse','db699624-91b3-5c34-93ec-53c7974498fb','31740169-035e-5b10-8c9d-98b206e9f24b','602be10b-b09b-58df-965e-033a1ea401d8','The Borrowed Horse'),
('cal-04','ab4cfd68-d04d-5ebb-b874-e33648cca0c3','31740169-035e-5b10-8c9d-98b206e9f24b','7e80c107-194e-5283-9f41-8964f282e145','The Last Song Is Not Goodbye'),
('story-calders-water-after-dark','fe0749b0-c5c5-5fb0-825c-5faae2bb1360','31740169-035e-5b10-8c9d-98b206e9f24b','aac1591a-0117-5969-b59e-1f2d6b1b1ab1','Water After Dark'),
('story-calders-a-room-kept-warm','2a838e0f-f2e8-582a-8925-1380e8f9cc3b','31740169-035e-5b10-8c9d-98b206e9f24b','29628d1c-5f41-52d4-bd76-4bb8a82c7a68','A Room Kept Warm'),
('cal-05','cc342d4a-c160-5567-87aa-07506734b1f9','31740169-035e-5b10-8c9d-98b206e9f24b','4c788a8a-77fd-5fd4-8be8-e4b7a1d9aac0','The Assay That Could Buy a Town'),
('cal-03','63a4bf14-598c-509f-861f-46a1ce3c729b','31740169-035e-5b10-8c9d-98b206e9f24b','b8e6063d-69c1-5791-bb0d-595e8ea26148','Before the Ink Dries'),
('story-calders-a-door-of-her-own','dbc7cf13-72ae-587a-b3d1-468ca2f132b1','31740169-035e-5b10-8c9d-98b206e9f24b','0a1153f9-4db7-541b-99df-1c12023d649f','A Door of Her Own'),
('story-calders-closing-time','78bb861c-ec4e-5acb-9a14-211d669a33c6','31740169-035e-5b10-8c9d-98b206e9f24b','1a511bfe-6c6d-5942-bbae-6f85fa2a7217','Closing Time'),
('story-calders-the-letter-to-leave','fa092c09-c4c0-5ca4-8482-1c00cc7e5897','31740169-035e-5b10-8c9d-98b206e9f24b','65aa25c9-b4db-5710-8594-91642bddc294','The Letter to Leave'),
('story-calders-after-the-crossing','92c857eb-aaee-564a-83bf-ef4471c328ec','31740169-035e-5b10-8c9d-98b206e9f24b','be24fd5a-7571-5218-8101-70e25b0441b6','After the Crossing'),
('story-calders-the-terms-of-mercy','be0f7849-8182-5ee7-bb81-03aa9c1ec5e9','31740169-035e-5b10-8c9d-98b206e9f24b','5a7e186e-f4de-58d9-bbc5-861f9eeeecfd','The Terms of Mercy'),
('story-calders-the-red-sash-lease','48948de7-27bd-5a3c-8053-3afa6e59f55d','31740169-035e-5b10-8c9d-98b206e9f24b','38b0efd4-b1d9-5b32-bc1f-b0b711da47ca','The Red Sash Lease'),
('cal-10','bac209b8-8ee8-50c9-894d-5b767392884a','31740169-035e-5b10-8c9d-98b206e9f24b','8ea973d5-94fe-5c5c-8cb3-84a90abef76e','The Bandit Who Brought a Receipt'),
('eos-02','24000000-0000-4000-8012-000000000006','10000000-0000-4000-8000-000000000012','2c000000-0000-4000-8000-000000000019','The Unplanted Harvest')
on conflict(id) do update set character_template_id=excluded.character_template_id,world_id=excluded.world_id,location_id=excluded.location_id,title=excluded.title;
update public.together_story_arc_templates set prerequisites=prerequisites||'{"scenarioDriven":true}'::jsonb where slug in ('eos-missing-seventeen-hours','eos-beneath-night-ice','eos-independence-vote','eos-habitat-lyra','neon-kyo-rating-change','neon-kyo-offline-truth','vespormoor-future-book','vespormoor-beneath-lake','vespormoor-missing-corridors','vespormoor-observatory-signal','vespormoor-vale-return','vespormoor-northern-silence','vespormoor-old-portrait','port-vervelle-stay-or-sail','port-vervelle-small-table','port-vervelle-no-scoreboard','port-vervelle-off-the-clock','port-vervelle-one-of-one','port-vervelle-after-burnout','port-vervelle-free-sound','port-vervelle-old-stone-new-money','port-vervelle-damaged-water','port-vervelle-own-vintage','port-vervelle-below-the-chart','port-vervelle-serious-reputation','juniper-summer-after','juniper-field-report','juniper-one-more-shift','juniper-case-she-carries','juniper-unclosed-file','juniper-first-big-piece','juniper-second-location','juniper-off-the-record','juniper-keep-the-room','juniper-story-she-wont-air','juniper-last-train-north','juniper-choice-after-midnight','juniper-riverside-vote','juniper-high-water','juniper-keep-it-small','juniper-anonymous-source','juniper-signal-upgrade','juniper-rivermark-offer','juniper-accessible-city','juniper-night-platform','juniper-closed-door-briefing','juniper-landing-season','juniper-unit-she-built','vespormoor-stone-that-remembers','vespormoor-repeated-patient','northvale-white-sunday-log','northvale-silver-basin-line','northvale-one-more-winter','northvale-last-reel','northvale-second-descent','northvale-broken-cable','northvale-cabin-mile-nine','the-ashen-crown','three-unhatched-fires','feast-of-falling-embers','eos-ghost-passenger','deepnail-awakening','the-red-ledger','unbound-hymn','the-prison-fleet','roots-outlive-crowns','what-sinks-shall-rise','the-glassing-command','velvet-law','the-scarlet-marriage','calders-the-other-bank','calders-the-borrowed-horse','calders-the-last-encore','calders-water-after-dark','calders-a-room-kept-warm','calders-the-honest-weight','calders-the-price-of-news','calders-a-door-of-her-own','calders-closing-time','calders-the-letter-to-leave','calders-after-the-crossing','calders-the-terms-of-mercy','calders-the-red-sash-lease','calders-the-crowcut-reckoning','eos-solace-bloom');

-- Existing scoped scenario resets already renew started_at and preserve the relationship.
-- Also clear chapter notes so a reset cannot inherit a previous ending.
create function public.together_scenario_restart_progress() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.started_at is distinct from old.started_at then
  new.story_progress:='{"chapterIndex":0,"checkpoints":[]}'::jsonb;
  new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create trigger scenario_restart_progress before update of started_at on public.together_scenario_sessions for each row execute function public.together_scenario_restart_progress();
revoke all on function public.together_scenario_restart_progress() from public,anon,authenticated;
revoke all on function public.together_scenario_revision() from public,anon,authenticated;
grant execute on function public.together_scenario_restart_progress() to service_role;
grant execute on function public.together_scenario_revision() to service_role;

-- Old workers must not advance converted arcs while a rolling deploy is in progress.
create function public.together_scenario_hold_legacy_arc() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.together_story_arc_templates where slug=new.template_slug and prerequisites->>'scenarioDriven'='true') then return null;end if;
 return new;
end $$;
create trigger scenario_hold_legacy_arc before insert or update on public.together_story_arc_instances for each row execute function public.together_scenario_hold_legacy_arc();
revoke all on function public.together_scenario_hold_legacy_arc() from public,anon,authenticated;
grant execute on function public.together_scenario_hold_legacy_arc() to service_role;
create function public.together_scenario_hold_legacy_event() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.event_type='story_arc' and exists(select 1 from public.together_story_arc_templates where slug=new.metadata->>'arc_slug' and prerequisites->>'scenarioDriven'='true') then return null;end if;
 return new;
end $$;
create trigger scenario_hold_legacy_event before insert on public.together_life_events for each row execute function public.together_scenario_hold_legacy_event();
revoke all on function public.together_scenario_hold_legacy_event() from public,anon,authenticated;
grant execute on function public.together_scenario_hold_legacy_event() to service_role;
