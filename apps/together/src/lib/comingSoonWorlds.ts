import type { World } from '../types';

const previews: World[] = [{
  id: 'preview-gilded-age', slug: 'gilded-age', name: 'The Gilded Age',
  description: 'Pirate adventure among tropical harbors, hidden fortunes, and dangerous alliances.',
  access_type: 'free', timezone: 'UTC', sort_order: 1000, featured: false,
  published: false, visual_context: {},
  metadata: { catalog_status: 'coming_soon', genreTags: ['Pirate adventure'], relationshipFantasy: 'Fortunes beyond the horizon' },
}];

export function isComingSoonWorld(world: World): boolean {
  return world.metadata?.catalog_status === 'coming_soon' || world.metadata?.coming_soon === true;
}

/** Preview records stay outside the playable snapshot and never replace a released world. */
export function withComingSoonWorlds(worlds: World[]): World[] {
  return [...worlds, ...previews.filter((preview) => !worlds.some((world) => world.slug === preview.slug))];
}
