import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { isComingSoonWorld, withComingSoonWorlds } from './comingSoonWorlds';
import { canAccessWorld } from './place';
import { compareWorldSelectorOrder } from './worldSelectorOrder';

describe('coming soon world previews', () => {
  const preview = withComingSoonWorlds([])[0]!;
  it('does not mutate the playable catalog or duplicate a released world', () => {
    const released = { ...preview, id: 'released-id', published: true, metadata: {} };
    const catalog = [released];
    expect(withComingSoonWorlds(catalog)).toEqual([released]);
    expect(catalog).toEqual([released]);
    expect(isComingSoonWorld(released)).toBe(false);
  });
  it('cannot be unlocked by a membership or owned-world entitlement', () => {
    for (const tier of ['free', 'kivelle_plus', 'kivelle_max']) {
      const snapshot = { entitlements: { tier }, userWorlds: [{ world_id: preview.id, access_status: 'unlocked' }] } as unknown as Snapshot;
      expect(canAccessWorld(snapshot, preview)).toBe(false);
      expect(canAccessWorld(snapshot, { ...preview, published: true })).toBe(false);
    }
  });
  it('puts previews after early access and released worlds, regardless of authored order', () => {
    const released = { ...preview, id: 'released', published: true, sort_order: 100, metadata: {} };
    const early = { ...released, id: 'early', sort_order: 0, metadata: { catalog_status: 'early_access' } };
    expect([preview, early, released].sort(compareWorldSelectorOrder).map((world) => world.id)).toEqual(['released', 'early', preview.id]);
  });
});
