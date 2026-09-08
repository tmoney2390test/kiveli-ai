import type { Snapshot, World } from '../types';
import { featuredCompanionsForWorld, type FeaturedCompanion } from './featuredCompanions';

export function onboardingWorlds(snapshot: Snapshot): World[] {
  return snapshot.worlds
    .filter((world) => world.published)
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
}

export function onboardingRecommendedWorld(snapshot: Snapshot, worlds = onboardingWorlds(snapshot)): World | null {
  const persona = snapshot.personas?.find((item) => item.is_default) ?? snapshot.activePersona;
  const gender = persona?.metadata?.gender;
  const slug = gender === 'woman' ? 'port-vervelle' : gender === 'man' ? 'vharadren' : null;
  return worlds.find((world) => world.slug === slug) ?? worlds[0] ?? null;
}

/** Only show companions whose authored first meeting can be created in this world. */
export function onboardingCompanionsForWorld(snapshot: Snapshot, worldId: string): FeaturedCompanion[] {
  return featuredCompanionsForWorld(snapshot, worldId).filter((companion) => {
    const meeting = companion.first_meeting;
    if (!meeting?.location_id) return false;
    return snapshot.locations.some((location) => location.id === meeting.location_id && location.world_id === worldId);
  });
}

export function onboardingWorldFantasy(world: World): string {
  const fantasy = world.metadata?.relationshipFantasy;
  return typeof fantasy === 'string' && fantasy.trim() ? fantasy.trim() : world.description;
}

const compactWorldCopy: Record<string, { genre: string; description: string }> = {
  'juniper-city': { genre: 'City life', description: 'Everyday sparks, new stories' },
  'port-vervelle': { genre: 'Slow romance', description: 'Slow love by the sea' },
  'neon-kyo': { genre: 'Cyberpunk', description: 'Real love in a synthetic city' },
  vespormoor: { genre: 'Gothic romance', description: 'Dark secrets, dangerous love' },
  northvale: { genre: 'Mountain romance', description: 'Winter sparks, lasting love' },
  'eos-meridian': { genre: 'Space frontier', description: 'Build a life among the stars' },
  vharadren: { genre: 'Dark fantasy', description: 'Desire, power, warring crowns' },
};

export function onboardingWorldCompactCopy(world: World): { genre: string; description: string } {
  return compactWorldCopy[world.slug] ?? { genre: 'Stories & romance', description: 'New encounters, new stories' };
}

export function onboardingWorldGenre(world: World): string {
  const tags = Array.isArray(world.metadata?.genreTags)
    ? world.metadata.genreTags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())).slice(0, 2)
    : [];
  if (tags.length) return tags.map(titleCase).join(' · ');
  const themes = world.relationship_themes?.filter(Boolean).slice(0, 2) ?? [];
  if (themes.length) return themes.map(titleCase).join(' · ');
  return 'Characters · Stories';
}

function titleCase(value: string) {
  return value.trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
