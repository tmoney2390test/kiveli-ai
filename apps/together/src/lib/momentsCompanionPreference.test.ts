import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => { storage.set(key, value); return Promise.resolve(); }),
  },
}));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'user-1' } } } })) } },
}));

import {
  explicitMomentsCompanionSelection,
  loadMomentsCompanionSelection,
  restoredMomentsCompanionSelection,
  saveMomentsCompanionSelection,
} from './momentsCompanionPreference';

const companions = [
  { id: 'bianca-id', together_character_templates: { slug: 'bianca', public_handle: 'bianca-de-luca' } },
  { id: 'maya-id', together_character_templates: { slug: 'maya', public_handle: null } },
];

describe('Moments companion preference', () => {
  beforeEach(() => storage.clear());

  it('honors the explicit all-companions URL value', () => {
    expect(explicitMomentsCompanionSelection('all', companions)).toBe('all');
  });

  it('resolves explicit companion ids, slugs, and handles', () => {
    expect(explicitMomentsCompanionSelection('bianca-id', companions)).toBe('bianca-id');
    expect(explicitMomentsCompanionSelection('bianca', companions)).toBe('bianca-id');
    expect(explicitMomentsCompanionSelection('bianca-de-luca', companions)).toBe('bianca-id');
  });

  it('restores all companions instead of the recent-companion fallback', () => {
    expect(restoredMomentsCompanionSelection('all', companions, 'bianca-id')).toBe('all');
  });

  it('falls back safely when a stored companion is no longer available', () => {
    expect(restoredMomentsCompanionSelection('removed-id', companions, 'bianca-id')).toBe('bianca-id');
  });

  it('stores the choice separately for the authenticated user', async () => {
    await saveMomentsCompanionSelection('all');
    expect(await loadMomentsCompanionSelection()).toBe('all');
    expect(storage.get('kivelli:moments-companion-filter:v1:user-1')).toBe('all');
  });
});
