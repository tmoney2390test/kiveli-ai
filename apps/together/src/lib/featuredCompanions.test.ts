import { describe, expect, it } from 'vitest';
import { featuredCompanionsForWorld } from './featuredCompanions';
import type { Snapshot } from '../types';

const version = (id: string) => ({ id, portrait_asset_key: id, interests: [], personality_config: {} });
const template = (id: string, worldId: string, featured = false) => ({ id, name: id, slug: id, age: 28, occupation: 'Creative', biography: '', can_be_selected: true, lifecycle_status: 'published' as const, discovery_metadata: { featured }, first_meeting: { world_id: worldId, location_id: `${worldId}-place`, title: 'Meet', setup: '', companion_activity: '', mood: 'curious', opening_line: 'Hi' }, together_character_versions: version(`${id}-version`) });
const snapshot = { discoverableCharacters: [template('juniper-featured', 'juniper', true), template('juniper-other', 'juniper'), template('tokyo-person', 'tokyo')], characters: [], characterWorldPresence: [], locations: [] } as unknown as Snapshot;

describe('featured companions', () => {
  it('never leaks companions from another selected world', () => {
    expect(featuredCompanionsForWorld(snapshot, 'juniper').map((item) => item.id)).toEqual(['juniper-featured', 'juniper-other']);
  });

  it('omits the primary companion when another scoped choice exists', () => {
    expect(featuredCompanionsForWorld(snapshot, 'juniper', 'juniper-featured').map((item) => item.id)).toEqual(['juniper-other']);
  });

  it('uses world presence when a companion has no first-meeting world', () => {
    const visitor = { ...template('visitor', 'elsewhere'), first_meeting: undefined };
    const withVisitor = { ...snapshot, discoverableCharacters: [...snapshot.discoverableCharacters, visitor], characterWorldPresence: [{ id: 'presence', character_version_id: visitor.together_character_versions.id, world_id: 'juniper', presence_type: 'visitor', familiarity: 0, visited_count: 0, metadata: {} }] } as unknown as Snapshot;
    expect(featuredCompanionsForWorld(withVisitor, 'juniper').map((item) => item.id)).toContain('visitor');
  });
});
