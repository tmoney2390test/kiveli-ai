-- Keep attachment policy independent from private adult text policy. Explicit
-- media must always remain web-only even when its containing message is an
-- approved private-adult-text row that can appear in the standard timeline.

create or replace function public.kivelle_apply_attachment_policy() returns trigger
language plpgsql set search_path=public as $$
declare
  v_message public.together_messages%rowtype;
begin
  -- A completed media analysis is authoritative for the attachment itself.
  -- Never downgrade explicit media to the containing message's visibility.
  if new.content_rating = 'explicit' then
    new.visibility_scope := 'web_adult';
    if coalesce(new.moderation_version, '') in ('', 'unclassified', 'private-adult-text-v1') then
      new.moderation_version := 'web-adult-upload-v1';
    end if;
    return new;
  end if;

  if new.analysis_status = 'ready'
     and new.content_rating in ('safe', 'suggestive')
     and coalesce(new.moderation_version, '') not in ('', 'unclassified') then
    new.visibility_scope := 'all';
    return new;
  end if;

  -- Pending or unclassified attachments inherit conservatively until their own
  -- analysis completes. Restricted messages cannot make an attachment public.
  if new.message_id is not null then
    select * into v_message from public.together_messages where id = new.message_id;
    if found then
      new.content_rating := v_message.content_rating;
      new.visibility_scope := case
        when v_message.visibility_scope = 'all'
         and v_message.content_rating in ('safe', 'suggestive') then 'all'
        else 'web_adult'
      end;
      new.moderation_version := coalesce(nullif(v_message.moderation_version, ''), 'message-policy-v1');
    end if;
  end if;

  if new.content_rating is null then
    new.visibility_scope := 'web_adult';
    new.moderation_version := 'unclassified';
  end if;
  return new;
end $$;

-- Repair rows affected by the old trigger. No media bytes are changed.
update public.together_conversation_attachments
set visibility_scope = 'web_adult',
    moderation_version = case
      when coalesce(moderation_version, '') in ('', 'unclassified', 'private-adult-text-v1')
        then 'web-adult-upload-v1'
      else moderation_version
    end,
    updated_at = now()
where content_rating = 'explicit'
  and (
    visibility_scope <> 'web_adult'
    or coalesce(moderation_version, '') in ('', 'unclassified', 'private-adult-text-v1')
  );

alter table public.together_conversation_attachments
  drop constraint if exists together_conversation_attachments_explicit_private;
alter table public.together_conversation_attachments
  add constraint together_conversation_attachments_explicit_private
  check (content_rating <> 'explicit' or visibility_scope = 'web_adult') not valid;
alter table public.together_conversation_attachments
  validate constraint together_conversation_attachments_explicit_private;

