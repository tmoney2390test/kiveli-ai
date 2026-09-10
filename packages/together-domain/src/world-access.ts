/**
 * Temporary product-build switch. Published worlds are usable without a
 * purchase unless their catalog metadata explicitly marks them as subscriber
 * early access. Unpublished worlds remain hidden and inaccessible.
 */
export const OPEN_PUBLISHED_WORLDS_DURING_BUILD = true;

export function isSubscriberEarlyAccessWorld(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && (metadata as Record<string, unknown>)['subscriber_early_access'] === true);
}

export function hasOpenBuildWorldAccess(published: boolean, metadata?: unknown): boolean {
  return OPEN_PUBLISHED_WORLDS_DURING_BUILD && published && !isSubscriberEarlyAccessWorld(metadata);
}
