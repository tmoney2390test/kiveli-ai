import type { CharacterTemplate, CharacterVersion, Snapshot } from '../types';

export type FeaturedCompanion = CharacterTemplate & { together_character_versions: CharacterVersion };

export function featuredCompanionsForWorld(snapshot: Snapshot, worldId: string, activeTemplateId?: string): FeaturedCompanion[] {
  const eligibleVersions = new Set((snapshot.characterWorldPresence ?? [])
    .filter((presence) => presence.world_id === worldId && presence.presence_type !== 'unavailable')
    .map((presence) => presence.character_version_id));

  const scoped = (snapshot.discoverableCharacters ?? [])
    .filter((template) => template.can_be_selected !== false && !['draft', 'archived'].includes(String(template.lifecycle_status ?? 'published')))
    .filter((template) => {
      const instance = snapshot.characters.find((item) => item.character_template_id === template.id);
      const instanceLocation = instance ? snapshot.locations.find((location) => location.id === instance.current_location_id) : undefined;
      return template.first_meeting?.world_id === worldId
        || eligibleVersions.has(template.together_character_versions.id)
        || instanceLocation?.world_id === worldId;
    })
    .sort((left, right) => featuredScore(right) - featuredScore(left) || left.name.localeCompare(right.name));

  const alternatives = scoped.filter((template) => template.id !== activeTemplateId);
  return alternatives.length ? alternatives : scoped;
}

function featuredScore(template: FeaturedCompanion) {
  const metadata = template.discovery_metadata ?? {};
  return Number(metadata.featured === true) * 8
    + Number(metadata.trending === true) * 5
    + Number(metadata.new === true) * 3
    + Number(template.creator_id == null);
}
