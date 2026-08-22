/**
 * Temporary product-build switch. While this is true, every published world is
 * usable without a purchase or subscription. Unpublished worlds remain hidden
 * and inaccessible.
 */
export const OPEN_PUBLISHED_WORLDS_DURING_BUILD = true;

export function hasOpenBuildWorldAccess(published: boolean): boolean {
  return OPEN_PUBLISHED_WORLDS_DURING_BUILD && published;
}
