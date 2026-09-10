/**
 * Temporary product-build switch. Published worlds are usable without a
 * purchase unless their catalog metadata explicitly marks them as subscriber
 * early access. Unpublished worlds remain hidden and inaccessible.
 */
export const OPEN_PUBLISHED_WORLDS_DURING_BUILD = true;

export const worldCatalogStatuses = ['released', 'early_access', 'hidden'] as const;
export type WorldCatalogStatus = typeof worldCatalogStatuses[number];

type WorldCatalogRecord = {
  published: boolean;
  accessType?: string | null;
  entitlementKey?: string | null;
  metadata?: unknown;
};

function worldMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

export function isSubscriberEarlyAccessWorld(metadata: unknown): boolean {
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && (metadata as Record<string, unknown>)['subscriber_early_access'] === true);
}

export function worldCatalogStatus(world: Pick<WorldCatalogRecord, 'published' | 'metadata'>): WorldCatalogStatus {
  const metadata = worldMetadata(world.metadata);
  if (!world.published || metadata['catalog_status'] === 'hidden') return 'hidden';
  if (metadata['catalog_status'] === 'early_access' || isSubscriberEarlyAccessWorld(metadata)) return 'early_access';
  return 'released';
}

export function isWorldCatalogVisible(world: Pick<WorldCatalogRecord, 'published' | 'metadata'>): boolean {
  return worldCatalogStatus(world) !== 'hidden';
}

export function worldCatalogStatusPatch(world: WorldCatalogRecord, status: WorldCatalogStatus): {
  published: boolean;
  access_type: 'free' | 'subscription' | 'premium';
  entitlement_key: string | null;
  metadata: Record<string, unknown>;
} {
  const metadata = worldMetadata(world.metadata);
  metadata['catalog_status'] = status;
  if (status === 'released') {
    metadata['early_access'] = false;
    delete metadata['subscriber_early_access'];
    return { published: true, access_type: 'free', entitlement_key: null, metadata };
  }
  if (status === 'early_access') {
    metadata['early_access'] = true;
    metadata['subscriber_early_access'] = true;
    return { published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata };
  }
  // Hiding is a catalog-only preproduction switch. Preserve the underlying
  // access configuration and published row so established conversations keep
  // their authored world, place, schedule, and media context.
  return {
    published: world.published,
    access_type: world.accessType === 'free' || world.accessType === 'premium' ? world.accessType : 'subscription',
    entitlement_key: world.entitlementKey ?? null,
    metadata,
  };
}

export function hasOpenBuildWorldAccess(published: boolean, metadata?: unknown): boolean {
  return OPEN_PUBLISHED_WORLDS_DURING_BUILD && isWorldCatalogVisible({ published, metadata }) && !isSubscriberEarlyAccessWorld(metadata);
}
