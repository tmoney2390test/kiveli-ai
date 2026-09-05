begin;

-- Maris and Celia shipped with complete weekly schedules, but their rows lacked
-- the marker consumed by the live presence resolver. Keep the authored copy and
-- location choices intact while making those schedules authoritative in chat,
-- Home, and character profiles.
update public.together_schedule_templates
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'scheduleMode', 'authored',
  'profileVisibility', 'visible',
  'worldSlug', 'vharadren',
  'userLocalClock', true
)
where character_version_id in (
  '25000000-0000-4000-8013-000000000051'::uuid,
  '25000000-0000-4000-8013-000000000052'::uuid
);

-- The reference-media migration already established the secure canonical
-- identity. Reassert the public portrait key/status so existing instances and
-- every client surface resolve the same packaged portrait immediately.
update public.together_character_versions
set portrait_asset_key = template.slug,
    appearance_config = coalesce(together_character_versions.appearance_config, '{}'::jsonb)
      || jsonb_build_object('photoStatus', 'ready', 'portraitStatus', 'reference_ready'),
    updated_at = now()
from public.together_character_templates template
where together_character_versions.character_template_id = template.id
  and together_character_versions.version = template.current_published_version
  and template.slug in ('princess-maris-vaelorian', 'celia-thatch');

update public.together_character_templates
set discovery_metadata = coalesce(discovery_metadata, '{}'::jsonb) || jsonb_build_object(
      'portraitStatus', 'ready',
      'portraitSlotKey', 'vharadren-character-' || slug,
      'portraitFocalPosition', 'top'
    ),
    updated_at = now()
where slug in ('princess-maris-vaelorian', 'celia-thatch');

update public.together_character_world_presence presence
set metadata = coalesce(presence.metadata, '{}'::jsonb) || jsonb_build_object(
      'portraitStatus', 'ready',
      'dynamicSchedule', true,
      'scheduleMode', 'authored',
      'scheduleProfile', 'vharadren_rich_weekly_v1',
      'userLocalClock', true
    ),
    updated_at = now()
where presence.character_version_id in (
  '25000000-0000-4000-8013-000000000051'::uuid,
  '25000000-0000-4000-8013-000000000052'::uuid
)
  and presence.world_id = '10000000-0000-4000-8000-000000000013'::uuid;

do $$
declare
  authored_schedule_count integer;
  portrait_count integer;
  presence_count integer;
begin
  select count(*) into authored_schedule_count
  from public.together_schedule_templates
  where character_version_id in (
    '25000000-0000-4000-8013-000000000051'::uuid,
    '25000000-0000-4000-8013-000000000052'::uuid
  )
    and metadata->>'scheduleMode' = 'authored'
    and metadata->>'profileVisibility' = 'visible';

  select count(*) into portrait_count
  from public.together_character_versions version
  join public.together_character_templates template
    on template.id = version.character_template_id
   and template.current_published_version = version.version
  where template.slug in ('princess-maris-vaelorian', 'celia-thatch')
    and version.portrait_asset_key = template.slug
    and version.appearance_config->>'portraitStatus' = 'reference_ready';

  select count(*) into presence_count
  from public.together_character_world_presence
  where character_version_id in (
    '25000000-0000-4000-8013-000000000051'::uuid,
    '25000000-0000-4000-8013-000000000052'::uuid
  )
    and world_id = '10000000-0000-4000-8000-000000000013'::uuid
    and metadata->>'scheduleMode' = 'authored'
    and metadata->>'portraitStatus' = 'ready';

  if authored_schedule_count <> 84 or portrait_count <> 2 or presence_count <> 2 then
    raise exception
      'Vharadren new-character repair failed: authored schedules %, portraits %, presences %',
      authored_schedule_count, portrait_count, presence_count;
  end if;
end $$;

commit;
