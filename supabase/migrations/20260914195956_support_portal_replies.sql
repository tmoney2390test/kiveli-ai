begin;
alter table public.together_support_tickets add column request_id uuid;
create unique index together_support_request_id_idx on public.together_support_tickets(user_id,request_id);
create table public.together_support_replies (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.together_support_tickets(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 sender text not null check(sender in ('customer','support')),
 message text not null check(length(btrim(message)) between 2 and 5000),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 unique(ticket_id,request_id)
);
create index together_support_replies_ticket_idx on public.together_support_replies(ticket_id,created_at,id);
alter table public.together_support_replies enable row level security;
revoke all on public.together_support_replies from public,anon,authenticated;
grant all on public.together_support_replies to service_role;
-- Only the authenticated edge handler chooses the sender role. Clients cannot call this RPC.
create function public.kivelle_reply_support_ticket(p_ticket_id uuid,p_author_id uuid,p_is_support boolean,p_message text,p_request_id uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare ticket public.together_support_tickets; existing public.together_support_replies; reply_id uuid; next_status text;
begin
 select * into ticket from public.together_support_tickets where id=p_ticket_id for update;
 if not found or (not p_is_support and ticket.user_id<>p_author_id) then raise exception 'Support ticket unavailable'; end if;
 select * into existing from public.together_support_replies where ticket_id=p_ticket_id and request_id=p_request_id;
 if found then
  if existing.author_id is distinct from p_author_id or existing.message<>btrim(p_message) or existing.sender<>(case when p_is_support then 'support' else 'customer' end) then raise exception 'Reply request conflict'; end if;
  return existing.id;
 end if;
 insert into public.together_support_replies(ticket_id,author_id,sender,message,request_id)
 values(p_ticket_id,p_author_id,case when p_is_support then 'support' else 'customer' end,btrim(p_message),p_request_id) returning id into reply_id;
 next_status:=case when p_is_support then 'waiting' else 'open' end;
 update public.together_support_tickets set status=next_status,resolved_at=null,updated_at=now(),
 first_response_at=case when p_is_support then coalesce(first_response_at,now()) else first_response_at end where id=p_ticket_id;
 insert into public.together_ops_ticket_events(ticket_id,actor_user_id,event_type,previous_state,next_state)
 values(p_ticket_id,p_author_id,'response',jsonb_build_object('status',ticket.status),jsonb_build_object('status',next_status,'replyId',reply_id,'sender',case when p_is_support then 'support' else 'customer' end));
 return reply_id;
end $$;
revoke all on function public.kivelle_reply_support_ticket(uuid,uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.kivelle_reply_support_ticket(uuid,uuid,boolean,text,uuid) to service_role;
commit;
