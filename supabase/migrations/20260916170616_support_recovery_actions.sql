begin;

create table public.together_ops_recovery_actions (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.together_support_tickets(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 action text not null check(action in ('restore_chat','refresh_delivery','poll_media','reconcile_membership')),
 target_id uuid not null,
 reason text not null check(length(btrim(reason)) between 8 and 500),
 outcome jsonb not null,
 created_at timestamptz not null default now(),
 unique(actor_id,request_id)
);
alter table public.together_ops_recovery_actions enable row level security;
revoke all on public.together_ops_recovery_actions from public,anon,authenticated;
grant all on public.together_ops_recovery_actions to service_role;
create index together_ops_recovery_ticket_idx on public.together_ops_recovery_actions(ticket_id,created_at);

-- Service-only RPC: role and identity are selected by the authenticated Ops
-- handler. Each local repair and its audit record commit in the same transaction.
create function public.kivelle_ops_recover_ticket(p_actor_id uuid,p_role text,p_ticket_id uuid,p_request_id uuid,p_action text,p_target_id uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ticket public.together_support_tickets; prior public.together_ops_recovery_actions;
 media public.together_generated_media; chat public.together_conversations;
 result jsonb; before_state jsonb; affected integer;
begin
 if p_role not in ('support','admin') or length(btrim(p_reason)) not between 8 and 500 then raise exception 'RECOVERY_NOT_AUTHORIZED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text||':'||p_request_id::text,0));
 select * into prior from public.together_ops_recovery_actions where actor_id=p_actor_id and request_id=p_request_id;
 if found then
  if prior.ticket_id<>p_ticket_id or prior.action<>p_action or prior.target_id<>p_target_id or prior.reason<>btrim(p_reason) then raise exception 'RECOVERY_REQUEST_CONFLICT'; end if;
  return prior.outcome;
 end if;
 select * into ticket from public.together_support_tickets where id=p_ticket_id for update;
 if not found or not exists(select 1 from public.together_profiles where user_id=ticket.user_id) then raise exception 'RECOVERY_TARGET_UNAVAILABLE'; end if;
 if exists(select 1 from public.together_account_deletion_markers where user_id=ticket.user_id) then raise exception 'RECOVERY_TARGET_UNAVAILABLE'; end if;
 if p_action='restore_chat' then
  if ticket.conversation_id is distinct from p_target_id then raise exception 'RECOVERY_TARGET_MISMATCH'; end if;
  select * into chat from public.together_conversations where id=p_target_id and user_id=ticket.user_id for update;
  if not found or chat.user_archived_at is null or chat.restore_until<=now() or chat.restore_until is null then raise exception 'RECOVERY_ARCHIVE_EXPIRED'; end if;
  before_state=jsonb_build_object('archivedAt',chat.user_archived_at,'restoreUntil',chat.restore_until,'continuityId',chat.continuity_id);
  perform public.kivelle_restore_conversation(ticket.user_id,p_target_id);
  result=jsonb_build_object('status','restored','message','The retained chat is back in Messages. Newer history is preserved.');
 elsif p_action in ('refresh_delivery','poll_media') then
  if ticket.metadata->>'mediaId' is distinct from p_target_id::text then raise exception 'RECOVERY_TARGET_MISMATCH'; end if;
  select * into media from public.together_generated_media where id=p_target_id and user_id=ticket.user_id for update;
  if not found then raise exception 'RECOVERY_TARGET_UNAVAILABLE'; end if;
  before_state=jsonb_build_object('status',media.status,'updatedAt',media.updated_at,'continuityId',media.continuity_id);
  if p_action='refresh_delivery' then
   if media.status<>'ready' or media.storage_path is null or not exists(select 1 from storage.objects where bucket_id='together-user-media' and name=media.storage_path) then raise exception 'RECOVERY_OUTPUT_UNAVAILABLE'; end if;
   -- Refresh the existing record/offer only. No new message, asset, generation,
   -- credit charge, visibility change or resurrection of a deleted record.
   update public.together_generated_media set updated_at=now() where id=media.id;
   update public.together_media_offers set status='fulfilled',failure_code=null,failure_reason_safe=null,updated_at=now()
    where id=media.media_offer_id and user_id=ticket.user_id and generated_media_id=media.id and status in ('accepted','fulfilled');
   result=jsonb_build_object('status','refreshed','message','Existing media delivery refreshed. No generation or credit charge was started.');
  else
   if media.status not in ('queued','generating') then raise exception 'RECOVERY_MEDIA_NOT_ACTIVE'; end if;
   update public.together_media_provider_jobs set next_poll_at=now(),updated_at=now()
    where generated_media_id=media.id and user_id=ticket.user_id and provider='wavespeed' and provider_request_id is not null
     and status in ('submitted','processing') and finalized_at is null
     and (poll_lease_expires_at is null or poll_lease_expires_at<now())
     and (finalization_lease_expires_at is null or finalization_lease_expires_at<now());
   get diagnostics affected=row_count;
   if affected=0 then raise exception 'RECOVERY_POLL_UNAVAILABLE'; end if;
   result=jsonb_build_object('status','scheduled','message','The existing provider request is scheduled for a status check. No new generation was started.');
  end if;
 else raise exception 'RECOVERY_ACTION_UNAVAILABLE';
 end if;
 insert into public.together_ops_recovery_actions(ticket_id,actor_id,request_id,action,target_id,reason,outcome)
 values(p_ticket_id,p_actor_id,p_request_id,p_action,p_target_id,btrim(p_reason),result);
 insert into public.together_ops_audit_log(actor_user_id,actor_role,action,target_type,target_id,request_id,reason_safe,metadata)
 values(p_actor_id,p_role,'support_recovery_'||p_action,'support_ticket',p_ticket_id::text,p_request_id::text,btrim(p_reason),jsonb_build_object('targetId',p_target_id,'affectedUserId',ticket.user_id,'before',before_state,'after',result));
 insert into public.together_ops_ticket_events(ticket_id,actor_user_id,event_type,note_safe,previous_state,next_state)
 values(p_ticket_id,p_actor_id,'note',btrim(p_reason),before_state,result);
 return result;
end $$;
revoke all on function public.kivelle_ops_recover_ticket(uuid,text,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kivelle_ops_recover_ticket(uuid,text,uuid,uuid,text,uuid,text) to service_role;

create function public.kivelle_create_support_ticket(p_user_id uuid,p_request_id uuid,p_category text,p_subject text,p_message text,p_correlation_id text,p_conversation_id uuid,p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ticket public.together_support_tickets;
begin
 if p_request_id is null then raise exception 'SUPPORT_REQUEST_ID_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_request_id::text,0));
 select * into ticket from public.together_support_tickets where user_id=p_user_id and request_id=p_request_id;
 if found then
  if ticket.category<>p_category or ticket.subject<>btrim(p_subject) or ticket.message<>btrim(p_message) or ticket.conversation_id is distinct from p_conversation_id or ticket.metadata->>'mediaId' is distinct from p_metadata->>'mediaId' or ticket.metadata->>'purchaseReference' is distinct from p_metadata->>'purchaseReference' then raise exception 'SUPPORT_REQUEST_CONFLICT'; end if;
 else
  if p_conversation_id is not null and not exists(select 1 from public.together_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'SUPPORT_TARGET_UNAVAILABLE'; end if;
  if p_metadata->>'mediaId' is not null and not exists(select 1 from public.together_generated_media where id::text=p_metadata->>'mediaId' and user_id=p_user_id) then raise exception 'SUPPORT_TARGET_UNAVAILABLE'; end if;
  insert into public.together_support_tickets(user_id,request_id,category,subject,message,correlation_id,conversation_id,metadata)
  values(p_user_id,p_request_id,p_category,btrim(p_subject),btrim(p_message),p_correlation_id,p_conversation_id,coalesce(p_metadata,'{}')||jsonb_build_object('support_email_status','queued')) returning * into ticket;
  insert into public.together_ops_ticket_events(ticket_id,actor_user_id,event_type,next_state)
  values(ticket.id,p_user_id,'created',jsonb_build_object('status',ticket.status,'ticketNumber',ticket.ticket_number));
 end if;
 return jsonb_build_object('ticket',jsonb_build_object('id',ticket.id,'ticket_number',ticket.ticket_number,'status',ticket.status,'created_at',ticket.created_at),'emailDelivery',coalesce(ticket.metadata->>'support_email_status','queued'));
end $$;
revoke all on function public.kivelle_create_support_ticket(uuid,uuid,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kivelle_create_support_ticket(uuid,uuid,text,text,text,text,uuid,jsonb) to service_role;
commit;
