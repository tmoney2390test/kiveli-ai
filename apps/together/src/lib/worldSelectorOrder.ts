import { worldCatalogStatus } from '@together/domain/src/world-access';
import type { World } from '../types';

export function worldReleaseRank(world: World): number {
  if (!world.published || world.metadata?.catalog_status === 'coming_soon' || world.metadata?.coming_soon === true) return 2;
  return worldCatalogStatus(world) === 'early_access' ? 1 : 0;
}

/** Presentation only: visibility and membership access remain with the caller. */
export function compareWorldSelectorOrder(left: World, right: World): number {
  return worldReleaseRank(left) - worldReleaseRank(right) || left.sort_order - right.sort_order;
}
