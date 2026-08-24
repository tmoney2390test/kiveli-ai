import { describe, expect, it } from 'vitest';
import { quickStartProfile, skipQuickStartProfile } from './quickStart';

describe('quick-start onboarding payloads', () => {
  it('keeps the selected world and companion together', () => {
    expect(quickStartProfile('character-id', 'world-id', { ageConfirmed: true })).toMatchObject({
      onboardingChoice: 'companion',
      characterTemplateId: 'character-id',
      worldId: 'world-id',
      ageConfirmed: true,
    });
  });

  it('can finish account setup without silently selecting a companion', () => {
    const value = skipQuickStartProfile('world-id', { ageConfirmed: true });
    expect(value).toMatchObject({ onboardingChoice: 'skip', worldId: 'world-id', ageConfirmed: true });
    expect(value.characterTemplateId).toBeUndefined();
  });

  it('never manufactures an adult confirmation from onboarding intent', () => {
    expect(() => quickStartProfile('character-id', 'world-id', { ageConfirmed: false })).toThrow(/18 or older/);
    expect(() => skipQuickStartProfile(undefined, { ageConfirmed: false })).toThrow(/18 or older/);
  });
});
