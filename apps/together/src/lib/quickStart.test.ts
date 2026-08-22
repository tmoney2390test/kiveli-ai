import { describe, expect, it } from 'vitest';
import { quickStartProfile, skipQuickStartProfile } from './quickStart';

describe('quick-start onboarding payloads', () => {
  it('keeps the selected world and companion together', () => {
    expect(quickStartProfile('character-id', 'world-id')).toMatchObject({
      onboardingChoice: 'companion',
      characterTemplateId: 'character-id',
      worldId: 'world-id',
      ageConfirmed: true,
    });
  });

  it('can finish account setup without silently selecting a companion', () => {
    const value = skipQuickStartProfile('world-id');
    expect(value).toMatchObject({ onboardingChoice: 'skip', worldId: 'world-id', ageConfirmed: true });
    expect(value.characterTemplateId).toBeUndefined();
  });
});
