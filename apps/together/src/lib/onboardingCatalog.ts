import type { Snapshot, World } from '../types';
import { featuredCompanionsForWorld, type FeaturedCompanion } from './featuredCompanions';

export function onboardingWorlds(snapshot: Snapshot): World[] {
  return snapshot.worlds
    .filter((world) => world.published)
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
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
