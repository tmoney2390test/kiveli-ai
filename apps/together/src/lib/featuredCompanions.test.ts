import { describe, expect, it } from 'vitest';
import { featuredCompanionRail, featuredCompanionsForWorld } from './featuredCompanions';
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

  it('caps the Home rail at ten without truncating the full world catalog', () => {
    const roster = Array.from({ length: 14 }, (_, index) => template(`person-${index}`, 'juniper'));
    expect(featuredCompanionRail(roster)).toHaveLength(10);
    expect(featuredCompanionRail(roster, 'any', 1).map((item) => item.id)).toEqual(['person-10', 'person-11', 'person-12', 'person-13']);
    expect(roster).toHaveLength(14);
  });

  it('filters by companion gender before applying the ten-card limit', () => {
    const women = Array.from({ length: 12 }, (_, index) => ({ ...template(`woman-${index}`, 'juniper'), together_character_versions: { ...version(`woman-${index}-version`), pronouns: 'she/her' } }));
    const men = Array.from({ length: 4 }, (_, index) => ({ ...template(`man-${index}`, 'juniper'), together_character_versions: { ...version(`man-${index}-version`), pronouns: 'he/him' } }));
    expect(featuredCompanionRail([...women, ...men], 'female')).toHaveLength(10);
    expect(featuredCompanionRail([...women, ...men], 'male').map((item) => item.id)).toEqual(men.map((item) => item.id));
    expect(featuredCompanionRail([...women, ...men], 'any')).toHaveLength(10);
  });

  it('prefers explicit discovery gender metadata and leaves neutral identities in Any', () => {
    const metadataWoman = { ...template('metadata-woman', 'juniper'), discovery_metadata: { gender: 'female' }, together_character_versions: { ...version('metadata-woman-version'), pronouns: 'they/them' } };
    const neutral = { ...template('neutral', 'juniper'), together_character_versions: { ...version('neutral-version'), pronouns: 'they/them' } };
    expect(featuredCompanionRail([metadataWoman, neutral], 'female').map((item) => item.id)).toEqual(['metadata-woman']);
    expect(featuredCompanionRail([metadataWoman, neutral], 'any').map((item) => item.id)).toEqual(['metadata-woman', 'neutral']);
  });
});
