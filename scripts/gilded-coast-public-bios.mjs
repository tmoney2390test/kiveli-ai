import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { gildedCast } from '../content/gilded-coast/cast.mjs';
import { gildedPublicBios } from '../content/gilded-coast/public-bios.mjs';

const worldId = '10000000-0000-4000-8000-000000000014';
const quote = (value) => `'${value.replaceAll("'", "''")}'`;

export function renderGildedPublicBioMigration() {
  const rows = Object.entries(gildedPublicBios).sort(([a], [b]) => a.localeCompare(b));
  if (rows.length !== 56 || gildedCast.some(({ slug }) => !gildedPublicBios[slug])) {
    throw new Error('Gilded Coast public biographies must cover all 56 known residents.');
  }
  const values = rows.map(([slug, biography]) => `  (${quote(slug)}, ${quote(biography)})`).join(',\n');
  return `-- Replace public story hooks with work-and-personality biographies.
-- Preserve authored incidents and private motives in separate character fields.
begin;
create temporary table _gilded_public_bios (slug text primary key, biography text not null) on commit drop;
insert into _gilded_public_bios (slug, biography) values
${values};

do $$
begin
  if (select count(distinct t.id)
      from public.together_character_templates t
      join public.together_character_versions v on v.character_template_id = t.id and v.version = t.current_published_version
      join public.together_character_world_presence p on p.character_version_id = v.id
      join _gilded_public_bios b on b.slug = t.slug
      where p.world_id = '${worldId}'::uuid and p.presence_type = 'resident') < ${gildedCast.length} then
    raise exception 'Gilded Coast base roster is missing; public biographies were not changed';
  end if;
end $$;

update public.together_character_templates t
set biography = b.biography, updated_at = now()
from _gilded_public_bios b,
     public.together_character_versions v,
     public.together_character_world_presence p
where t.slug = b.slug
  and v.character_template_id = t.id and v.version = t.current_published_version
  and p.character_version_id = v.id
  and p.world_id = '${worldId}'::uuid and p.presence_type = 'resident'
  and t.biography is distinct from b.biography;

update public.together_character_versions v
set character_bible = jsonb_set(
      case when v.character_bible ? 'biography'
             and not v.character_bible ? 'backstory'
             and nullif(v.character_bible->>'biography', '') is not null
        then jsonb_set(v.character_bible, '{backstory}', v.character_bible->'biography', true)
        else coalesce(v.character_bible, '{}'::jsonb)
      end,
      '{biography}', to_jsonb(b.biography), true),
    updated_at = now()
from public.together_character_templates t,
     public.together_character_world_presence p,
     _gilded_public_bios b
where v.character_template_id = t.id and v.version = t.current_published_version
  and p.character_version_id = v.id
  and p.world_id = '${worldId}'::uuid and p.presence_type = 'resident'
  and t.slug = b.slug
  and (v.character_bible->>'biography' is distinct from b.biography
       or (v.character_bible ? 'biography' and not v.character_bible ? 'backstory'));
commit;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Pass the migration file path to write.');
  await writeFile(destination, renderGildedPublicBioMigration(), 'utf8');
}
