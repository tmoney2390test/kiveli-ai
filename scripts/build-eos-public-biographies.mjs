import { writeFile } from 'node:fs/promises';
import { characters } from './eos-meridian-content.mjs';

export const migrationPath = 'supabase/migrations/20260927005824_eos_public_biographies.sql';

export function renderPublicBiographyMigration() {
  const payload = characters.map(({ templateId, biography }) => ({ template_id: templateId, bio: biography }));
  return `-- Keep public Eos introductions about the person. Plot hooks remain in
-- discovery_metadata.storyHook and the authored character bible.
begin;

with biographies as (
  select * from jsonb_to_recordset($eos_public_bios$${JSON.stringify(payload)}$eos_public_bios$::jsonb)
    as entry(template_id uuid, bio text)
)
update public.together_character_templates as template
set biography=biographies.bio,
    discovery_metadata=case
      when template.discovery_metadata->>'summary'=template.biography
      then jsonb_set(template.discovery_metadata,'{summary}',to_jsonb(biographies.bio),true)
      else template.discovery_metadata
    end,
    updated_at=now()
from biographies
where template.id=biographies.template_id
  and template.creator_id is null
  and template.discovery_metadata->>'residentWorldSlug'='eos-meridian'
  and nullif(template.discovery_metadata->>'storyHook','') is not null
  and right(trim(template.biography),length(trim(template.discovery_metadata->>'storyHook')))
      =trim(template.discovery_metadata->>'storyHook');

commit;
`;
}

if (process.argv.includes('--write')) await writeFile(migrationPath, renderPublicBiographyMigration());
