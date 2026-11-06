begin;

alter table public.together_support_tickets
 add column last_support_reply_at timestamptz,
 add column customer_read_at timestamptz;
-- Existing replies start read; enabling the inbox must not notify old cases.
update public.together_support_tickets t set
 last_support_reply_at=r.latest, customer_read_at=r.latest
from (select ticket_id,max(created_at) latest from public.together_support_replies where sender='support' group by ticket_id) r
where t.id=r.ticket_id;
create index together_support_unread_idx on public.together_support_tickets(user_id,last_support_reply_at desc)
 where last_support_reply_at is not null;
create index together_support_cursor_idx on public.together_support_tickets(user_id,created_at desc,id desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('kivelli-support-attachments','kivelli-support-attachments',false,5242880,array['image/jpeg']);
create table public.together_support_attachments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 storage_path text not null unique,
 byte_size integer not null check(byte_size between 1 and 5242880),
 width integer not null check(width between 1 and 2048),
 height integer not null check(height between 1 and 2048),
 status text not null default 'pending' check(status in ('pending','ready','removed')),
 ticket_id uuid references public.together_support_tickets(id) on delete cascade,
 reply_id uuid references public.together_support_replies(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 unique(user_id,request_id),
 check(reply_id is null or ticket_id is not null)
);
create index together_support_attachment_ticket_idx on public.together_support_attachments(ticket_id);
create index together_support_attachment_reply_idx on public.together_support_attachments(reply_id);
create index together_support_attachment_expiry_idx on public.together_support_attachments(expires_at) where ticket_id is null;
alter table public.together_support_attachments enable row level security;
revoke all on public.together_support_attachments from public,anon,authenticated;
grant all on public.together_support_attachments to service_role;
-- No Storage policies: only authenticated, ownership-checked server handlers
-- issue short-lived URLs. Screenshots never enter the public media gallery.
create function public.kivelli_support_attachment_cleanup() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 insert into public.together_storage_cleanup_jobs(user_id,bucket_id,storage_path,status,attempt_count)
 values(null,'kivelli-support-attachments',old.storage_path,'pending',0);
 return old;
end $$;
create trigger support_attachment_cleanup after delete on public.together_support_attachments
 for each row execute function public.kivelli_support_attachment_cleanup();
create function public.kivelli_support_retention_cleanup() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.metadata ? 'retentionPurgedAt' and not (old.metadata ? 'retentionPurgedAt') then
  delete from public.together_support_attachments where ticket_id=new.id;
 end if;
 return new;
end $$;
create trigger support_retention_attachments after update of metadata on public.together_support_tickets
 for each row execute function public.kivelli_support_retention_cleanup();

create function public.kivelli_attach_support_images(p_user_id uuid,p_ticket_id uuid,p_reply_id uuid,p_ids uuid[])
returns void language plpgsql security invoker set search_path=public as $$
declare attachment public.together_support_attachments; attached uuid[];
begin
 if cardinality(p_ids)>3 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'SUPPORT_ATTACHMENT_INVALID'; end if;
 select coalesce(array_agg(id order by id),'{}') into attached from public.together_support_attachments
 where ticket_id=p_ticket_id and reply_id is not distinct from p_reply_id;
 if cardinality(attached)>0 and attached is distinct from (select coalesce(array_agg(x order by x),'{}') from unnest(p_ids) x) then raise exception 'SUPPORT_REQUEST_CONFLICT'; end if;
 for attachment in select * from public.together_support_attachments where id=any(p_ids) order by id for update loop
  if attachment.user_id<>p_user_id or attachment.status<>'ready'
   or (attachment.ticket_id is null and attachment.expires_at<=now())
   or (attachment.ticket_id is not null and (attachment.ticket_id<>p_ticket_id or attachment.reply_id is distinct from p_reply_id))
   then raise exception 'SUPPORT_ATTACHMENT_UNAVAILABLE'; end if;
 end loop;
 if (select count(*) from public.together_support_attachments where id=any(p_ids))<>cardinality(p_ids) then raise exception 'SUPPORT_ATTACHMENT_UNAVAILABLE'; end if;
 update public.together_support_attachments set ticket_id=p_ticket_id,reply_id=p_reply_id where id=any(p_ids);
end $$;

create function public.kivelli_create_support_request(p_user_id uuid,p_request_id uuid,p_category text,p_subject text,p_message text,p_correlation_id text,p_conversation_id uuid,p_metadata jsonb,p_attachment_ids uuid[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; prior public.together_support_tickets; ids jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_request_id::text,0));
 select coalesce(jsonb_agg(x order by x),'[]') into ids from unnest(p_attachment_ids) x;
 select * into prior from public.together_support_tickets where user_id=p_user_id and request_id=p_request_id;
 if found and (coalesce(prior.metadata->'attachmentIds','[]')<>ids or prior.metadata->>'messageId' is distinct from p_metadata->>'messageId') then raise exception 'SUPPORT_REQUEST_CONFLICT'; end if;
 if p_metadata->>'messageId' is not null and not exists (
  select 1 from public.together_messages m join public.together_conversations c on c.id=m.conversation_id
  where m.id::text=p_metadata->>'messageId' and c.user_id=p_user_id and c.id=p_conversation_id
 ) then raise exception 'SUPPORT_TARGET_UNAVAILABLE'; end if;
 result=public.kivelle_create_support_ticket(p_user_id,p_request_id,p_category,p_subject,p_message,p_correlation_id,p_conversation_id,coalesce(p_metadata,'{}')||jsonb_build_object('attachmentIds',ids));
 perform public.kivelli_attach_support_images(p_user_id,(result->'ticket'->>'id')::uuid,null,p_attachment_ids);
 return result;
end $$;

alter table public.together_support_replies add column attachment_ids uuid[] not null default '{}';
create function public.kivelli_reply_support_request(p_ticket_id uuid,p_author_id uuid,p_is_support boolean,p_message text,p_request_id uuid,p_attachment_ids uuid[])
returns uuid language plpgsql security invoker set search_path=public as $$
declare reply uuid; prior public.together_support_replies; ids uuid[];
begin
 perform 1 from public.together_support_tickets where id=p_ticket_id for update;
 select coalesce(array_agg(x order by x),'{}') into ids from unnest(p_attachment_ids) x;
 select * into prior from public.together_support_replies where ticket_id=p_ticket_id and request_id=p_request_id;
 if found and prior.attachment_ids<>ids then raise exception 'SUPPORT_REQUEST_CONFLICT'; end if;
 reply=public.kivelle_reply_support_ticket(p_ticket_id,p_author_id,p_is_support,p_message,p_request_id);
 perform public.kivelli_attach_support_images(p_author_id,p_ticket_id,reply,ids);
 update public.together_support_replies set attachment_ids=ids where id=reply;
 return reply;
end $$;

create function public.kivelli_support_inbox(p_user_id uuid,p_filter text default 'all',p_search text default '',p_before_at timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; counts jsonb; pattern text;
begin
 if p_filter not in ('all','open','resolved') or length(p_search)>160 or (p_before_at is null)<>(p_before_id is null) then raise exception 'INVALID_SUPPORT_FILTER'; end if;
 pattern='%'||replace(replace(replace(btrim(p_search),'\','\\'),'%','\%'),'_','\_')||'%';
 select jsonb_build_object('open',count(*) filter(where status not in ('resolved','closed')),'resolved',count(*) filter(where status in ('resolved','closed')),
 'unread',count(*) filter(where last_support_reply_at>coalesce(customer_read_at,'-infinity'))) into counts
 from public.together_support_tickets where user_id=p_user_id;
 select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id desc),'[]') into result from (
  select id,ticket_number,category,subject,status,priority,created_at,updated_at,last_support_reply_at,
   coalesce(last_support_reply_at>coalesce(customer_read_at,'-infinity'),false) unread
  from public.together_support_tickets where user_id=p_user_id
   and (p_filter='all' or (p_filter='resolved')=(status in ('resolved','closed')))
   and (p_search='' or subject ilike pattern or ('Support-'||lpad(ticket_number::text,5,'0')) ilike pattern)
   and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id))
  order by created_at desc,id desc limit 31
 ) page;
 return jsonb_build_object('tickets',result,'counts',counts);
end $$;

create function public.kivelli_read_support_request(p_user_id uuid,p_ticket_id uuid,p_through timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
begin
 update public.together_support_tickets set customer_read_at=greatest(customer_read_at,p_through)
 where id=p_ticket_id and user_id=p_user_id and p_through<=last_support_reply_at
 and exists(select 1 from public.together_support_replies where ticket_id=p_ticket_id and sender='support' and created_at=p_through);
end $$;

create function public.kivelli_support_unread(p_user_id uuid) returns jsonb
language sql security invoker set search_path=public as $$
 select jsonb_build_object('count',(select count(*) from public.together_support_tickets where user_id=p_user_id and last_support_reply_at>coalesce(customer_read_at,'-infinity')),
 'tickets',(select coalesce(jsonb_agg(to_jsonb(t) order by last_support_reply_at desc),'[]') from (
  select id,ticket_number,subject,last_support_reply_at from public.together_support_tickets
  where user_id=p_user_id and last_support_reply_at>coalesce(customer_read_at,'-infinity') order by last_support_reply_at desc,id desc limit 5
 ) t));
$$;

alter table public.together_push_deliveries add column support_reply_id uuid references public.together_support_replies(id) on delete cascade;
create unique index together_support_reply_push_idx on public.together_push_deliveries(support_reply_id,push_token_id) where support_reply_id is not null;
create function public.kivelli_notify_support_reply() returns trigger
language plpgsql security invoker set search_path=public as $$
declare owner uuid;
begin
 if new.sender<>'support' then return new; end if;
 update public.together_support_tickets set last_support_reply_at=greatest(last_support_reply_at,new.created_at) where id=new.ticket_id returning user_id into owner;
 insert into public.together_push_deliveries(user_id,push_token_id,support_reply_id,status,expires_at,next_attempt_at,metadata)
 select owner,t.id,new.id,'queued',now()+interval '3 days',now(),jsonb_build_object('kind','support_reply','ticketId',new.ticket_id,'replyAt',new.created_at)
 from public.together_push_tokens t join public.together_notification_preferences p on p.user_id=t.user_id
 where t.user_id=owner and t.active and p.push_enabled order by t.id limit 5;
 return new;
end $$;
create trigger support_reply_notification after insert on public.together_support_replies for each row execute function public.kivelli_notify_support_reply();

-- Enrich existing transactional emails without replacing their outbox/quota flow.
create function public.kivelli_support_email_link() returns trigger
language plpgsql security invoker set search_path=public as $$
declare ticket uuid;
begin
 if new.kind='support_received' then ticket=substring(new.event_key from 18)::uuid;
 elsif new.kind in ('support_reply','support_followup') then
  select ticket_id into ticket from public.together_support_replies where id=substring(new.event_key from 15)::uuid;
 end if;
 if ticket is not null then new.payload=new.payload||jsonb_build_object('ticketId',ticket); end if;
 return new;
end $$;
create trigger support_email_link before insert on public.together_email_outbox for each row execute function public.kivelli_support_email_link();

revoke all on function public.kivelli_support_attachment_cleanup(),public.kivelli_support_retention_cleanup(),public.kivelli_support_unread(uuid),public.kivelli_attach_support_images(uuid,uuid,uuid,uuid[]),public.kivelli_create_support_request(uuid,uuid,text,text,text,text,uuid,jsonb,uuid[]),public.kivelli_reply_support_request(uuid,uuid,boolean,text,uuid,uuid[]),public.kivelli_support_inbox(uuid,text,text,timestamptz,uuid),public.kivelli_read_support_request(uuid,uuid,timestamptz),public.kivelli_notify_support_reply(),public.kivelli_support_email_link() from public,anon,authenticated;
grant execute on function public.kivelli_support_attachment_cleanup(),public.kivelli_support_retention_cleanup(),public.kivelli_support_unread(uuid),public.kivelli_attach_support_images(uuid,uuid,uuid,uuid[]),public.kivelli_create_support_request(uuid,uuid,text,text,text,text,uuid,jsonb,uuid[]),public.kivelli_reply_support_request(uuid,uuid,boolean,text,uuid,uuid[]),public.kivelli_support_inbox(uuid,text,text,timestamptz,uuid),public.kivelli_read_support_request(uuid,uuid,timestamptz),public.kivelli_notify_support_reply(),public.kivelli_support_email_link() to service_role;
commit;
