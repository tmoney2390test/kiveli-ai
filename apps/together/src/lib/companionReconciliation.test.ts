import { describe, expect, it } from 'vitest';
import { reconcileCompanion } from './companionReconciliation';
import type { CharacterInstance } from '../types';
const previous = { id: 'c', character_version_id: 'v1', together_character_versions: { id: 'v1', portrait_url: 'signed.jpg' } } as CharacterInstance;
describe('custom portrait reconciliation', () => {
  it('preserves signed artwork when a presence delta omits it', () => {
    const next = { ...previous, current_activity: 'Lunch', together_character_versions: { id: 'v1' } } as CharacterInstance;
    const result = reconcileCompanion(previous, next);
    expect(result.current_activity).toBe('Lunch');
    expect(result.together_character_versions.portrait_url).toBe('signed.jpg');
  });
  it('accepts explicit removals and new identity versions', () => {
    expect(reconcileCompanion(previous, { ...previous, together_character_versions: { ...previous.together_character_versions, portrait_url: null } }).together_character_versions.portrait_url).toBeNull();
    const next = { ...previous, character_version_id: 'v2', together_character_versions: { id: 'v2' } } as CharacterInstance;
    expect(reconcileCompanion(previous, next).together_character_versions.portrait_url).toBeUndefined();
  });
});
