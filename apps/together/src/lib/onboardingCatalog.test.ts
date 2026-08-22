import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { onboardingCompanionsForWorld, onboardingWorldFantasy, onboardingWorlds } from './onboardingCatalog';

const world = (id: string, sortOrder: number, published = true) => ({
  id, slug: id, name: id, description: `${id} description`, access_type: 'free' as const,
  timezone: 'UTC', sort_order: sortOrder, featured: true, published, visual_context: {}, metadata: {},
});
const companion = (id: string, worldId: string, locationId = `${worldId}-place`) => ({
  id, name: id, slug: id, age: 28, occupation: 'Creative', biography: '', can_be_selected: true,
  lifecycle_status: 'published' as const,
  first_meeting: { world_id: worldId, location_id: locationId, title: 'Meet', setup: 'A first meeting.', companion_activity: 'waiting', mood: 'curious', opening_line: 'Hi' },
  together_character_versions: { id: `${id}-version`, portrait_asset_key: id, interests: [], personality_config: {} },
});

const snapshot = {
  worlds: [world('later', 2), world('first', 0), world('hidden', 1, false)],
  locations: [
    { id: 'first-place', world_id: 'first', name: 'First Place' },
    { id: 'later-place', world_id: 'later', name: 'Later Place' },
  ],
  characters: [], characterWorldPresence: [],
  discoverableCharacters: [
    companion('first-person', 'first'),
    companion('later-person', 'later'),
    companion('broken-meeting', 'first', 'missing-place'),
  ],
} as unknown as Snapshot;

describe('first-login catalog', () => {
  it('shows published worlds in authored order', () => {
    expect(onboardingWorlds(snapshot).map((item) => item.id)).toEqual(['first', 'later']);
  });

  it('only includes companions with a valid first meeting in the selected world', () => {
    expect(onboardingCompanionsForWorld(snapshot, 'first').map((item) => item.id)).toEqual(['first-person']);
    expect(onboardingCompanionsForWorld(snapshot, 'later').map((item) => item.id)).toEqual(['later-person']);
  });

  it('uses authored relationship fantasy copy when available', () => {
    const value = { ...world('first', 0), metadata: { relationshipFantasy: 'A slower kind of connection.' } };
    expect(onboardingWorldFantasy(value)).toBe('A slower kind of connection.');
  });
});
