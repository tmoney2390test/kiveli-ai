-- Sable's public Sunday block already has specific variants. Make its base
-- activity equally specific for readers that do not select a variant.
update public.together_schedule_templates schedule
set activity = schedule.metadata->>'activityLabel',
    metadata = schedule.metadata || jsonb_build_object('scheduleEditorialVersion', 'copy_v2')
from public.together_character_versions version,
     public.together_character_templates person
where schedule.character_version_id = version.id
  and version.character_template_id = person.id
  and person.slug = 'sable-wren'
  and schedule.metadata->>'source' = 'vharadren_sable_wren_v1'
  and schedule.activity = 'Following a personal Crownrest routine'
  and nullif(schedule.metadata->>'activityLabel', '') is not null;
