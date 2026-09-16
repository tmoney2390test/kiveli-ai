-- Disposable fixtures and outbox rows remain invisible to workers and roll back.
begin;
do $$
declare owner_id uuid=gen_random_uuid(); other_id uuid=gen_random_uuid(); persona uuid=gen_random_uuid(); life uuid=gen_random_uuid(); instance uuid=gen_random_uuid();
 chat uuid=gen_random_uuid(); newer uuid=gen_random_uuid(); media uuid=gen_random_uuid(); request uuid=gen_random_uuid(); repair uuid=gen_random_uuid();
 ticket uuid; result jsonb; repeated jsonb; ledger_count bigint;
begin
 if has_function_privilege('authenticated','public.kivelle_ops_recover_ticket(uuid,text,uuid,uuid,text,uuid,text)','execute') then raise exception 'Client can execute recovery'; end if;
 if has_table_privilege('authenticated','public.together_ops_recovery_actions','SELECT') then raise exception 'Client can read internal recovery'; end if;
 insert into auth.users(id,email) values(owner_id,owner_id::text||'@kivelli.invalid'),(other_id,other_id::text||'@kivelli.invalid');
 insert into public.together_profiles(user_id,display_name,age_verified_at) values(owner_id,'Recovery fixture',now()),(other_id,'Other fixture',now());
 insert into public.together_user_personas(id,user_id,name,display_name,is_default) values(persona,owner_id,'Main','Main',true);
 insert into public.together_continuities(id,user_id,persona_id,kind,title) values(life,owner_id,persona,'main','Recovery fixture');
 update public.together_profiles set active_continuity_id=life where user_id=owner_id;
 insert into public.together_character_instances(id,user_id,continuity_id,character_template_id,character_version_id)
 select instance,owner_id,life,t.id,v.id from public.together_character_templates t join public.together_character_versions v on v.character_template_id=t.id and v.version=t.current_published_version where t.published order by t.id limit 1;
 insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title,archived_at,user_archived_at,restore_until)
 values(chat,owner_id,life,instance,'direct','Archived fixture',now()-interval '1 day',now()-interval '1 day',now()+interval '29 days');
 insert into public.together_conversations(id,user_id,continuity_id,character_instance_id,kind,title) values(newer,owner_id,life,instance,'direct','Newer fixture');
 insert into public.together_generated_media(id,user_id,continuity_id,character_instance_id,subject_character_instance_ids,conversation_id,status) values(media,owner_id,life,instance,array[instance],chat,'ready');
 select count(*) into ledger_count from public.together_credit_ledger where user_id=owner_id;
 result=public.kivelle_create_support_ticket(owner_id,request,'bug','Recovery test','Synthetic rollback-only request',null,chat,jsonb_build_object('mediaId',media));
 repeated=public.kivelle_create_support_ticket(owner_id,request,'bug','Recovery test','Synthetic rollback-only request',null,chat,jsonb_build_object('mediaId',media));
 if result<>repeated then raise exception 'Ticket retry changed reference'; end if;
 ticket=(result->'ticket'->>'id')::uuid;
 if (select count(*) from public.together_support_tickets where user_id=owner_id and request_id=request)<>1 then raise exception 'Duplicate ticket'; end if;
 begin
  perform public.kivelle_create_support_ticket(other_id,gen_random_uuid(),'bug','Foreign media','Synthetic rollback-only request',null,null,jsonb_build_object('mediaId',media));
  raise exception 'Foreign media accepted';
 exception when others then if sqlerrm<>'SUPPORT_TARGET_UNAVAILABLE' then raise; end if; end;
 begin
  perform public.kivelle_ops_recover_ticket(owner_id,'viewer',ticket,gen_random_uuid(),'restore_chat',chat,'Fixture verified');
  raise exception 'Viewer repair accepted';
 exception when others then if sqlerrm<>'RECOVERY_NOT_AUTHORIZED' then raise; end if; end;
 begin
  perform public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,gen_random_uuid(),'refresh_delivery',media,'Fixture verified');
  raise exception 'Missing stored output accepted';
 exception when others then if sqlerrm<>'RECOVERY_OUTPUT_UNAVAILABLE' then raise; end if; end;
 begin
  perform public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,gen_random_uuid(),'restore_chat',newer,'Fixture verified');
  raise exception 'Unlinked chat accepted';
 exception when others then if sqlerrm<>'RECOVERY_TARGET_MISMATCH' then raise; end if; end;
 result=public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,repair,'restore_chat',chat,'Fixture verified');
 repeated=public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,repair,'restore_chat',chat,'Fixture verified');
 if result<>repeated then raise exception 'Repair retry changed outcome'; end if;
 if (select archived_at is null from public.together_conversations where id=newer) then raise exception 'Newer history not preserved'; end if;
 if (select archived_at is not null or user_archived_at is not null from public.together_conversations where id=chat) then raise exception 'Chat not restored'; end if;
 if (select count(*) from public.together_ops_recovery_actions where ticket_id=ticket)<>1 then raise exception 'Duplicate repair'; end if;
 update public.together_generated_media set status='generating' where id=media;
 insert into public.together_media_provider_jobs(job_type,provider,model,route_id,request_id,status,user_id,generated_media_id,provider_request_id,next_poll_at)
 values('image','wavespeed','fixture','fixture',gen_random_uuid()::text,'processing',owner_id,media,'rollback-only',now()+interval '1 hour');
 perform public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,gen_random_uuid(),'poll_media',media,'Fixture verified');
 if (select count(*) from public.together_media_provider_jobs where generated_media_id=media)<>1 then raise exception 'Poll created a second provider job'; end if;
 if (select next_poll_at>now() from public.together_media_provider_jobs where generated_media_id=media) then raise exception 'Poll not scheduled'; end if;
 insert into storage.objects(bucket_id,name) values('together-user-media',owner_id::text||'/rollback-fixture.jpg');
 update public.together_generated_media set status='ready',storage_path=owner_id::text||'/rollback-fixture.jpg' where id=media;
 perform public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,gen_random_uuid(),'refresh_delivery',media,'Fixture verified');
 if (select status<>'ready' or storage_path<>owner_id::text||'/rollback-fixture.jpg' from public.together_generated_media where id=media) then raise exception 'Refresh altered existing output'; end if;
 update public.together_conversations set archived_at=now()-interval '31 days',user_archived_at=now()-interval '31 days',restore_until=now()-interval '1 day' where id=chat;
 begin
  perform public.kivelle_ops_recover_ticket(owner_id,'admin',ticket,gen_random_uuid(),'restore_chat',chat,'Fixture verified');
  raise exception 'Expired recovery accepted';
 exception when others then if sqlerrm<>'RECOVERY_ARCHIVE_EXPIRED' then raise; end if; end;
 if (select count(*) from public.together_credit_ledger where user_id=owner_id)<>ledger_count then raise exception 'Recovery changed ledger'; end if;
end $$;
select 'PASS: ownership, role gates, ticket retry, repair retry, missing output, archive retention, newer history, audit and unchanged ledger' as result;
rollback;
