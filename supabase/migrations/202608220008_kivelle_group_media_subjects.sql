begin;

alter table public.together_generated_media
  drop constraint if exists together_generated_media_subject_count_check,
  drop constraint if exists together_generated_media_anchor_subject_check;
alter table public.together_generated_media
  add constraint together_generated_media_subject_count_check
    check(cardinality(subject_character_instance_ids) between 1 and 2) not valid,
  add constraint together_generated_media_anchor_subject_check
    check(character_instance_id=any(subject_character_instance_ids)) not valid;
alter table public.together_generated_media validate constraint together_generated_media_subject_count_check;
alter table public.together_generated_media validate constraint together_generated_media_anchor_subject_check;

alter table public.together_media_offers
  drop constraint if exists together_media_offers_subject_count_check,
  drop constraint if exists together_media_offers_anchor_subject_check;
alter table public.together_media_offers
  add constraint together_media_offers_subject_count_check
    check(cardinality(subject_character_instance_ids) between 1 and 2) not valid,
  add constraint together_media_offers_anchor_subject_check
    check(character_instance_id=any(subject_character_instance_ids)) not valid;
alter table public.together_media_offers validate constraint together_media_offers_subject_count_check;
alter table public.together_media_offers validate constraint together_media_offers_anchor_subject_check;

create or replace function public.kivelle_validate_media_subject_roster()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_subject_count integer;
  v_conversation_kind text;
begin
  if cardinality(new.subject_character_instance_ids) <> (
    select count(distinct subject_id)
    from unnest(new.subject_character_instance_ids) as selected(subject_id)
  ) then
    raise exception using errcode='23514',message='media subjects must be unique';
  end if;

  select count(*) into v_subject_count
  from public.together_character_instances instance
  where instance.id=any(new.subject_character_instance_ids)
    and instance.user_id=new.user_id
    and instance.continuity_id=new.continuity_id;
  if v_subject_count <> cardinality(new.subject_character_instance_ids) then
    raise exception using errcode='23514',message='media subjects must belong to the same user and Kivelle Life';
  end if;

  if new.conversation_id is not null then
    select conversation.kind into v_conversation_kind
    from public.together_conversations conversation
    where conversation.id=new.conversation_id
      and conversation.user_id=new.user_id
      and conversation.continuity_id=new.continuity_id;
    if not found then
      raise exception using errcode='23514',message='media conversation must belong to the same user and Kivelle Life';
    end if;
    if v_conversation_kind='group' and exists(
      select 1
      from unnest(new.subject_character_instance_ids) as selected(subject_id)
      where not exists(
        select 1
        from public.together_conversation_participants participant
        where participant.conversation_id=new.conversation_id
          and participant.character_instance_id=selected.subject_id
          and participant.user_id=new.user_id
          and participant.continuity_id=new.continuity_id
          and participant.left_at is null
      )
    ) then
      raise exception using errcode='23514',message='group media subjects must be active conversation participants';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.kivelle_validate_media_subject_roster() from public,anon,authenticated;

drop trigger if exists together_generated_media_validate_subjects on public.together_generated_media;
create trigger together_generated_media_validate_subjects
before insert or update of user_id,continuity_id,conversation_id,character_instance_id,subject_character_instance_ids
on public.together_generated_media for each row execute function public.kivelle_validate_media_subject_roster();

drop trigger if exists together_media_offers_validate_subjects on public.together_media_offers;
create trigger together_media_offers_validate_subjects
before insert or update of user_id,continuity_id,conversation_id,character_instance_id,subject_character_instance_ids
on public.together_media_offers for each row execute function public.kivelle_validate_media_subject_roster();

