import type { World } from '../types';

const previews: World[] = [{
  id: 'preview-gilded-coast', slug: 'gilded-coast', name: 'The Gilded Coast',
  description: 'Fortunes change hands. Loyalties do too. Enter a working age-of-sail harbor of captains, islanders, artists, and dangerous bargains.',
  access_type: 'free', timezone: 'UTC', sort_order: 1000, featured: false,
  published: false, visual_context: {},
  metadata: { catalog_status: 'coming_soon', genreTags: ['Pirate adventure', 'Adult drama'], relationshipFantasy: 'Fortunes change hands. Loyalties do too.' },
}];

export function isComingSoonWorld(world: World): boolean {
  return world.metadata?.catalog_status === 'coming_soon' || world.metadata?.coming_soon === true;
}

/** Preview records stay outside the playable snapshot and never replace a released world. */
export function withComingSoonWorlds(worlds: World[]): World[] {
  return [...worlds, ...previews.filter((preview) => !worlds.some((world) => world.slug === preview.slug && world.published))];
}
