begin;

create index if not exists together_story_campaigns_continuity_owner_idx
  on public.together_story_campaigns(continuity_id, user_id);

commit;