create table if not exists public.together_generated_media_subjects(
  generated_media_id uuid not null references public.together_generated_media(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete restrict,
  ordinal smallint not null check(ordinal between 0 and 1),
  role text not null default 'subject' check(role in('subject')),
  created_at timestamptz not null default now(),
  primary key(generated_media_id,character_instance_id),
  unique(generated_media_id,ordinal)
);
create index if not exists together_generated_media_subject_character_idx
  on public.together_generated_media_subjects(user_id,character_instance_id,created_at desc);
alter table public.together_generated_media_subjects enable row level security;
drop policy if exists together_generated_media_subjects_own_read on public.together_generated_media_subjects;
create policy together_generated_media_subjects_own_read on public.together_generated_media_subjects
  for select to authenticated using(auth.uid()=user_id);
revoke all on public.together_generated_media_subjects from public,anon,authenticated;
grant select on public.together_generated_media_subjects to authenticated;
grant select,insert,update,delete on public.together_generated_media_subjects to service_role;

create table if not exists public.together_media_offer_subjects(
  media_offer_id uuid not null references public.together_media_offers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  continuity_id uuid not null references public.together_continuities(id) on delete cascade,
  character_instance_id uuid not null references public.together_character_instances(id) on delete restrict,
  ordinal smallint not null check(ordinal between 0 and 1),
  role text not null default 'subject' check(role in('subject')),
  created_at timestamptz not null default now(),
  primary key(media_offer_id,character_instance_id),
  unique(media_offer_id,ordinal)
);
create index if not exists together_media_offer_subject_character_idx
  on public.together_media_offer_subjects(user_id,character_instance_id,created_at desc);
alter table public.together_media_offer_subjects enable row level security;
drop policy if exists together_media_offer_subjects_own_read on public.together_media_offer_subjects;
create policy together_media_offer_subjects_own_read on public.together_media_offer_subjects
  for select to authenticated using(auth.uid()=user_id);
revoke all on public.together_media_offer_subjects from public,anon,authenticated;
grant select on public.together_media_offer_subjects to authenticated;
grant select,insert,update,delete on public.together_media_offer_subjects to service_role;

create or replace function public.kivelle_sync_generated_media_subjects()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.together_generated_media_subjects where generated_media_id=new.id;
  insert into public.together_generated_media_subjects(generated_media_id,user_id,continuity_id,character_instance_id,ordinal)
  select new.id,new.user_id,new.continuity_id,subject_id,(position-1)::smallint
  from unnest(new.subject_character_instance_ids) with ordinality as selected(subject_id,position);
  return new;
end;
$$;
drop trigger if exists together_generated_media_sync_subjects on public.together_generated_media;
create trigger together_generated_media_sync_subjects
after insert or update of subject_character_instance_ids on public.together_generated_media
for each row execute function public.kivelle_sync_generated_media_subjects();

create or replace function public.kivelle_sync_media_offer_subjects()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from public.together_media_offer_subjects where media_offer_id=new.id;
  insert into public.together_media_offer_subjects(media_offer_id,user_id,continuity_id,character_instance_id,ordinal)
  select new.id,new.user_id,new.continuity_id,subject_id,(position-1)::smallint
  from unnest(new.subject_character_instance_ids) with ordinality as selected(subject_id,position);
  return new;
end;
$$;
drop trigger if exists together_media_offers_sync_subjects on public.together_media_offers;
create trigger together_media_offers_sync_subjects
after insert or update of subject_character_instance_ids on public.together_media_offers
for each row execute function public.kivelle_sync_media_offer_subjects();

insert into public.together_generated_media_subjects(generated_media_id,user_id,continuity_id,character_instance_id,ordinal)
select media.id,media.user_id,media.continuity_id,selected.subject_id,(selected.position-1)::smallint
from public.together_generated_media media
cross join lateral unnest(media.subject_character_instance_ids) with ordinality as selected(subject_id,position)
on conflict do nothing;

insert into public.together_media_offer_subjects(media_offer_id,user_id,continuity_id,character_instance_id,ordinal)
select offer.id,offer.user_id,offer.continuity_id,selected.subject_id,(selected.position-1)::smallint
from public.together_media_offers offer
cross join lateral unnest(offer.subject_character_instance_ids) with ordinality as selected(subject_id,position)
on conflict do nothing;

comment on table public.together_generated_media_subjects is 'Normalized, ordered companion subjects for generated media; arrays remain a compatibility cache.';
comment on table public.together_media_offer_subjects is 'Normalized, ordered companion subjects confirmed before media generation.';

commit;
