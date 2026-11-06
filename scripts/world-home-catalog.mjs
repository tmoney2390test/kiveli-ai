import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { editWorldHome } from '../content/homes/worlds/editorial.mjs';

export const worldHomeCounts = {
  'calders-run': 69, 'gilded-coast': 56, 'juniper-city': 58, 'neon-kyo': 65,
  northvale: 65, 'port-vervelle': 64, vespormoor: 67, vharadren: 72,
};
const eras = {
  'calders-run': 'Southwest frontier town in 1888. Period wood, plaster and textiles; natural light and oil lamps. No electrical appliances, telephones, modern plumbing fixtures or modern vehicles. The railway bridge stays outside the frame.',
  'gilded-coast': 'Age-of-sail coastal fantasy. Salt-worn timber, plaster, linen and handmade domestic objects; oil lamps or candles. No modern electronics, appliances or electric fixtures.',
  'juniper-city': 'Contemporary lived-in city apartment, with ordinary modern household furnishings.',
  'neon-kyo': 'Lived-in cyberpunk city residence; subtle practical technology, comfortable furnishings and human-scale rooms, not an all-neon bunker or corporate showroom.',
  northvale: 'Contemporary alpine town. Practical heat, current household furnishings and believable mountain weather; not a ski-resort showroom.',
  'port-vervelle': 'Contemporary Mediterranean coastal town. Modern everyday domestic life inside locally built architecture; not a hotel or vacation rental.',
  vespormoor: 'Present-day gothic university town. Older local architecture adapted for contemporary life, practical modern lights and current furnishings. No medieval castle staging.',
  vharadren: 'Late-medieval high-fantasy world. Weathered stone or timber, handwoven fabrics, oil lamps or candles. No electronics, modern appliances or electric lighting.',
};
export async function loadWorldHomes(world) {
  if (!(world in worldHomeCounts)) throw Error('Unknown home world');
  const homes = JSON.parse(await readFile(new URL(`../content/homes/worlds/${world}.json`, import.meta.url), 'utf8')).map(editWorldHome);
  validateWorldHomes(world, homes);
  return homes;
}
export function validateWorldHomes(world, homes) {
  if (homes.length !== worldHomeCounts[world]) throw Error(`${world}: expected ${worldHomeCounts[world]}, found ${homes.length}`);
  for (const field of ['homeId', 'slug', 'name', 'description', 'windowOutlook', 'interiorStyle']) {
    if (new Set(homes.map(h => h[field])).size !== homes.length) throw Error(`${world}: duplicate ${field}`);
  }
  for (const h of homes) {
    if (h.world !== world || h.description.length < 80 || h.description.length > 800) throw Error(`Invalid home ${h.slug}`);
    if (h.details.length !== 3 || h.activities.length !== 6 || new Set(h.activities.map(s => s.toLowerCase())).size !== 6) throw Error(`Incomplete details or activities: ${h.slug}`);
    for (const s of [...h.details, ...h.activities, h.description, h.interiorStyle, h.windowOutlook]) {
      if (!s.trim() || /\b(?:undefined|meticulously curated|a tapestry of|a sanctuary of|a testament to|familiar routine)\b|\[object Object\]/i.test(s)) throw Error(`Editorial check: ${h.slug}: ${s}`);
    }
    if (h.activities.some(a => a.length > 100)) throw Error(`Activity too long: ${h.slug}`);
  }
}
export function homeArtworkPrompt(h) {
  return `Photorealistic architectural photograph of ${h.name}, a private lived-in home. ${eras[h.world]} ${h.description} INTERIOR: ${h.interiorStyle} PERSONAL OBJECTS: ${h.details.join(' ')} WINDOW OUTLOOK: ${h.windowOutlook}. One coherent main room, believable domestic scale, physically connected furniture, realistic window placement. Show the three personal objects clearly enough to recognize. Natural perspective, practical lighting, comfortable fabric and surface wear; strong individual character rather than a sterile showroom. A private bedroom in a shared household stays a private bedroom, not a new independent house. No people, faces, animals, captions, readable text, UI, brand logos, public signage, weapons displays or workplace machinery. No collage, split image or duplicate room. Preserve this room's furnishings, personal objects and window outlook in future scenes; later scene lighting must follow the user's current time.`;
}
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
export function homeSeedSql(world, homes) {
  validateWorldHomes(world, homes);
  const payload = homes.map(h => ({ ...h, prompt: homeArtworkPrompt(h), scene:[h.description,h.interiorStyle,'Window: '+h.windowOutlook,'Personal objects: '+h.details.join(' '),'Use the scene’s current local time and lighting.'].join(' '),details: h.details.map((description, i) => ({ id: `detail-${i + 1}`, description })) }));
  const revision = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `-- Authored home expansion: ${world}. Artwork is staged before visits are released.
begin;
do $home_seed$
declare item jsonb; target uuid; matches integer;
begin
  for item in select * from jsonb_array_elements(${quote(JSON.stringify(payload))}::jsonb) loop
    select count(*), (array_agg(h.id))[1] into matches,target
    from public.together_character_homes h
    join public.together_character_versions v on v.id=h.character_version_id
    join public.together_character_templates t on t.id=v.character_template_id
    join public.together_worlds w on w.id=h.world_id
    where t.slug=item->>'slug' and w.slug=${quote(world)} and w.published
      and h.active and t.published and t.creator_id is null and v.version=t.current_published_version;
    if matches<>1 then raise exception 'Expected one current home for %, found %',item->>'slug',matches; end if;
    update public.together_character_homes h set
      name=item->>'name',description=item->>'description',prompt_text=item->>'scene',artwork_prompt=item->>'prompt',
      personal_details=item->'details',possible_activities=array(select jsonb_array_elements_text(item->'activities')),
      source='authored',reference_policy='optional',prompt_version=h.prompt_version+1,
      canonical_visual_context=h.canonical_visual_context||jsonb_build_object(
        'indoorOutdoor','indoor','environmentReferencePolicy','optional',
        'architecture',jsonb_build_array(h.residence_type,item->>'interiorStyle'),
        'windowOutlook',item->>'windowOutlook','interiorStyle',item->>'interiorStyle',
        'recurringObjects',(select jsonb_agg(d->>'description') from jsonb_array_elements(item->'details') d),
        'canonicalPrompt',item->>'scene'),
      canonical_lore=h.canonical_lore||jsonb_build_object(
        'summary',item->>'description','personalDetails',item->'details',
        'windowOutlook',item->>'windowOutlook','interiorStyle',item->>'interiorStyle',
        'homeCatalogRevision',${quote(revision)},
        'stableFacts',coalesce(h.canonical_lore->'stableFacts','[]'::jsonb)||jsonb_build_array(
          'This is a private home, separate from public work and recreation areas.',
          'The user is physically here only during an accepted, active home visit.',
          'Household membership does not give visitors entry to anyone else\u2019s room.',
          item->>'windowOutlook',item->>'interiorStyle')),updated_at=now()
    where h.id=target and h.canonical_lore->>'homeCatalogRevision' is distinct from ${quote(revision)};
  end loop;
end $home_seed$;
-- Explicit, one-time catalog jobs. Visits remain off until artwork is reviewed.
insert into public.together_home_artwork(home_id,prompt_text)
select h.id,h.artwork_prompt from public.together_character_homes h
join public.together_character_versions v on v.id=h.character_version_id
join public.together_character_templates t on t.id=v.character_template_id
join public.together_worlds w on w.id=h.world_id
where w.slug=${quote(world)} and w.published and h.active and t.published and t.creator_id is null
  and v.version=t.current_published_version and h.canonical_lore->>'homeCatalogRevision'=${quote(revision)}
  and h.approved_artwork_id is null and not exists(select 1 from public.together_home_artwork a where a.home_id=h.id);
commit;
`;
}
