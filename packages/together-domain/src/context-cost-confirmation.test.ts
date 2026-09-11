import { describe, expect, it, vi } from 'vitest';
import { contextCostActivation, contextCostNoticeToken } from './context-cost-confirmation';

describe('paid memory activation', () => {
  it('does not activate Included or unknown preferences', () => {
    const newId = vi.fn(() => 'new');
    expect(contextCostActivation({}, 'included', newId)).toBeNull();
    expect(contextCostActivation({}, 'unknown', newId)).toBeNull();
    expect(newId).not.toHaveBeenCalled();
  });
  it('preserves the activation on unrelated saves and renews it when changed', () => {
    const old = { contextPreference: 'extended_32k', contextCostActivationId: 'first' };
    expect(contextCostActivation(old, 'extended_32k', () => 'new')).toBe('first');
    expect(contextCostActivation(old, 'maximum_64k', () => 'new')).toBe('new');
    const disabled = { contextPreference: 'included', contextCostActivationId: contextCostActivation(old, 'included', () => 'unused') };
    expect(contextCostActivation(disabled, 'extended_32k', () => 'reenabled')).toBe('reenabled');
  });
  it('gives legacy preferences a stable notice and seeds their next saved activation', () => {
    expect(contextCostNoticeToken('extended_32k', undefined)).toBe('extended_32k:legacy');
    expect(contextCostNoticeToken('maximum_64k', 'id')).toBe('maximum_64k:id');
    expect(contextCostNoticeToken('included', 'id')).toBeNull();
    expect(contextCostActivation({ contextPreference: 'extended_32k' }, 'extended_32k', () => 'new')).toBe('new');
  });
});
