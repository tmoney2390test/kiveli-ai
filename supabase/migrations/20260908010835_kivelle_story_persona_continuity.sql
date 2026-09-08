begin;

alter table public.together_story_campaigns
  add column if not exists continuity_id uuid;

update public.together_story_campaigns campaign
set continuity_id = (
  select continuity.id
  from public.together_continuities continuity
  left join public.together_profiles profile
    on profile.user_id = campaign.user_id
  where continuity.user_id = campaign.user_id
  order by
    (continuity.id = profile.active_continuity_id) desc,
    (continuity.kind = 'main') desc,
    continuity.created_at,
    continuity.id
  limit 1
)
where campaign.continuity_id is null;

do $$
begin
  if exists (
    select 1
    from public.together_story_campaigns campaign
    where campaign.continuity_id is null
  ) then
    raise exception 'Every Story campaign must resolve to an owned Kivelle Life before this migration can continue';
  end if;
end
$$;

create unique index if not exists together_continuities_id_user_idx
  on public.together_continuities(id, user_id);

create or replace function public.kivelle_assign_story_campaign_continuity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.continuity_id is null then
    select continuity.id
    into new.continuity_id
    from public.together_continuities continuity
    left join public.together_profiles profile
      on profile.user_id = new.user_id
    where continuity.user_id = new.user_id
    order by
      (continuity.id = profile.active_continuity_id) desc,
      (continuity.kind = 'main') desc,
      continuity.created_at,
      continuity.id
    limit 1;
  end if;

  return new;
end
$$;

revoke all on function public.kivelle_assign_story_campaign_continuity() from public, anon, authenticated;

drop trigger if exists together_story_campaigns_assign_continuity on public.together_story_campaigns;
create trigger together_story_campaigns_assign_continuity
  before insert on public.together_story_campaigns
  for each row execute function public.kivelle_assign_story_campaign_continuity();

alter table public.together_story_campaigns
  alter column continuity_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'together_story_campaigns_continuity_owner_fkey'
      and conrelid = 'public.together_story_campaigns'::regclass
  ) then
    alter table public.together_story_campaigns
      add constraint together_story_campaigns_continuity_owner_fkey
      foreign key (continuity_id, user_id)
      references public.together_continuities(id, user_id)
      on delete cascade;
  end if;
end
$$;

drop index if exists public.together_story_campaigns_one_active_idx;
create unique index together_story_campaigns_one_active_idx
  on public.together_story_campaigns(user_id, continuity_id, story_slug)
  where status in ('active','midnight');

drop index if exists public.together_story_campaigns_user_recent_idx;
create index together_story_campaigns_user_recent_idx
  on public.together_story_campaigns(user_id, continuity_id, last_played_at desc);

create index if not exists together_story_campaigns_definition_idx
  on public.together_story_campaigns(story_definition_id);

drop policy if exists "Users read their story campaigns" on public.together_story_campaigns;
create policy "Users read their story campaigns" on public.together_story_campaigns
  for select using ((select auth.uid()) = user_id);

comment on column public.together_story_campaigns.continuity_id is
  'The Kivelle Life and Persona boundary for this private Story campaign.';

commit;
