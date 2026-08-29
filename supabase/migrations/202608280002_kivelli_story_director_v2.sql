begin;

alter table public.together_story_definitions
  add column if not exists content_version integer not null default 1 check (content_version > 0),
  add column if not exists persistence_policy text not null default 'knowledge-persists-loop-resets';

alter table public.together_story_campaigns
  add column if not exists content_version integer not null default 1 check (content_version > 0),
  add column if not exists persistence_policy text not null default 'knowledge-persists-loop-resets';

update public.together_story_definitions
set content_version = 2,
    persistence_policy = 'knowledge-persists-loop-resets',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'directorVersion', 2,
      'characterPacketCount', 47,
      'coreCharacterCount', 12,
      'locationPacketMode', 'explicit_plus_safe_ambient',
      'normalMemoryIsolation', true
    ),
    updated_at = now()
where slug = 'the-last-night-in-vespormoor';

-- Version-one campaign columns already contain the complete deterministic state.
-- Mark them as compatible with the generalized director without resetting progress.
update public.together_story_campaigns
set content_version = 2,
    persistence_policy = 'knowledge-persists-loop-resets',
    last_checkpoint = coalesce(last_checkpoint, '{}'::jsonb) || jsonb_build_object(
      'contentMigration', 'story-director-v2',
      'migratedWithoutProgressReset', true
    ),
    updated_at = now()
where story_slug = 'the-last-night-in-vespormoor'
  and content_version < 2;

comment on column public.together_story_campaigns.content_version is
  'Versioned authored Story content used to create or compatibly migrate this campaign.';
comment on column public.together_story_campaigns.persistence_policy is
  'Registered server-side Story persistence adapter. Never delegates canonical state to an AI provider.';

commit;
