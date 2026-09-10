import { describe, expect, it } from 'vitest';
import { hasOpenBuildWorldAccess, isSubscriberEarlyAccessWorld, isWorldCatalogVisible, OPEN_PUBLISHED_WORLDS_DURING_BUILD, worldCatalogStatus, worldCatalogStatusPatch } from './world-access';

describe('temporary open-world build policy', () => {
  it('opens ordinary published worlds during development', () => {
    expect(OPEN_PUBLISHED_WORLDS_DURING_BUILD).toBe(true);
    expect(hasOpenBuildWorldAccess(true)).toBe(true);
  });

  it('keeps subscriber early-access worlds behind membership', () => {
    const metadata = { subscriber_early_access: true };
    expect(isSubscriberEarlyAccessWorld(metadata)).toBe(true);
    expect(hasOpenBuildWorldAccess(true, metadata)).toBe(false);
  });

  it('does not expose unpublished worlds', () => {
    expect(hasOpenBuildWorldAccess(false)).toBe(false);
  });

  it('derives all three operator-facing catalog states', () => {
    expect(worldCatalogStatus({ published: true, metadata: {} })).toBe('released');
    expect(worldCatalogStatus({ published: true, metadata: { subscriber_early_access: true } })).toBe('early_access');
    expect(worldCatalogStatus({ published: true, metadata: { catalog_status: 'hidden' } })).toBe('hidden');
    expect(worldCatalogStatus({ published: false, metadata: {} })).toBe('hidden');
  });

  it('keeps a hidden world out of every catalog access path', () => {
    const metadata = { catalog_status: 'hidden' };
    expect(isWorldCatalogVisible({ published: true, metadata })).toBe(false);
    expect(hasOpenBuildWorldAccess(true, metadata)).toBe(false);
  });

  it('builds authoritative released and early-access patches', () => {
    const current = { published: true, accessType: 'subscription', entitlementKey: 'worlds.standard', metadata: { subscriber_early_access: true } };
    expect(worldCatalogStatusPatch(current, 'released')).toMatchObject({ published: true, access_type: 'free', entitlement_key: null, metadata: { catalog_status: 'released', early_access: false } });
    expect(worldCatalogStatusPatch(current, 'early_access')).toMatchObject({ published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: { catalog_status: 'early_access', early_access: true, subscriber_early_access: true } });
  });

  it('hides only the catalog layer so established conversations retain their world contract', () => {
    const hidden = worldCatalogStatusPatch({ published: true, accessType: 'subscription', entitlementKey: 'worlds.standard', metadata: { subscriber_early_access: true } }, 'hidden');
    expect(hidden).toMatchObject({ published: true, access_type: 'subscription', entitlement_key: 'worlds.standard', metadata: { catalog_status: 'hidden', subscriber_early_access: true } });
    expect(isWorldCatalogVisible({ published: hidden.published, metadata: hidden.metadata })).toBe(false);
  });
});
