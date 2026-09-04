begin;

create or replace function public.kivelle_set_default_conversation_title()
returns trigger
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  character_name text;
  first_name text;
  supplied_title text:=btrim(coalesce(new.title,''));
begin
  if new.kind not in ('direct','first_meeting') or new.character_instance_id is null then
    return new;
  end if;

  if supplied_title<>''
    and supplied_title!~* '^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[[:space:]]+(January|February|March|April|May|June|July|August|September|October|November|December)[[:space:]]+[0-9]{1,2}$'
    and lower(supplied_title) not in ('first conversation','first conversations') then
    return new;
  end if;

  select template.name
  into character_name
  from public.together_character_instances instance
  join public.together_character_templates template on template.id=instance.character_template_id
  where instance.id=new.character_instance_id
    and instance.user_id=new.user_id;

  first_name:=split_part(
    regexp_replace(
      btrim(coalesce(character_name,'')),
      '^(Dr\.?|Doctor|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Mx\.?)[[:space:]]+',
      '',
      'i'
    ),
    ' ',
    1
  );

  if nullif(first_name,'') is not null then
    new.title:='Chat with '||first_name;
  end if;
  return new;
end;
$$;

revoke all on function public.kivelle_set_default_conversation_title() from public,anon,authenticated;

drop trigger if exists together_conversations_default_title on public.together_conversations;
create trigger together_conversations_default_title
before insert on public.together_conversations
for each row execute function public.kivelle_set_default_conversation_title();

with companion_names as(
  select
    instance.id as character_instance_id,
    instance.user_id,
    split_part(
      regexp_replace(
        btrim(template.name),
        '^(Dr\.?|Doctor|Prof\.?|Professor|Mr\.?|Mrs\.?|Ms\.?|Mx\.?)[[:space:]]+',
        '',
        'i'
      ),
      ' ',
      1
    ) as first_name
  from public.together_character_instances instance
  join public.together_character_templates template on template.id=instance.character_template_id
)
update public.together_conversations conversation
set title='Chat with '||companion.first_name,
    updated_at=now()
from companion_names companion
where conversation.character_instance_id=companion.character_instance_id
  and conversation.user_id=companion.user_id
  and conversation.kind in ('direct','first_meeting')
  and nullif(companion.first_name,'') is not null
  and(
    nullif(btrim(conversation.title),'') is null
    or btrim(conversation.title)~* '^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[[:space:]]+(January|February|March|April|May|June|July|August|September|October|November|December)[[:space:]]+[0-9]{1,2}$'
    or lower(btrim(conversation.title)) in ('first conversation','first conversations')
  );

comment on function public.kivelle_set_default_conversation_title() is
  'Names untitled or legacy date-titled direct conversations Chat with <companion first name> while preserving user-authored titles.';

commit;
